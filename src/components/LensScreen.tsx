import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  X,
  MapPin,
  CheckCircle2,
  Compass,
  RefreshCw,
  Scan,
  HelpCircle,
  Plus,
  Check,
  Eye,
  Info,
  Database,
  AlertTriangle,
  WifiOff,
  LocateFixed,
  Image as ImageIcon,
  ArrowRight,
  Maximize2,
} from 'lucide-react';
import { DATASET_STATS } from '../data/monuments';
import { Monument } from '../types';
import { getCategoryPinTheme } from './VeniceGoogleMap';
import { ImageLightboxModal } from './ImageLightboxModal';
import { ArtworkImage } from './ArtworkImage';
import {
  prepareImageForLens,
  captureVideoFrameForLens,
} from '../utils/iosImage';

interface LensScreenProps {
  onSelectMonument: (monument: Monument) => void;
  onOpenGisLocation: (coords: { lat: number; lng: number }) => void;
  onToggleRoute: (monumentId: string) => void;
  isInRoute: (monumentId: string) => boolean;
  onBrowseCatalog?: () => void;
  onOpenCitizenSurvey?: () => void;
}

interface RecognitionResult {
  monument: Monument;
  confidence: number;
  visualEvidence: string;
  detectedCategory?: string;
  engine?: string;
}

type GpsStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable';

export const LensScreen: React.FC<LensScreenProps> = ({
  onSelectMonument,
  onOpenGisLocation,
  onToggleRoute,
  isInRoute,
  onBrowseCatalog,
  onOpenCitizenSurvey,
}) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const [userCoords, setUserCoords] = useState<{
    lat: number;
    lng: number;
    accuracy?: number;
  } | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentMimeType, setCurrentMimeType] = useState<string>('image/jpeg');
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [imagePreviewFailed, setImagePreviewFailed] = useState(false);

  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [noMatchMessage, setNoMatchMessage] = useState<string | null>(null);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const [lastQueryContext, setLastQueryContext] = useState<{
    latitude?: number;
    longitude?: number;
  } | null>(null);

  const [showSurveyInfo, setShowSurveyInfo] = useState(false);
  const [matchedImageFailed, setMatchedImageFailed] = useState<boolean>(false);
  const [lightboxState, setLightboxState] = useState<{
    images: string[];
    index: number;
    title: string;
    subtitle?: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  // Initialize camera stream with iOS Safari constraints and fallbacks
  const startCamera = useCallback(
    async (modeOverride?: 'environment' | 'user') => {
      const targetMode = modeOverride ?? facingMode;
      setCameraError(null);
      setCameraPermissionDenied(false);

      stopCamera();

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setCameraError(
          'Live browser camera requires HTTPS in Safari. Use Take Photo or Photo Library below.'
        );
        return;
      }

      const constraintAttempts: MediaStreamConstraints[] = [
        {
          video: {
            facingMode: { ideal: targetMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        { video: { facingMode: targetMode }, audio: false },
        { video: true, audio: false },
      ];

      let acquiredStream: MediaStream | null = null;
      let lastErr: any = null;

      for (const constraints of constraintAttempts) {
        try {
          acquiredStream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (err: any) {
          lastErr = err;
          if (
            err?.name === 'NotAllowedError' ||
            err?.name === 'PermissionDeniedError'
          ) {
            break;
          }
        }
      }

      if (!acquiredStream) {
        setCameraActive(false);
        const errName = lastErr?.name || '';
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          setCameraPermissionDenied(true);
          setCameraError(
            'Camera permission denied. In iPhone Safari tap aA → Website Settings → Camera → Allow, or use Take Photo / Photo Library below.'
          );
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          setCameraError(
            'No live camera detected. Use Take Photo or Photo Library below to select an image.'
          );
        } else {
          setCameraError(
            'Live camera unavailable in this browser view. Use Take Photo to launch the iPhone camera or choose from Photo Library.'
          );
        }
        return;
      }

      streamRef.current = acquiredStream;
      setCameraActive(true);
    },
    [facingMode, stopCamera]
  );

  // Request GPS location where supported
  const requestGpsLocation = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsStatus('unavailable');
      return;
    }

    setGpsStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
        });
        setGpsStatus('ready');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus('denied');
        } else {
          setGpsStatus('unavailable');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      }
    );
  }, []);

  // Attach iOS Safari inline video attributes whenever stream activates
  useEffect(() => {
    const videoEl = videoRef.current;
    if (cameraActive && videoEl && streamRef.current) {
      videoEl.setAttribute('playsinline', 'true');
      videoEl.setAttribute('webkit-playsinline', 'true');
      videoEl.muted = true;
      videoEl.srcObject = streamRef.current;
      videoEl.play().catch(() => {});
    }
  }, [cameraActive]);

  useEffect(() => {
    startCamera('environment');
    requestGpsLocation();
    return () => {
      stopCamera();
    };
  }, []);

  // Send prepared image + optional GPS coordinates to /api/lens/recognize
  const processImageSearch = useCallback(
    async (
      imageBase64: string,
      options?: {
        mimeType?: string;
        fileName?: string;
        latitude?: number;
        longitude?: number;
      }
    ) => {
      const resolvedMime = options?.mimeType || 'image/jpeg';
      const lat = options?.latitude ?? userCoords?.lat;
      const lng = options?.longitude ?? userCoords?.lng;

      setAnalyzing(true);
      setCurrentImage(imageBase64);
      setCurrentMimeType(resolvedMime);
      setCurrentFileName(options?.fileName || null);
      setImagePreviewFailed(false);
      setResult(null);
      setNoMatchMessage(null);
      setRecognitionError(null);
      setLastQueryContext({
        latitude: lat,
        longitude: lng,
      });

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => (t.enabled = false));
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setAnalyzing(false);
        setRecognitionError(
          'You appear to be offline. Reconnect to cellular data or Wi-Fi and tap Retry Match.'
        );
        return;
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 45000);

      try {
        const response = await fetch('/api/lens/recognize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            imageBase64,
            mimeType: resolvedMime,
            latitude: lat,
            longitude: lng,
          }),
        });

        let data: any = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }

        if (!response.ok) {
          throw new Error(
            data?.error || `Recognition service returned status ${response.status}.`
          );
        }

        if (data?.matched === false) {
          setNoMatchMessage(
            data?.message ||
              'This artifact is not currently catalogued in the PreserVenice database.'
          );
          return;
        }

        if (data?.match?.monument) {
          const matchedMonument: Monument = data.match.monument;

          setMatchedImageFailed(false);
          setResult({
            monument: matchedMonument,
            confidence: data.match.confidence || 96,
            visualEvidence:
              data.match.visualEvidence ||
              `Matched Survey123 record ${matchedMonument.surveyCode} (${matchedMonument.category} • ${matchedMonument.regionDisplay}).`,
            detectedCategory: data.match.detectedCategory || matchedMonument.category,
            engine: data.match.engine || 'PreserVenice Visual Lens Engine',
          });
          return;
        }

        throw new Error('Unexpected response from recognition service.');
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          setRecognitionError(
            'Recognition request timed out on your connection. Please tap Retry Match or try a closer photo.'
          );
        } else {
          setRecognitionError(
            err?.message ||
              'Network error contacting the Gemini recognition service. Check your connection and try again.'
          );
        }
      } finally {
        window.clearTimeout(timeoutId);
        setAnalyzing(false);
      }
    },
    [userCoords]
  );

  // Handle pasted screenshots on desktop/iPad
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            try {
              const prepared = await prepareImageForLens(blob);
              processImageSearch(prepared.dataUrl, {
                mimeType: prepared.mimeType,
                fileName: prepared.fileName,
              });
            } catch (err: any) {
              setRecognitionError(err?.message || 'Unable to read pasted screenshot.');
            }
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processImageSearch]);

  // Capture frame from live WebRTC viewfinder, or fall back to native iPhone camera
  const handleCapturePhoto = () => {
    if (!cameraActive || !videoRef.current || !videoRef.current.videoWidth) {
      nativeCameraInputRef.current?.click();
      return;
    }

    try {
      const dataUrl = captureVideoFrameForLens(videoRef.current, canvasRef.current);
      processImageSearch(dataUrl, { mimeType: 'image/jpeg' });
    } catch (err: any) {
      setRecognitionError(err?.message || 'Could not capture frame from camera.');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset value immediately so selecting or retaking the same filename works on iOS Safari
    e.target.value = '';
    if (!file) return;

    try {
      setRecognitionError(null);
      setNoMatchMessage(null);
      const prepared = await prepareImageForLens(file);
      await processImageSearch(prepared.dataUrl, {
        mimeType: prepared.mimeType,
        fileName: prepared.fileName,
      });
    } catch (err: any) {
      setRecognitionError(
        err?.message || 'Could not process the selected photo. Please try another JPEG, PNG, or HEIC image.'
      );
    }
  };

  const handleRetryCurrentImage = () => {
    if (!currentImage) return;
    processImageSearch(currentImage, {
      mimeType: currentMimeType,
      fileName: currentFileName || undefined,
      latitude: lastQueryContext?.latitude,
      longitude: lastQueryContext?.longitude,
    });
  };

  const handleResetSearch = () => {
    setResult(null);
    setNoMatchMessage(null);
    setRecognitionError(null);
    setCurrentImage(null);
    setCurrentFileName(null);
    setImagePreviewFailed(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => (t.enabled = true));
      setCameraActive(true);
    } else {
      startCamera(facingMode);
    }
  };

  const handleToggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  const categoryTheme = result ? getCategoryPinTheme(result.monument.category) : null;
  const hasFeedbackOverlay = !result && (!!noMatchMessage || !!recognitionError);

  return (
    <div className="pt-2 pb-24 px-4 sm:px-6 max-w-4xl mx-auto w-full animate-in fade-in duration-200">
      <canvas ref={canvasRef} className="hidden" />

      {/* Hidden Dual Native Inputs for iPhone Safari */}
      {/* 1. Photo Library / Files (accepts JPEG, PNG, WebP, HEIC/HEIF without capture override) */}
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png,.webp"
        onChange={handleFileSelect}
        className="hidden"
        id="lens-file-upload"
      />
      {/* 2. Native iPhone Camera (explicit capture="environment") */}
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
        id="lens-native-camera"
      />

      {/* Top Header */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-[#b91c1c] uppercase mb-0.5">
            <Sparkles className="w-3.5 h-3.5 text-[#b91c1c] shrink-0" />
            <span className="truncate">VENICE SURVEY123 VISUAL INDEX</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#111827] tracking-tight flex flex-wrap items-center gap-2">
            <span>PreserVenice Lens</span>
            <span className="bg-[#fee2e2] text-[#b91c1c] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
              {DATASET_STATS.totalArtworks} WORKS
            </span>
          </h1>
          <p className="text-xs text-[#6b7280] mt-0.5">
            Take a photo or choose from your library to match Venice statues, reliefs, and monuments
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowSurveyInfo(!showSurveyInfo)}
          className="shrink-0 p-2.5 rounded-2xl bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] hover:text-[#111827] transition cursor-pointer"
          title="ArcGIS Survey123 Dataset Schema"
          aria-label="Dataset Info"
          aria-expanded={showSurveyInfo}
        >
          <HelpCircle className="w-4 h-4 text-[#b91c1c]" />
        </button>
      </div>

      {/* GPS Location Status Bar (Graceful permission & acquisition feedback) */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 bg-[#f9fafb] border border-[#e5e7eb] rounded-2xl px-3 py-2 text-[11px]">
        <div className="flex items-center gap-2 min-w-0">
          <LocateFixed
            className={`w-3.5 h-3.5 shrink-0 ${
              gpsStatus === 'ready'
                ? 'text-[#059669]'
                : gpsStatus === 'denied'
                ? 'text-[#b91c1c]'
                : 'text-[#0284c7]'
            } ${gpsStatus === 'requesting' ? 'animate-spin' : ''}`}
          />
          <span className="text-[#374151] truncate">
            {gpsStatus === 'ready' && userCoords
              ? `GPS: ${userCoords.lat.toFixed(4)}° N, ${userCoords.lng.toFixed(4)}° E${
                  userCoords.accuracy ? ` (±${userCoords.accuracy}m)` : ''
                }`
              : gpsStatus === 'requesting'
              ? 'Requesting iPhone GPS coordinates...'
              : gpsStatus === 'denied'
              ? 'Location access denied (visual matching still active)'
              : 'Location optional — tap to attach GPS context'}
          </span>
        </div>

        <button
          type="button"
          onClick={requestGpsLocation}
          className="shrink-0 font-bold text-[#0284c7] hover:underline cursor-pointer"
        >
          {gpsStatus === 'ready' ? 'Refresh GPS' : 'Enable GPS'}
        </button>
      </div>

      {/* Survey123 Schema Info Banner */}
      {showSurveyInfo && (
        <div className="mb-4 bg-gradient-to-r from-[#131b2e] to-[#1e293b] text-white p-4 rounded-3xl text-xs space-y-2 border border-white/10 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-[#93ccff]">
              <Info className="w-4 h-4 text-[#ff6d4d]" />
              <span>Imported Survey123 Venice Schema</span>
            </div>
            <button onClick={() => setShowSurveyInfo(false)} className="text-white/60 hover:text-white cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          <ul className="text-[11px] text-[#bec6e0] list-disc list-inside space-y-1 pl-1">
            <li>
              <strong>Records Loaded:</strong> {DATASET_STATS.totalArtworks} artworks ({DATASET_STATS.statuesCount} Statues, {DATASET_STATS.reliefsCount} Reliefs, {DATASET_STATS.monumentsCount} Monument) across {DATASET_STATS.regionsCount} Venice sestieri &amp; islands.
            </li>
            <li>
              <strong>Reference Photos:</strong> {DATASET_STATS.accessibleArchiveImagesCount} of {DATASET_STATS.manifestAttachmentsCount} manifest reference photos loaded on disk across all {DATASET_STATS.totalArtworks} artworks.
            </li>
            <li><strong>iPhone Formats Supported:</strong> Live Safari camera capture, native iPhone Camera app, JPEG, PNG screenshots, WebP, and HEIC/HEIF photos.</li>
            <li><strong>Recorded Fields:</strong> GlobalID, coordinates, region, type, <code className="bg-white/10 px-1 rounded text-white font-mono">general_notes</code>, <code className="bg-white/10 px-1 rounded text-white font-mono">CreationDate</code>, <code className="bg-white/10 px-1 rounded text-white font-mono">Creator</code>.</li>
            <li><strong>Null / Unrecorded Fields:</strong> Unrecorded <code className="bg-white/10 px-1 rounded text-white font-mono">artist</code> &amp; <code className="bg-white/10 px-1 rounded text-white font-mono">artworks_date</code> fields are displayed honestly without fabrication.</li>
          </ul>
        </div>
      )}

      {/* Main Viewport: Recognition Error / No Match / Live Viewfinder / Match Result */}
      {hasFeedbackOverlay ? (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-200">
          <div className="bg-white rounded-3xl overflow-hidden shadow-lg border border-[#e5e7eb]">
            <div
              className={`p-4 flex items-center justify-between text-white ${
                recognitionError ? 'bg-[#7f1d1d]' : 'bg-[#131b2e]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {recognitionError ? (
                  <WifiOff className="w-5 h-5 text-red-200 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0" />
                )}
                <div>
                  <h2 className="font-display font-bold text-sm">
                    {recognitionError ? 'Recognition Request Failed' : 'Artifact Not Currently Catalogued'}
                  </h2>
                  <p className="text-[11px] text-white/80">
                    {recognitionError
                      ? 'Could not complete recognition with the server'
                      : `${DATASET_STATS.totalArtworks}-artwork Venice Survey123 catalog`}
                  </p>
                </div>
              </div>
              <button
                onClick={handleResetSearch}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition cursor-pointer"
                aria-label="Close notice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {currentImage && (
                <div className="flex items-center gap-3 bg-[#f9fafb] p-3 rounded-2xl border border-[#e5e7eb]">
                  {!imagePreviewFailed ? (
                    <img
                      src={currentImage}
                      alt="Submitted query"
                      onError={() => setImagePreviewFailed(true)}
                      className="w-16 h-16 rounded-xl object-cover border border-[#e2e8f0] shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-[#e5e7eb] text-[#4b5563] flex flex-col items-center justify-center text-[9px] font-bold px-1 text-center shrink-0">
                      <ImageIcon className="w-5 h-5 mb-0.5 text-[#b91c1c]" />
                      <span>HEIC</span>
                    </div>
                  )}
                  <div className="text-xs text-[#374151] leading-relaxed min-w-0">
                    <p className="font-semibold text-[#111827] mb-0.5">
                      {recognitionError
                        ? 'Network or Service Error'
                        : 'This artifact is not currently catalogued.'}
                    </p>
                    <p className="text-[#4b5563] break-words">
                      {recognitionError ||
                        (noMatchMessage &&
                        noMatchMessage !==
                          'This artifact is not currently catalogued in the PreserVenice database.'
                          ? noMatchMessage
                          : 'No matching item was found in the PreserVenice database. You can log this artwork directly via the CITIZEN GIS SURVEY below.')}
                    </p>
                  </div>
                </div>
              )}

              {!currentImage && recognitionError && (
                <p className="text-xs text-[#7f1d1d] bg-[#fef2f2] border border-[#fecaca] p-3 rounded-2xl">
                  {recognitionError}
                </p>
              )}

              {!recognitionError && onOpenCitizenSurvey && (
                <button
                  type="button"
                  onClick={onOpenCitizenSurvey}
                  className="w-full p-3.5 rounded-2xl bg-[#111827] hover:bg-black text-white flex items-center justify-between gap-3 transition active:scale-[0.99] cursor-pointer shadow-sm"
                >
                  <div className="text-left min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-red-300">
                      Help Catalogue Venetian Heritage
                    </div>
                    <div className="text-xs font-bold text-white mt-0.5">
                      Log this uncatalogued artifact in the{' '}
                      <span className="underline text-[#ff6d4d]">CITIZEN GIS SURVEY</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#ff6d4d] shrink-0" />
                </button>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {currentImage && (
                  <button
                    onClick={handleRetryCurrentImage}
                    disabled={analyzing}
                    className="w-full py-3 bg-[#b91c1c] hover:bg-[#991b1b] text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${analyzing ? 'animate-spin' : ''}`} />
                    <span>{recognitionError ? 'Retry Match' : 'Re-analyze Photo'}</span>
                  </button>
                )}

                <button
                  onClick={handleResetSearch}
                  className="w-full py-3 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#111827] rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-[#b91c1c]" />
                  <span>Try Another Photo</span>
                </button>

                {!recognitionError && onBrowseCatalog && (
                  <button
                    onClick={onBrowseCatalog}
                    className="sm:col-span-2 w-full py-2.5 bg-white border border-[#e5e7eb] hover:bg-[#f9fafb] text-[#111827] rounded-2xl text-xs font-bold transition cursor-pointer"
                  >
                    Browse All {DATASET_STATS.totalArtworks} Venice Artworks
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : !result ? (
        <div className="space-y-3.5">
          {/* Viewfinder Container sized for modern iPhones */}
          <div className="relative w-full h-[42svh] min-h-[240px] max-h-[380px] sm:h-auto sm:aspect-video rounded-3xl overflow-hidden bg-black shadow-xl border border-[#e2e8f0] flex items-center justify-center">
            {cameraActive ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="p-5 text-center text-white/80 space-y-3">
                <Camera className="w-10 h-10 mx-auto text-white/50" />
                <div className="text-sm font-bold text-white">
                  {cameraPermissionDenied ? 'Safari Camera Access Needed' : 'Use iPhone Camera or Library'}
                </div>
                <p className="text-xs text-white/70 max-w-xs mx-auto leading-relaxed">
                  {cameraError ||
                    'Tap Take Photo to open your iPhone camera directly, or pick an existing photo from your library.'}
                </p>
                <div className="flex flex-wrap gap-2 justify-center pt-1">
                  <button
                    type="button"
                    onClick={() => nativeCameraInputRef.current?.click()}
                    className="px-4 py-2 bg-[#b91c1c] hover:bg-[#991b1b] text-white rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Take Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startCamera(facingMode)}
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Live View</span>
                  </button>
                </div>
              </div>
            )}

            {/* Reticle Overlay */}
            <div className="absolute inset-0 pointer-events-none p-5 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="w-7 h-7 border-t-3 border-l-3 border-white rounded-tl-xl shadow-xs"></div>
                <div className="bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1 rounded-full border border-white/20 flex items-center gap-1.5 shadow-md">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      cameraActive ? 'bg-[#10b981] animate-ping' : 'bg-amber-400'
                    }`}
                  ></span>
                  <span>{cameraActive ? 'Venice Lens Active' : 'Camera Ready'}</span>
                </div>
                <div className="w-7 h-7 border-t-3 border-r-3 border-white rounded-tr-xl shadow-xs"></div>
              </div>

              {cameraActive && (
                <div className="relative w-full h-0.5 bg-gradient-to-r from-transparent via-[#ff6d4d] to-transparent shadow-[0_0_12px_#ff6d4d] animate-pulse"></div>
              )}

              <div className="flex justify-between items-end">
                <div className="w-7 h-7 border-b-3 border-l-3 border-white rounded-bl-xl shadow-xs"></div>
                <div className="text-[10px] text-white/80 font-mono bg-black/40 backdrop-blur-xs px-2.5 py-0.5 rounded-full">
                  {DATASET_STATS.totalArtworks} Survey123 Catalog Works
                </div>
                <div className="w-7 h-7 border-b-3 border-r-3 border-white rounded-br-xl shadow-xs"></div>
              </div>
            </div>

            {analyzing && (
              <div className="absolute inset-0 bg-black/75 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6 text-center text-white animate-in fade-in duration-200">
                <div className="w-14 h-14 rounded-full border-4 border-[#ff6d4d]/30 border-t-[#ff6d4d] animate-spin mb-3"></div>
                <h3 className="font-display font-bold text-base sm:text-lg">
                  Matching Against Venice Index...
                </h3>
                <p className="text-xs text-[#bec6e0] mt-1 max-w-xs leading-relaxed">
                  Comparing visual geometry and stonework across indexed Survey123 artwork records.
                </p>
              </div>
            )}
          </div>

          {/* Viewfinder Controls */}
          <div className="bg-white rounded-3xl p-3 sm:p-4 shadow-sm border border-[#e5e7eb] space-y-2.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
              <label
                htmlFor="lens-file-upload"
                className="w-full min-w-0 py-2.5 px-2 sm:py-3 sm:px-3 bg-[#f3f4f6] hover:bg-[#e5e7eb] active:scale-95 text-[#111827] rounded-2xl text-[11px] sm:text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-center leading-tight transition cursor-pointer"
              >
                <Upload className="w-4 h-4 text-[#b91c1c] shrink-0" />
                <span className="sm:whitespace-nowrap">Photo Library</span>
              </label>

              <button
                type="button"
                onClick={handleCapturePhoto}
                disabled={analyzing}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#b91c1c] hover:bg-[#991b1b] active:scale-90 text-white flex items-center justify-center shadow-lg transition cursor-pointer disabled:opacity-40 shrink-0"
                title={cameraActive ? 'Capture from live viewfinder' : 'Take photo with iPhone camera'}
                aria-label="Capture photo"
              >
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-white flex items-center justify-center">
                  <Scan className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
              </button>

              {cameraActive ? (
                <button
                  type="button"
                  onClick={handleToggleFacingMode}
                  className="w-full min-w-0 py-2.5 px-2 sm:py-3 sm:px-3 bg-[#f3f4f6] hover:bg-[#e5e7eb] active:scale-95 text-[#111827] rounded-2xl text-[11px] sm:text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-center leading-tight transition cursor-pointer"
                  title="Flip Camera"
                >
                  <RefreshCw className="w-4 h-4 text-[#4b5563] shrink-0" />
                  <span className="sm:whitespace-nowrap">Flip Camera</span>
                </button>
              ) : (
                <label
                  htmlFor="lens-native-camera"
                  className="w-full min-w-0 py-2.5 px-2 sm:py-3 sm:px-3 bg-[#fee2e2]/70 hover:bg-[#fee2e2] active:scale-95 text-[#b91c1c] rounded-2xl text-[11px] sm:text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-center leading-tight transition cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-[#b91c1c] shrink-0" />
                  <span className="sm:whitespace-nowrap">Take Photo</span>
                </label>
              )}
            </div>

            {cameraActive && (
              <div className="pt-2 border-t border-[#f3f4f6] flex items-center justify-center">
                <label
                  htmlFor="lens-native-camera"
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#b91c1c] hover:underline cursor-pointer py-0.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Or open native iPhone Camera app (HDR &amp; macro focus)</span>
                </label>
              </div>
            )}
          </div>

        </div>
      ) : (
        /* Recognition Match Result Card */
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-white rounded-3xl overflow-hidden shadow-xl border-2 border-[#b91c1c]">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#131b2e] to-[#0f172a] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-[#10b981]/20 text-[#10b981] flex items-center justify-center font-black shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-bold text-sm">
                      Visual Match Identified
                    </span>
                    <span className="bg-[#10b981] text-white text-[9px] font-black px-2 py-0.5 rounded-full">
                      {result.confidence}% Match
                    </span>
                  </div>
                  <div className="text-[10px] text-[#93ccff] font-mono truncate">
                    {result.engine}
                  </div>
                </div>
              </div>

              <button
                onClick={handleResetSearch}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer shrink-0"
                title="Scan another artwork"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5">
              {/* Query vs Database Photo */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button
                  type="button"
                  disabled={!currentImage || imagePreviewFailed}
                  onClick={() => {
                    if (!currentImage || imagePreviewFailed) return;
                    setLightboxState({
                      images: [currentImage],
                      index: 0,
                      title: 'Submitted Query Photo',
                      subtitle: result.monument.title,
                    });
                  }}
                  className="relative rounded-2xl overflow-hidden border border-[#e2e8f0] aspect-square bg-[#f3f4f6] flex items-center justify-center cursor-zoom-in disabled:cursor-default group"
                  title="Click to enlarge query photo"
                >
                  {currentImage && !imagePreviewFailed ? (
                    <img
                      src={currentImage}
                      alt="Your query"
                      onError={() => setImagePreviewFailed(true)}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="text-center p-3 text-[#4b5563]">
                      <ImageIcon className="w-6 h-6 mx-auto mb-1 text-[#b91c1c]" />
                      <div className="text-[10px] font-bold">HEIC Photo</div>
                      {currentFileName && (
                        <div className="text-[9px] truncate max-w-[110px]">{currentFileName}</div>
                      )}
                    </div>
                  )}
                  <span className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-xs text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                    Query Photo
                  </span>
                  {currentImage && !imagePreviewFailed && (
                    <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
                      <Maximize2 className="w-3 h-3" />
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  disabled={matchedImageFailed}
                  onClick={() => {
                    if (matchedImageFailed) return;
                    const gallery =
                      result.monument.galleryImages.length > 0
                        ? result.monument.galleryImages
                        : [result.monument.imageUrl];
                    setLightboxState({
                      images: gallery,
                      index: 0,
                      title: result.monument.title,
                      subtitle: result.monument.surveyCode,
                    });
                  }}
                  className="relative rounded-2xl overflow-hidden border border-[#e2e8f0] aspect-square bg-[#f3f4f6] cursor-zoom-in disabled:cursor-default group"
                  title="Click to enlarge artwork photo"
                >
                  <ArtworkImage
                    src={result.monument.imageUrl}
                    alt={result.monument.title}
                    surveyCode={result.monument.surveyCode}
                    regionLabel={result.monument.regionDisplay}
                    onStatusChange={(ok) => setMatchedImageFailed(!ok)}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <span className="absolute bottom-2 left-2 bg-[#b91c1c] text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                    Survey123 Match
                  </span>
                  {!matchedImageFailed && (
                    <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
                      <Maximize2 className="w-3 h-3" />
                    </span>
                  )}
                </button>
              </div>

              {/* Additional angles if artwork has 2 photos */}
              {result.monument.galleryImages.length > 1 && (
                <div className="mb-4 flex flex-wrap items-center gap-2 text-[10px] text-[#6b7280] bg-[#f9fafb] p-2.5 rounded-2xl border border-[#e5e7eb]">
                  <span className="font-bold uppercase tracking-wider shrink-0">
                    All Record Photos ({result.monument.galleryImages.length}):
                  </span>
                  {result.monument.galleryImages.map((imgUrl, idx) => (
                    <button
                      type="button"
                      key={imgUrl}
                      onClick={() =>
                        setLightboxState({
                          images: result.monument.galleryImages,
                          index: idx,
                          title: result.monument.title,
                          subtitle: result.monument.surveyCode,
                        })
                      }
                      className="w-10 h-10 rounded-lg overflow-hidden border border-[#e2e8f0] hover:border-[#b91c1c] transition cursor-zoom-in shrink-0"
                      title={`Enlarge angle ${idx + 1}`}
                    >
                      <img
                        src={imgUrl}
                        alt={`Angle ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Title & Category */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${
                        categoryTheme ? categoryTheme.bg : 'bg-black'
                      }`}
                    >
                      {result.monument.category}
                    </span>
                    <span className="text-[10px] font-mono text-[#6b7280]">
                      {result.monument.surveyCode} • {result.monument.creationDate.split(' ')[0]}
                    </span>
                  </div>
                  <h2 className="font-display font-bold text-lg sm:text-xl text-[#111827] leading-snug">
                    {result.monument.title}
                  </h2>
                  <div className="text-xs text-[#4b5563] font-medium mt-0.5">
                    Artist: {result.monument.artist || 'Not recorded in Survey123'}
                    {' • '}
                    Date: {result.monument.year || 'Not recorded'}
                  </div>
                </div>

                <button
                  onClick={() => onToggleRoute(result.monument.id)}
                  className={`p-2.5 rounded-2xl border transition active:scale-95 cursor-pointer shrink-0 ${
                    isInRoute(result.monument.id)
                      ? 'bg-[#b91c1c] text-white border-[#b91c1c]'
                      : 'bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#111827] border-transparent'
                  }`}
                  title={isInRoute(result.monument.id) ? 'In Route' : 'Add to Route'}
                >
                  {isInRoute(result.monument.id) ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Survey123 Coordinates & GlobalID */}
              <div className="bg-[#f9fafb] rounded-2xl p-3 border border-[#e5e7eb] text-xs space-y-1.5 mb-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[#111827]">
                  <span className="flex items-center gap-1.5 font-bold min-w-0">
                    <MapPin className="w-3.5 h-3.5 text-[#b91c1c] shrink-0" />
                    <span className="truncate">{result.monument.locationName}</span>
                  </span>
                  <span className="text-[10px] font-mono text-[#6b7280] shrink-0">
                    Creator: {result.monument.creator}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6b7280] font-mono">
                  <span>{result.monument.coordinates.formatted}</span>
                  <span className="text-[#334155] bg-[#e2e8f0] px-2 py-0.5 rounded-full font-bold text-[10px] shrink-0">
                    3D: {result.monument.modelCapturedRaw}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#6b7280] break-all pt-1 border-t border-[#e5e7eb]">
                  <Database className="w-3 h-3 text-[#0284c7] shrink-0" />
                  <span>GlobalID: {result.monument.arcgisGlobalId}</span>
                </div>
              </div>

              {/* Visual Recognition Evidence */}
              <div className="bg-[#fff7ed] border border-[#ffedd5] rounded-2xl p-3 text-xs mb-3 text-[#9a3412]">
                <div className="font-bold flex items-center gap-1.5 mb-1 text-[#c2410c]">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Visual Recognition Evidence</span>
                </div>
                <p className="leading-relaxed text-[11px]">{result.visualEvidence}</p>
              </div>

              {/* Recorded General Notes */}
              <div className="text-xs text-[#4b5563] space-y-1.5 mb-4 leading-relaxed bg-[#f9fafb] p-3 rounded-xl border border-[#e5e7eb]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#6b7280]">
                  Survey123 General Notes
                </div>
                <p>
                  {result.monument.generalNotes ||
                    'No field notes recorded for this artwork in Survey123.'}
                </p>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-[#e5e7eb]">
                <button
                  onClick={() => onSelectMonument(result.monument)}
                  className="w-full py-3 bg-[#111827] hover:bg-black text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95 shadow-sm cursor-pointer"
                >
                  <Eye className="w-4 h-4 text-[#fee2e2]" />
                  <span>View Survey123 Record</span>
                </button>

                <button
                  onClick={() => onOpenGisLocation(result.monument.coordinates)}
                  className="w-full py-3 bg-[#0284c7] hover:bg-[#0369a1] text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95 shadow-sm cursor-pointer"
                >
                  <Compass className="w-4 h-4" />
                  <span>Locate on GIS Map</span>
                </button>
              </div>
            </div>
          </div>

          <div className="text-center pt-2">
            <button
              onClick={handleResetSearch}
              className="px-6 py-2.5 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-xs font-bold text-[#111827] rounded-full transition active:scale-95 cursor-pointer flex items-center gap-2 mx-auto shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#b91c1c]" />
              <span>Scan Another Artwork</span>
            </button>
          </div>
        </div>
      )}

      <ImageLightboxModal
        isOpen={Boolean(lightboxState)}
        images={lightboxState?.images || []}
        currentIndex={lightboxState?.index || 0}
        title={lightboxState?.title}
        subtitle={lightboxState?.subtitle}
        onClose={() => setLightboxState(null)}
        onChangeIndex={(idx) =>
          setLightboxState((prev) => (prev ? { ...prev, index: idx } : null))
        }
      />
    </div>
  );
};
