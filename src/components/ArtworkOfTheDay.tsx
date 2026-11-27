import React, { useState } from 'react';
import { Sparkles, Bookmark, MapPin, Plus, Check, ArrowRight, Maximize2 } from 'lucide-react';
import { Monument } from '../types';
import { ImageLightboxModal } from './ImageLightboxModal';
import { ArtworkImage } from './ArtworkImage';

interface ArtworkOfTheDayProps {
  monument: Monument;
  onViewDetails: (monument: Monument) => void;
  onToggleRoute: (monumentId: string) => void;
  isInRoute: boolean;
}

export const ArtworkOfTheDay: React.FC<ArtworkOfTheDayProps> = ({
  monument,
  onViewDetails,
  onToggleRoute,
  isInRoute,
}) => {
  const [isSaved, setIsSaved] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);

  const photos = monument.galleryImages.length > 0 ? monument.galleryImages : [monument.imageUrl];

  return (
    <section className="px-4 sm:px-6 max-w-4xl mx-auto w-full mb-7">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-full bg-[#fee2e2] flex items-center justify-center text-[#b91c1c] shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h2 className="font-display text-xl font-bold text-[#111827] tracking-tight">
            Artwork of the Day
          </h2>
        </div>

        <div className="text-[11px] font-bold tracking-wider text-[#b91c1c] uppercase shrink-0">
          DAILY GIS FOCUS
        </div>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-3xl overflow-hidden border border-[#e5e7eb] shadow-sm hover:shadow-md transition duration-200">
        {/* Photo Container */}
        <div className="relative h-64 sm:h-72 w-full bg-[#f3f4f6] overflow-hidden group">
          <button
            type="button"
            disabled={!imageLoaded}
            onClick={() => {
              if (!imageLoaded) return;
              setLightboxIndex(0);
              setIsLightboxOpen(true);
            }}
            className={`block w-full h-full text-left ${
              imageLoaded ? 'cursor-zoom-in' : 'cursor-default'
            }`}
            title={
              imageLoaded
                ? 'Click to enlarge and view full uncropped artwork'
                : 'Reference photograph pending upload'
            }
            aria-label={
              imageLoaded
                ? `Enlarge artwork photograph for ${monument.title}`
                : monument.title
            }
          >
            <ArtworkImage
              src={monument.imageUrl}
              alt={monument.title}
              surveyCode={monument.surveyCode}
              regionLabel={monument.regionDisplay}
              onStatusChange={setImageLoaded}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            />
          </button>

          {/* Bookmark Button */}
          <button
            type="button"
            onClick={() => setIsSaved(!isSaved)}
            className={`absolute top-4 right-4 w-10 h-10 rounded-2xl flex items-center justify-center backdrop-blur-md transition shadow-sm active:scale-90 cursor-pointer ${
              isSaved
                ? 'bg-[#b91c1c] text-white'
                : 'bg-white/90 text-[#111827] hover:bg-white'
            }`}
            aria-label={isSaved ? 'Remove bookmark' : 'Bookmark Monument'}
            aria-pressed={isSaved}
          >
            <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
          </button>

          {/* Coordinates Overlay Pill & Enlarge Hint */}
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-2 pointer-events-none">
            <div className="bg-white/95 text-[#111827] backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-sm min-w-0">
              <MapPin className="w-3.5 h-3.5 text-[#b91c1c] shrink-0" />
              <span className="carto-mono font-medium truncate">{monument.coordinates.formatted}</span>
            </div>

            {imageLoaded && (
              <button
                type="button"
                onClick={() => {
                  setLightboxIndex(0);
                  setIsLightboxOpen(true);
                }}
                className="pointer-events-auto bg-black/70 hover:bg-black text-white backdrop-blur-md px-2.5 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer shrink-0"
                aria-label="Enlarge artwork photo"
              >
                <Maximize2 className="w-3 h-3 text-[#ff6d4d]" />
                <span>Enlarge</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6">
          {/* Metadata Subheader */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold mb-2">
            <span className="text-[#b91c1c] uppercase tracking-wider">
              {monument.category.toUpperCase()} • {monument.surveyCode.toUpperCase()} • {monument.locationName.toUpperCase()}
            </span>
            <span className="text-[#6b7280]">
              {monument.regionDisplay}{monument.distanceKm !== undefined ? ` • ${monument.distanceKm} km from center` : ''}
            </span>
          </div>

          {/* Title and Survey123 Recording Metadata */}
          <h3 className="font-display text-2xl font-bold text-[#111827] tracking-tight leading-snug">
            {monument.title}
          </h3>
          <p className="text-xs text-[#6b7280] font-medium mt-1">
            {monument.artist ? `Artist: ${monument.artist}` : 'Artist: Not recorded in Survey123'}
            {' • '}
            {monument.year ? `Date: ${monument.year}` : `Recorded ${monument.creationDate.split(' ')[0]}`}
          </p>

          {/* Description / Field Notes */}
          <p className="text-xs sm:text-sm text-[#4b5563] leading-relaxed mt-3">
            {monument.description}
          </p>

          {/* Action Strip */}
          <div className="grid grid-cols-2 gap-3 mt-5">
            <button
              type="button"
              onClick={() => onToggleRoute(monument.id)}
              className={`min-h-[44px] flex items-center justify-center gap-2 py-3 px-4 rounded-2xl text-xs sm:text-sm font-bold transition active:scale-[0.98] shadow-xs cursor-pointer ${
                isInRoute
                  ? 'bg-[#10b981] text-white'
                  : 'bg-[#b91c1c] hover:bg-[#991b1b] text-white'
              }`}
            >
              {isInRoute ? (
                <>
                  <Check className="w-4 h-4 shrink-0" />
                  <span>In Route</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>Add to Route</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onViewDetails(monument)}
              className="min-h-[44px] flex items-center justify-center gap-2 py-3 px-4 rounded-2xl text-xs sm:text-sm font-bold bg-[#f3f4f6] hover:bg-[#e5e7eb] active:scale-[0.98] transition text-[#111827] shadow-xs cursor-pointer"
            >
              <span>View Details</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>
      </div>

      <ImageLightboxModal
        isOpen={isLightboxOpen}
        images={photos}
        currentIndex={lightboxIndex}
        title={monument.title}
        subtitle={monument.surveyCode}
        onClose={() => setIsLightboxOpen(false)}
        onChangeIndex={setLightboxIndex}
      />
    </section>
  );
};
