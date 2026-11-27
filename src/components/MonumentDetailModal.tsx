import React, { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  Check,
  Plus,
  Compass,
  Share2,
  Database,
  FileImage,
  Calendar,
  Maximize2,
} from 'lucide-react';
import { Monument } from '../types';
import { ImageLightboxModal } from './ImageLightboxModal';
import { ArtworkImage } from './ArtworkImage';

interface MonumentDetailModalProps {
  monument: Monument | null;
  onClose: () => void;
  onToggleRoute: (id: string) => void;
  isInRoute: boolean;
  onLaunchGisLocation: (coords: { lat: number; lng: number }) => void;
}

export const MonumentDetailModal: React.FC<MonumentDetailModalProps> = ({
  monument,
  onClose,
  onToggleRoute,
  isInRoute,
  onLaunchGisLocation,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'gis-data'>('overview');
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [heroImageLoaded, setHeroImageLoaded] = useState(false);
  const [copiedGis, setCopiedGis] = useState(false);

  useEffect(() => {
    setActivePhotoIndex(0);
    setActiveTab('overview');
    setIsLightboxOpen(false);
    setHeroImageLoaded(false);
  }, [monument?.id]);

  useEffect(() => {
    if (!monument || isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [monument, isLightboxOpen, onClose]);

  if (!monument) return null;

  const photos = monument.galleryImages.length > 0 ? monument.galleryImages : [monument.imageUrl];
  const currentPhoto = photos[Math.min(activePhotoIndex, photos.length - 1)] || monument.imageUrl;

  const handleShareGis = () => {
    navigator.clipboard?.writeText(
      `PreserVenice Survey123 Node: ${monument.title} [${monument.coordinates.formatted}] - GlobalID: ${monument.arcgisGlobalId}`
    );
    setCopiedGis(true);
    setTimeout(() => setCopiedGis(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={monument.title}
    >
      <div
        className="bg-white w-full max-w-xl max-h-[92dvh] sm:rounded-3xl rounded-t-3xl overflow-hidden flex flex-col shadow-2xl border border-[#e2e8f0]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Modal Header */}
        <div className="relative h-64 sm:h-72 w-full bg-[#131b2e] shrink-0 overflow-hidden group">
          <button
            type="button"
            disabled={!heroImageLoaded}
            onClick={() => {
              if (heroImageLoaded) setIsLightboxOpen(true);
            }}
            className={`block w-full h-full ${
              heroImageLoaded ? 'cursor-zoom-in' : 'cursor-default'
            }`}
            title={
              heroImageLoaded
                ? 'Click to enlarge and view full uncropped artwork'
                : 'Reference photograph pending upload'
            }
            aria-label={
              heroImageLoaded
                ? `Enlarge photograph for ${monument.title}`
                : monument.title
            }
          >
          <ArtworkImage
            src={currentPhoto}
            alt={monument.title}
            surveyCode={monument.surveyCode}
            regionLabel={monument.regionDisplay}
            loading="eager"
            onStatusChange={setHeroImageLoaded}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
          </button>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent pointer-events-none"></div>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 hover:bg-black text-white flex items-center justify-center transition active:scale-95 z-10 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Top Left Code Pill */}
          <div className="absolute top-4 left-4 bg-black/70 text-white backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-mono pointer-events-none">
            {monument.surveyCode}
          </div>

          {/* Coordinate Tag, Enlarge Hint & Photo Counter */}
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            <span className="bg-black/75 text-white backdrop-blur-md px-3 py-1 rounded-full text-xs font-mono flex items-center gap-1.5 pointer-events-auto min-w-0 max-w-full truncate">
              <MapPin className="w-3.5 h-3.5 text-[#ff6d4d] shrink-0" />
              <span className="truncate">{monument.coordinates.formatted}</span>
            </span>

            <div className="flex items-center gap-1.5 pointer-events-auto shrink-0">
              {photos.length > 1 && (
                <div className="flex items-center gap-1.5 bg-black/70 p-1 rounded-full">
                  {photos.map((imgUrl, idx) => (
                    <button
                      type="button"
                      key={imgUrl}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePhotoIndex(idx);
                      }}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition cursor-pointer ${
                        activePhotoIndex === idx
                          ? 'bg-[#b91c1c] text-white'
                          : 'text-white/80 hover:text-white'
                      }`}
                    >
                      Photo {idx + 1}
                    </button>
                  ))}
                </div>
              )}

              {heroImageLoaded && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsLightboxOpen(true);
                  }}
                  className="bg-black/75 hover:bg-black text-white backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 border border-white/20 transition cursor-pointer"
                  aria-label="Enlarge artwork photo"
                >
                  <Maximize2 className="w-3 h-3 text-[#ff6d4d]" />
                  <span>Enlarge</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Multi-Photo Strip if > 1 image */}
        {photos.length > 1 && (
          <div className="px-6 py-2.5 bg-[#f9fafb] border-b border-[#e5e7eb] flex items-center gap-2 overflow-x-auto scroll-x-smooth shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6b7280] shrink-0 mr-1">
              Attachments ({photos.length}):
            </span>
            {photos.map((imgUrl, idx) => (
              <button
                type="button"
                key={imgUrl}
                onClick={() => {
                  if (activePhotoIndex === idx && heroImageLoaded) {
                    setIsLightboxOpen(true);
                  } else {
                    setActivePhotoIndex(idx);
                  }
                }}
                className={`w-12 h-12 rounded-xl overflow-hidden border-2 shrink-0 transition cursor-pointer ${
                  activePhotoIndex === idx
                    ? 'border-[#b91c1c] scale-105'
                    : 'border-transparent opacity-70 hover:opacity-100'
                }`}
                title={
                  activePhotoIndex === idx && heroImageLoaded
                    ? 'Click to enlarge photo'
                    : `Select photo ${idx + 1}`
                }
              >
                <ArtworkImage
                  src={imgUrl}
                  alt={`Attachment ${idx + 1}`}
                  surveyCode={monument.surveyCode}
                  compact
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex border-b border-[#e2e8f0] px-6 bg-[#f7f9fb] shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`py-3 text-xs font-bold border-b-2 mr-6 transition cursor-pointer ${
              activeTab === 'overview'
                ? 'border-[#b91c1c] text-[#b91c1c]'
                : 'border-transparent text-[#76777d] hover:text-[#191c1e]'
            }`}
          >
            Survey123 Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('gis-data')}
            className={`py-3 text-xs font-bold border-b-2 mr-6 transition cursor-pointer ${
              activeTab === 'gis-data'
                ? 'border-[#b91c1c] text-[#b91c1c]'
                : 'border-transparent text-[#76777d] hover:text-[#191c1e]'
            }`}
          >
            ArcGIS Record Metadata
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 overflow-y-auto overscroll-contain subtle-scrollbar space-y-5 text-[#191c1e]">
          {activeTab === 'overview' && (
            <>
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-[#b91c1c] uppercase tracking-wider mb-1">
                  <span>{monument.category}</span>
                  <span>•</span>
                  <span>{monument.regionDisplay}</span>
                  <span>•</span>
                  <span>{monument.surveyCode}</span>
                </div>

                <h2 className="font-display text-2xl font-bold tracking-tight text-[#191c1e]">
                  {monument.title}
                </h2>
                <div className="text-xs text-[#76777d] font-medium mt-1 flex flex-wrap items-center gap-2">
                  <span>Artist: {monument.artist || 'Not recorded in Survey123'}</span>
                  <span>•</span>
                  <span>Artwork Date: {monument.year || 'Not recorded'}</span>
                </div>
              </div>

              {/* Field Notes */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#76777d] mb-1.5">
                  Survey123 General Notes
                </h4>
                <p className="text-sm text-[#45464d] leading-relaxed bg-[#f8fafc] p-3.5 rounded-2xl border border-[#e2e8f0]">
                  {monument.generalNotes || 'No field notes recorded for this artwork in Survey123.'}
                </p>
              </div>

              {/* Source Attachment Manifest */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#76777d] mb-1.5 flex items-center gap-1.5">
                  <FileImage className="w-3.5 h-3.5 text-[#b91c1c]" />
                  <span>Attachment Manifest ({monument.originalFilenames.length})</span>
                </h4>
                <div className="space-y-1.5">
                  {monument.originalFilenames.map((filename) => (
                    <div
                      key={filename}
                      className="text-xs font-mono text-[#334155] bg-[#f1f5f9] px-3 py-2 rounded-xl border border-[#e2e8f0]"
                    >
                      {filename}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'gis-data' && (
            <div className="space-y-4">
              {/* Record Verification Banner */}
              <div className="bg-[#f2f4f6] rounded-2xl p-4 border border-[#e0e3e5]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-[#0284c7]" />
                    <span className="text-xs font-bold text-[#191c1e]">
                      ArcGIS Survey123 Source Record
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#dae2fd] text-[#131b2e]">
                    {monument.regionDisplay}
                  </span>
                </div>

                <div className="text-xs text-[#45464d] leading-relaxed font-mono break-all">
                  GlobalID: <strong className="text-[#191c1e]">{monument.arcgisGlobalId}</strong>
                </div>
              </div>

              {/* Telemetry Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-[#eceef0] rounded-xl">
                  <span className="text-[10px] text-[#76777d] uppercase font-bold block">
                    Artwork Type
                  </span>
                  <span className="font-bold text-[#191c1e] text-sm">
                    {monument.category}
                  </span>
                </div>

                <div className="p-3 bg-[#eceef0] rounded-xl">
                  <span className="text-[10px] text-[#76777d] uppercase font-bold block">
                    3D Model Captured
                  </span>
                  <span className="font-bold text-[#191c1e] text-sm">
                    {monument.modelCapturedRaw}
                  </span>
                </div>

                <div className="p-3 bg-[#eceef0] rounded-xl">
                  <span className="text-[10px] text-[#76777d] uppercase font-bold block flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>Creation Date</span>
                  </span>
                  <span className="font-mono font-bold text-[#191c1e] text-xs">
                    {monument.creationDate}
                  </span>
                </div>

                <div className="p-3 bg-[#eceef0] rounded-xl">
                  <span className="text-[10px] text-[#76777d] uppercase font-bold block">
                    Survey Creator
                  </span>
                  <span className="font-mono font-bold text-[#191c1e] text-xs">
                    {monument.creator}
                  </span>
                </div>

                <div className="p-3 bg-[#eceef0] rounded-xl">
                  <span className="text-[10px] text-[#76777d] uppercase font-bold block">
                    Survey123 Region
                  </span>
                  <span className="font-bold text-[#191c1e] text-xs">
                    {monument.rawRegion}
                    {monument.rawRegion !== monument.regionDisplay
                      ? ` (${monument.regionDisplay})`
                      : ''}
                  </span>
                </div>

                <div className="p-3 bg-[#eceef0] rounded-xl">
                  <span className="text-[10px] text-[#76777d] uppercase font-bold block">
                    Exact WGS84 Coordinates
                  </span>
                  <span className="font-mono font-bold text-[#191c1e] text-xs">
                    {monument.coordinates.lat}, {monument.coordinates.lng}
                  </span>
                </div>
              </div>

              {/* Copy GIS Data */}
              <div className="pt-2 flex gap-3">
                <button
                  onClick={handleShareGis}
                  className="flex-1 py-2.5 px-4 bg-[#eceef0] hover:bg-[#e0e3e5] rounded-xl text-xs font-bold text-[#191c1e] flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>{copiedGis ? 'Copied GIS Record!' : 'Copy GIS Record'}</span>
                </button>

                <button
                  onClick={() => {
                    onLaunchGisLocation(monument.coordinates);
                    onClose();
                  }}
                  className="flex-1 py-2.5 px-4 bg-[#0284c7] hover:bg-[#0369a1] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Locate in GIS</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Sticky Bottom Actions */}
        <div className="p-4 sm:p-5 border-t border-[#e2e8f0] bg-white flex items-center gap-3">
          <button
            onClick={() => onToggleRoute(monument.id)}
            className={`flex-1 py-3.5 px-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition active:scale-[0.98] cursor-pointer ${
              isInRoute
                ? 'bg-[#10b981] text-white'
                : 'bg-[#b91c1c] hover:bg-[#991b1b] text-white shadow-sm'
            }`}
          >
            {isInRoute ? (
              <>
                <Check className="w-4 h-4" />
                <span>Added to Walking Route</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Add to My Route</span>
              </>
            )}
          </button>

          <button
            onClick={() => {
              onLaunchGisLocation(monument.coordinates);
              onClose();
            }}
            className="w-12 h-12 rounded-2xl bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#111827] flex items-center justify-center transition active:scale-95 cursor-pointer"
            title="Locate on Map"
          >
            <Compass className="w-5 h-5 text-[#b91c1c]" />
          </button>
        </div>
      </div>

      {/* Full-Screen Uncropped Photo Lightbox */}
      <ImageLightboxModal
        isOpen={isLightboxOpen}
        images={photos}
        currentIndex={activePhotoIndex}
        title={monument.title}
        subtitle={monument.surveyCode}
        onClose={() => setIsLightboxOpen(false)}
        onChangeIndex={setActivePhotoIndex}
      />
    </div>
  );
};
