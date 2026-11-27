import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, MapPin, Check, Upload, LocateFixed, Trash2, ShieldCheck, Sparkles } from 'lucide-react';

interface FieldSurveyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitSurvey: (data: {
    imageUrl: string;
    location: { lat: number; lng: number; formatted: string };
    artworkType: 'Statue' | 'Relief' | 'Monument';
    notes: string;
    timestamp: string;
  }) => void;
}

export const FieldSurveyModal: React.FC<FieldSurveyModalProps> = ({
  isOpen,
  onClose,
  onSubmitSurvey,
}) => {
  // Field 1: Image Field
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Field 2: Location Field (records user's current location)
  const [location, setLocation] = useState<{ lat: number; lng: number; formatted: string } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string>('Not recorded');

  // Field 3: Artwork Type Multiple Choice (Statue, Relief, or Monument)
  const [artworkType, setArtworkType] = useState<'Statue' | 'Relief' | 'Monument'>('Statue');

  // Field 4: Additional Notes Textbox
  const [notes, setNotes] = useState('');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Auto-record location on modal open if available
  useEffect(() => {
    if (isOpen && !location) {
      handleAcquireLocation();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleAcquireLocation = () => {
    setIsLocating(true);
    setLocationStatus('Acquiring GPS location...');

    if (typeof window === 'undefined' || !navigator.geolocation) {
      // Fallback coordinate in Venice center if geolocation unavailable
      const fallback = { lat: 45.4371, lng: 12.3326, formatted: '45.4371° N, 12.3326° E (Default)' };
      setLocation(fallback);
      setIsLocating(false);
      setLocationStatus('Venice Centro (Default)');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const formatted = `${lat}° N, ${lng}° E (±${Math.round(pos.coords.accuracy)}m)`;
        setLocation({ lat, lng, formatted });
        setIsLocating(false);
        setLocationStatus('GPS Coordinates Recorded');
      },
      () => {
        // Fallback to Venice Centro
        const fallback = { lat: 45.4371, lng: 12.3326, formatted: '45.4371° N, 12.3326° E (Lagoon Baseline)' };
        setLocation(fallback);
        setIsLocating(false);
        setLocationStatus('Lagoon Baseline (Permission Pending)');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const recordedLoc = location || { lat: 45.4371, lng: 12.3326, formatted: '45.4371° N, 12.3326° E' };

    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        onSubmitSurvey({
          imageUrl: imagePreview || '',
          location: recordedLoc,
          artworkType,
          notes,
          timestamp: new Date().toISOString(),
        });
        // Reset form
        setImagePreview(null);
        setNotes('');
        onClose();
      }, 1300);
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Citizen GIS Survey"
    >
      <div
        className="bg-white w-full max-w-lg max-h-[92dvh] sm:rounded-3xl rounded-t-3xl overflow-hidden flex flex-col shadow-2xl border border-[#e2e8f0]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[#e2e8f0] flex items-center justify-between bg-[#131b2e] text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#188ace]/30 flex items-center justify-center text-[#93ccff]">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base">
                Citizen GIS Survey
              </h3>
              <p className="text-[10px] text-[#bec6e0] font-mono">
                Log outdoor Venetian heritage into the GIS database
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer shrink-0"
            aria-label="Close survey"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center space-y-3 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-full bg-[#0d9488]/15 text-[#0d9488] flex items-center justify-center mx-auto">
              <Check className="w-8 h-8" />
            </div>
            <h4 className="font-display font-bold text-lg text-[#191c1e]">
              Field Survey Entry Recorded!
            </h4>
            <p className="text-xs text-[#76777d]">
              Thank you for logging this {artworkType.toLowerCase()} into the open Venetian GIS repository.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 overflow-y-auto overscroll-contain subtle-scrollbar space-y-5">
            {/* FIELD 1: Image Field */}
            <div>
              <label className="text-xs font-bold text-[#191c1e] block mb-1.5 flex items-center justify-between">
                <span>1. Artwork Image</span>
                <span className="text-[10px] font-normal text-[#76777d]">Photo or field snapshot</span>
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageChange}
                className="hidden"
                id="survey-image-upload"
              />

              {imagePreview ? (
                <div className="relative rounded-2xl overflow-hidden border border-[#e2e8f0] bg-[#f8fafc] group">
                  <img
                    src={imagePreview}
                    alt="Survey preview"
                    className="w-full h-44 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                    <label
                      htmlFor="survey-image-upload"
                      className="px-3 py-1.5 bg-white text-[#191c1e] text-xs font-bold rounded-xl cursor-pointer hover:bg-gray-100 transition"
                    >
                      Change Photo
                    </label>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="p-1.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition cursor-pointer"
                      title="Remove image"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  htmlFor="survey-image-upload"
                  className="w-full h-32 border-2 border-dashed border-[#cbd5e1] hover:border-[#b91c1c] rounded-2xl flex flex-col items-center justify-center gap-1.5 cursor-pointer bg-[#f8fafc] hover:bg-[#fff5f5] transition p-3 text-center"
                >
                  <div className="w-9 h-9 rounded-full bg-[#b91c1c]/10 text-[#b91c1c] flex items-center justify-center">
                    <Camera className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-bold text-[#111827]">
                    Tap to capture or upload artwork photo
                  </div>
                  <div className="text-[10px] text-[#6b7280]">
                    Supports camera capture and image uploads
                  </div>
                </label>
              )}
            </div>

            {/* FIELD 2: Location Field (records user's current location) */}
            <div>
              <label className="text-xs font-bold text-[#191c1e] block mb-1.5 flex items-center justify-between">
                <span>2. Location</span>
                <span className="text-[10px] font-semibold text-[#0284c7]">{locationStatus}</span>
              </label>

              <div className="p-3 bg-[#f0f9ff] border border-[#bae6fd] rounded-2xl flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[#0284c7]/15 text-[#0284c7] flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono font-semibold text-[#0369a1] text-xs truncate">
                      {location ? location.formatted : 'Acquiring GPS coordinates...'}
                    </div>
                    <div className="text-[10px] text-[#0284c7]">
                      Auto-records current device GPS location
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAcquireLocation}
                  disabled={isLocating}
                  className="px-3 py-1.5 bg-[#0284c7] hover:bg-[#0369a1] active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                  title="Refresh GPS location"
                >
                  <LocateFixed className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                  <span>{isLocating ? 'Locating...' : 'Refresh'}</span>
                </button>
              </div>
            </div>

            {/* FIELD 3: Artwork Type Multiple Choice (Statue, Relief, or Monument) */}
            <div>
              <label className="text-xs font-bold text-[#191c1e] block mb-1.5">
                3. Artwork Type
              </label>

              <div className="grid grid-cols-3 gap-2">
                {/* Statue Option (Blue) */}
                <button
                  type="button"
                  onClick={() => setArtworkType('Statue')}
                  className={`p-3 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center gap-1.5 ${
                    artworkType === 'Statue'
                      ? 'border-[#0284c7] bg-[#f0f9ff] ring-2 ring-[#0284c7]/40 shadow-xs'
                      : 'border-[#e2e8f0] bg-[#f8fafc] hover:bg-gray-100 text-[#45464d]'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-[#0284c7] border border-white shadow-2xs"></span>
                  <span className={`text-xs font-bold ${artworkType === 'Statue' ? 'text-[#0284c7]' : 'text-[#191c1e]'}`}>
                    Statue
                  </span>
                </button>

                {/* Relief Option (Orange) */}
                <button
                  type="button"
                  onClick={() => setArtworkType('Relief')}
                  className={`p-3 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center gap-1.5 ${
                    artworkType === 'Relief'
                      ? 'border-[#ea580c] bg-[#fff7ed] ring-2 ring-[#ea580c]/40 shadow-xs'
                      : 'border-[#e2e8f0] bg-[#f8fafc] hover:bg-gray-100 text-[#45464d]'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-[#ea580c] border border-white shadow-2xs"></span>
                  <span className={`text-xs font-bold ${artworkType === 'Relief' ? 'text-[#ea580c]' : 'text-[#191c1e]'}`}>
                    Relief
                  </span>
                </button>

                {/* Monument Option (Red) */}
                <button
                  type="button"
                  onClick={() => setArtworkType('Monument')}
                  className={`p-3 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center gap-1.5 ${
                    artworkType === 'Monument'
                      ? 'border-[#b91c1c] bg-[#fef2f2] ring-2 ring-[#b91c1c]/40 shadow-xs'
                      : 'border-[#e2e8f0] bg-[#f8fafc] hover:bg-gray-100 text-[#45464d]'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-[#b91c1c] border border-white shadow-2xs"></span>
                  <span className={`text-xs font-bold ${artworkType === 'Monument' ? 'text-[#b91c1c]' : 'text-[#191c1e]'}`}>
                    Monument
                  </span>
                </button>
              </div>
            </div>

            {/* FIELD 4: Additional Notes Textbox */}
            <div>
              <label className="text-xs font-bold text-[#191c1e] block mb-1">
                4. Additional Notes
              </label>
              <textarea
                rows={3}
                placeholder="Artwork subject, number of pieces, more refined location data, historical details, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-[#f9fafb] border border-[#e5e7eb] rounded-xl p-3 text-base sm:text-xs text-[#111827] placeholder-[#6b7280] focus:bg-white focus:ring-2 focus:ring-[#b91c1c]/30 focus:border-[#b91c1c] transition resize-none"
              ></textarea>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#f1f5f9]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-full text-xs font-bold text-[#6b7280] hover:text-[#111827] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-[#b91c1c] hover:bg-[#991b1b] active:scale-95 text-white px-5 py-2.5 rounded-full text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Uploading to GIS...' : 'Publish Survey Entry'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
