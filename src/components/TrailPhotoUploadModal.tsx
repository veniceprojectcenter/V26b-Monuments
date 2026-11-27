import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Image as ImageIcon,
  LogOut,
  MapPin,
  RefreshCw,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { CuratedTrail } from '../types';
import {
  captureSelfieVideoFrame,
  prepareTrailPhotoForUpload,
} from '../utils/iosImage';
import { TrailPhoto, uploadTrailPhoto } from '../services/trailPhotos';

interface TrailPhotoUploadModalProps {
  isOpen: boolean;
  trail: CuratedTrail;
  stopTitle?: string;
  userLocation?: { lat: number; lng: number } | null;
  onClose: () => void;
  onPhotoUploaded?: (photo: TrailPhoto) => void;
  onViewTrailPhotos?: (trail: CuratedTrail) => void;
}

export const TrailPhotoUploadModal: React.FC<TrailPhotoUploadModalProps> = ({
  isOpen,
  trail,
  stopTitle,
  userLocation,
  onClose,
  onPhotoUploaded,
  onViewTrailPhotos,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => auth.currentUser);
  const [authorName, setAuthorName] = useState<string>(() => auth.currentUser?.displayName || '');
  const [caption, setCaption] = useState('');
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  const [liveCameraActive, setLiveCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadedPhoto, setUploadedPhoto] = useState<TrailPhoto | null>(null);

  const selfieCameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopLiveCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setLiveCameraActive(false);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user?.displayName) {
        setAuthorName((prev) => prev.trim() || user.displayName || '');
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopLiveCamera();
      setPreviewDataUrl(null);
      setCaption('');
      setCameraError(null);
      setErrorMessage(null);
      setUploadedPhoto(null);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, stopLiveCamera, onClose]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (liveCameraActive && videoEl && streamRef.current) {
      videoEl.setAttribute('playsinline', 'true');
      videoEl.setAttribute('webkit-playsinline', 'true');
      videoEl.muted = true;
      videoEl.srcObject = streamRef.current;
      videoEl.play().catch(() => {});
    }
  }, [liveCameraActive]);

  const startLiveCamera = useCallback(
    async (mode: 'user' | 'environment' = facingMode) => {
      setCameraError(null);
      setErrorMessage(null);
      stopLiveCamera();

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setCameraError(
          'Live browser camera requires HTTPS. Tap Take Selfie below to open your phone camera.'
        );
        return;
      }

      const attempts: MediaStreamConstraints[] = [
        { video: { facingMode: { ideal: mode }, width: { ideal: 1080 }, height: { ideal: 1080 } }, audio: false },
        { video: { facingMode: mode }, audio: false },
        { video: true, audio: false },
      ];

      let acquired: MediaStream | null = null;
      let lastErr: any = null;

      for (const constraints of attempts) {
        try {
          acquired = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (err: any) {
          lastErr = err;
          if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
            break;
          }
        }
      }

      if (!acquired) {
        const name = lastErr?.name || '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setCameraError(
            'Camera permission denied. Tap Take Selfie to use your device camera or choose from Photo Library.'
          );
        } else {
          setCameraError(
            'Live camera preview unavailable here. Use Take Selfie or Photo Library below.'
          );
        }
        return;
      }

      streamRef.current = acquired;
      setLiveCameraActive(true);
    },
    [facingMode, stopLiveCamera]
  );

  const handleCaptureLiveFrame = () => {
    if (!videoRef.current || !videoRef.current.videoWidth) return;
    try {
      const dataUrl = captureSelfieVideoFrame(videoRef.current);
      setPreviewDataUrl(dataUrl);
      stopLiveCamera();
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to capture photo from live viewfinder.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsProcessingImage(true);
    setErrorMessage(null);
    setCameraError(null);
    stopLiveCamera();

    try {
      const compressedDataUrl = await prepareTrailPhotoForUpload(file);
      setPreviewDataUrl(compressedDataUrl);
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Could not process this photo. Please try taking a new photo or choosing a JPEG/PNG.'
      );
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setIsAuthenticating(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user?.displayName) {
        setAuthorName((prev) => prev.trim() || cred.user.displayName || '');
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setErrorMessage('Google sign-in was cancelled. Sign in when ready to post your public trail photo.');
      } else if (code === 'auth/popup-blocked') {
        setErrorMessage(
          'Your browser blocked the sign-in popup. Allow popups for this site and tap Sign in with Google again.'
        );
      } else {
        setErrorMessage(err?.message || 'Unable to complete Google sign-in right now.');
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handlePublishPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewDataUrl) {
      setErrorMessage('Please take or select a photo of yourself first.');
      return;
    }
    if (!auth.currentUser) {
      await handleGoogleSignIn();
      if (!auth.currentUser) return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    try {
      const created = await uploadTrailPhoto({
        trail,
        imageDataUrl: previewDataUrl,
        caption,
        authorName: authorName.trim() || auth.currentUser?.displayName || 'Venice Explorer',
        stopTitle,
        lat: userLocation?.lat,
        lng: userLocation?.lng,
      });
      setUploadedPhoto(created);
      onPhotoUploaded?.(created);
    } catch (err: any) {
      const rawMsg = err?.message || 'Failed to upload trail photo.';
      if (rawMsg.includes('permission') || rawMsg.includes('PERMISSION_DENIED')) {
        setErrorMessage(
          'Upload permission was denied. Make sure you are signed in with a verified Google account and try again.'
        );
      } else if (rawMsg.includes('Quota exceeded')) {
        setErrorMessage('Daily database quota reached. Please try again tomorrow.');
      } else {
        setErrorMessage(rawMsg);
      }
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Take and upload route photo"
    >
      {/* Hidden iPhone front-camera & library inputs */}
      <input
        ref={selfieCameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleFileChange}
        className="hidden"
        id="trail-selfie-camera-input"
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png,.webp"
        onChange={handleFileChange}
        className="hidden"
        id="trail-photo-library-input"
      />

      <div
        className="bg-white w-full max-w-lg max-h-[92dvh] sm:rounded-3xl rounded-t-3xl overflow-hidden flex flex-col shadow-2xl border border-[#e5e7eb]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-[#131b2e] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#b91c1c] flex items-center justify-center text-white shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-base truncate">
                Trail Selfie &amp; Route Photo
              </h3>
              <p className="text-[11px] text-[#93ccff] truncate">
                {trail.number} · {trail.title}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer shrink-0"
            aria-label="Close photo upload"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {uploadedPhoto ? (
          /* Success Screen */
          <div className="p-5 sm:p-6 overflow-y-auto overscroll-contain subtle-scrollbar space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-[#ecfdf5] text-[#059669] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h4 className="font-display font-bold text-lg text-[#111827]">
                Added to {trail.title}
              </h4>
              <p className="text-xs text-[#6b7280] mt-1">
                Your photo is now public at the bottom of this trail&apos;s menu in Routes.
              </p>
            </div>

            <div className="rounded-2xl overflow-hidden border border-[#e5e7eb] bg-[#111827] max-h-64 flex items-center justify-center">
              <img
                src={uploadedPhoto.imageDataUrl}
                alt={uploadedPhoto.caption || 'Uploaded trail selfie'}
                className="max-h-64 w-auto object-contain"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {onViewTrailPhotos && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onViewTrailPhotos(trail);
                  }}
                  className="w-full py-3 px-4 rounded-2xl bg-[#111827] hover:bg-black text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4 text-[#ff6d4d]" />
                  <span>View in Trail Menu</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 px-4 rounded-2xl bg-[#b91c1c] hover:bg-[#991b1b] text-white text-xs font-bold transition cursor-pointer"
              >
                Back to GIS Map
              </button>
            </div>
          </div>
        ) : (
          /* Capture + Details Form */
          <form onSubmit={handlePublishPhoto} className="p-5 overflow-y-auto overscroll-contain subtle-scrollbar space-y-4">
            <div className="bg-[#f9fafb] border border-[#e5e7eb] rounded-2xl px-3.5 py-2.5 text-xs text-[#374151]">
              <p className="font-semibold text-[#111827]">
                Take a photo of yourself along this curated trail
              </p>
              <p className="text-[11px] text-[#6b7280] mt-0.5">
                Posted photos appear publicly at the bottom of {trail.title} so fellow walkers can browse them.
              </p>
            </div>

            {/* Camera / Preview Frame */}
            {previewDataUrl ? (
              <div className="space-y-2">
                <div className="relative rounded-2xl overflow-hidden border border-[#e5e7eb] bg-[#111827] flex items-center justify-center max-h-72">
                  <img
                    src={previewDataUrl}
                    alt="Route selfie preview"
                    className="max-h-72 w-auto object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setPreviewDataUrl(null)}
                    className="absolute top-2.5 right-2.5 px-3 py-1.5 rounded-full bg-black/75 hover:bg-black text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-300" />
                    <span>Retake</span>
                  </button>
                </div>
              </div>
            ) : liveCameraActive ? (
              <div className="space-y-2.5">
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = facingMode === 'user' ? 'environment' : 'user';
                      setFacingMode(next);
                      startLiveCamera(next);
                    }}
                    className="absolute top-2.5 right-2.5 px-3 py-1.5 rounded-full bg-black/65 hover:bg-black/85 text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Flip</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCaptureLiveFrame}
                    className="flex-1 py-3 bg-[#b91c1c] hover:bg-[#991b1b] text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Capture Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopLiveCamera}
                    className="px-4 py-3 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#111827] rounded-2xl text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-[#cbd5e1] bg-[#f8fafc] p-4 space-y-3 text-center">
                <div className="w-11 h-11 rounded-full bg-[#fee2e2] text-[#b91c1c] flex items-center justify-center mx-auto">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#111827]">
                    {isProcessingImage
                      ? 'Preparing photo...'
                      : 'Capture a selfie or upload a route photo'}
                  </p>
                  <p className="text-[11px] text-[#6b7280] mt-0.5">
                    Works with iPhone front camera, live camera, JPEG, PNG, and HEIC
                  </p>
                </div>

                {cameraError && (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-left">
                    {cameraError}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label
                    htmlFor="trail-selfie-camera-input"
                    className="min-h-[44px] px-3 py-2.5 bg-[#b91c1c] hover:bg-[#991b1b] text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Camera className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap">Take Selfie</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => startLiveCamera('user')}
                    className="min-h-[44px] px-3 py-2.5 bg-[#131b2e] hover:bg-black text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                    <span className="whitespace-nowrap">Live Camera</span>
                  </button>

                  <label
                    htmlFor="trail-photo-library-input"
                    className="min-h-[44px] px-3 py-2.5 bg-white border border-[#e5e7eb] hover:bg-[#f3f4f6] text-[#111827] rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#b91c1c] shrink-0" />
                    <span className="whitespace-nowrap">Photo Library</span>
                  </label>
                </div>
              </div>
            )}

            {/* Route Context & Metadata */}
            {(stopTitle || userLocation) && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#4b5563] bg-[#f9fafb] border border-[#e5e7eb] rounded-2xl px-3 py-2">
                <MapPin className="w-3.5 h-3.5 text-[#b91c1c] shrink-0" />
                <span className="truncate">
                  {stopTitle ? `Near ${stopTitle}` : trail.title}
                  {userLocation
                    ? ` · ${userLocation.lat.toFixed(4)}° N, ${userLocation.lng.toFixed(4)}° E`
                    : ''}
                </span>
              </div>
            )}

            {/* Public Display Name & Optional Caption */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[#111827] block mb-1">
                  Public Display Name
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Your name shown publicly on this trail"
                  className="w-full bg-[#f9fafb] border border-[#e5e7eb] rounded-xl px-3 py-2.5 text-base sm:text-xs text-[#111827] placeholder-[#6b7280] focus:bg-white focus:ring-2 focus:ring-[#b91c1c]/30 focus:border-[#b91c1c] outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#111827] block mb-1">
                  Trail Note <span className="font-normal text-[#6b7280]">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  maxLength={240}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Share a quick note about this spot along the walk..."
                  className="w-full bg-[#f9fafb] border border-[#e5e7eb] rounded-xl px-3 py-2 text-base sm:text-xs text-[#111827] placeholder-[#6b7280] focus:bg-white focus:ring-2 focus:ring-[#b91c1c]/30 focus:border-[#b91c1c] outline-none resize-none"
                />
              </div>
            </div>

            {errorMessage && (
              <div className="text-xs text-[#991b1b] bg-[#fef2f2] border border-[#fecaca] rounded-2xl px-3.5 py-2.5">
                {errorMessage}
              </div>
            )}

            {/* Auth Status + Submit Row */}
            <div className="pt-2 border-t border-[#f1f5f9] space-y-2.5">
              {currentUser ? (
                <div className="flex items-center justify-between text-[11px] text-[#4b5563]">
                  <span className="flex items-center gap-1.5 truncate">
                    <UserCheck className="w-3.5 h-3.5 text-[#059669] shrink-0" />
                    <span className="truncate">
                      Posting publicly as{' '}
                      <strong className="text-[#111827]">
                        {authorName.trim() || currentUser.displayName || 'Venice Explorer'}
                      </strong>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => signOut(auth)}
                    className="text-[#6b7280] hover:text-[#111827] flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Sign out</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 bg-[#f0f9ff] border border-[#bae6fd] rounded-2xl px-3 py-2 text-[11px] text-[#0369a1]">
                  <span>Sign in with Google to publish your trail photo publicly.</span>
                  <button
                    type="button"
                    disabled={isAuthenticating}
                    onClick={handleGoogleSignIn}
                    className="shrink-0 bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold px-3 py-1.5 rounded-full text-[11px] cursor-pointer disabled:opacity-50"
                  >
                    {isAuthenticating ? 'Signing in...' : 'Google Sign In'}
                  </button>
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-full text-xs font-bold text-[#6b7280] hover:text-[#111827] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!previewDataUrl || isUploading || isProcessingImage || isAuthenticating}
                  className="min-h-[44px] bg-[#b91c1c] hover:bg-[#991b1b] disabled:opacity-45 text-white px-5 py-2.5 rounded-full text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  {isUploading
                    ? 'Uploading Photo...'
                    : currentUser
                    ? 'Post Public Photo'
                    : 'Sign In & Post Photo'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
