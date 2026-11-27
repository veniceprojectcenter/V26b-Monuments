import React, { useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Star,
  MapPin,
  Clock,
  Route,
  ArrowRight,
} from 'lucide-react';
import { CURATED_TRAILS } from '../data/routes';
import { getRegionDisplayName } from '../data/monuments';
import { CuratedTrail } from '../types';
import { ArtworkImage } from './ArtworkImage';

interface CuratedTrailsProps {
  onViewAllTrails: () => void;
  onExploreTrail: (trail: CuratedTrail) => void;
}

export const CuratedTrails: React.FC<CuratedTrailsProps> = ({
  onViewAllTrails,
  onExploreTrail,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const handleScrollByCard = (direction: 'prev' | 'next') => {
    const el = scrollRef.current;
    if (!el) return;
    const step = Math.min(el.clientWidth * 0.85, 360);
    el.scrollBy({
      left: direction === 'next' ? step : -step,
      behavior: 'smooth',
    });
  };

  return (
    <section
      aria-label="Popular Curated Trails"
      className="px-4 sm:px-6 max-w-4xl mx-auto w-full mb-7"
    >
      {/* Section Header */}
      <div className="flex items-end justify-between gap-3 mb-3.5">
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-wider text-[#b91c1c] uppercase">
            NARRATIVE EXPEDITIONS
          </div>
          <h2 className="font-display text-xl font-bold text-[#111827] tracking-tight">
            Popular Curated Trails
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleScrollByCard('prev')}
              className="w-8 h-8 rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#111827] flex items-center justify-center transition cursor-pointer"
              aria-label="Scroll trails left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleScrollByCard('next')}
              className="w-8 h-8 rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#111827] flex items-center justify-center transition cursor-pointer"
              aria-label="Scroll trails right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onViewAllTrails}
            className="min-h-[36px] px-1 text-xs font-bold text-[#b91c1c] flex items-center gap-1 hover:underline cursor-pointer whitespace-nowrap"
          >
            <span>View All ({CURATED_TRAILS.length})</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Horizontal Scroll Trail Cards */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-x-smooth subtle-scrollbar pb-3 snap-x snap-proximity"
      >
        {CURATED_TRAILS.map((trail) => {
          const regionsLabel =
            trail.sestieriCovered.map(getRegionDisplayName).join(' · ') || 'Venice';
          return (
            <article
              key={trail.id}
              className="w-[80vw] max-w-[310px] sm:w-[310px] shrink-0 bg-white rounded-3xl overflow-hidden isolate border border-[#e5e7eb] shadow-sm snap-start flex flex-col hover:shadow-md transition duration-200"
            >
              {/* Card Image Module */}
              <div className="relative h-44 w-full bg-[#f3f4f6] overflow-hidden rounded-t-[23px] shrink-0">
                <ArtworkImage
                  src={trail.imageUrl}
                  alt={trail.title}
                  surveyCode={trail.number}
                  regionLabel={regionsLabel}
                  className="block w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                />

                {/* Top Badges */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 min-w-0 overflow-hidden pointer-events-none">
                  <span className="bg-black/85 text-white backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider whitespace-nowrap shrink-0">
                    {trail.number}
                  </span>

                  {trail.rating !== undefined ? (
                    <span className="bg-white/95 text-[#111827] backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 shadow-xs min-w-0 max-w-[58%] truncate">
                      <Star className="w-3 h-3 fill-[#b91c1c] text-[#b91c1c] shrink-0" />
                      <span className="truncate tabular-nums">
                        {trail.rating} ({trail.reviewsCount})
                      </span>
                    </span>
                  ) : (
                    <span className="bg-white/95 text-[#111827] backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-bold shadow-xs min-w-0 max-w-[58%] truncate">
                      {regionsLabel}
                    </span>
                  )}
                </div>

                {/* Bottom Featured Loop Badge */}
                {trail.featuredBadge && (
                  <div className="absolute bottom-3 left-3 right-3 pointer-events-none flex min-w-0 overflow-hidden">
                    <span className="bg-[#b91c1c] text-white px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide shadow-sm max-w-full truncate">
                      {trail.featuredBadge}
                    </span>
                  </div>
                )}
              </div>

              {/* Card Content */}
              <div className="p-4 sm:p-5 flex-1 min-w-0 flex flex-col justify-between">
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-bold text-[#111827] leading-snug break-words">
                    {trail.title}
                  </h3>
                  <p className="text-xs text-[#4b5563] mt-1.5 line-clamp-2 leading-relaxed">
                    {trail.description}
                  </p>

                  {/* Metrics Row */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs text-[#111827] font-semibold tabular-nums">
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <Route className="w-3.5 h-3.5 text-[#6b7280] shrink-0" />
                      <span>{trail.distanceKm} km</span>
                    </div>
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <Clock className="w-3.5 h-3.5 text-[#6b7280] shrink-0" />
                      <span>~{trail.estimatedMinutes} min</span>
                    </div>
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <MapPin className="w-3.5 h-3.5 text-[#b91c1c] shrink-0" />
                      <span>{trail.stopsCount} stops</span>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-3 min-w-0">
                    {trail.tags.map((tag) => (
                      <span
                        key={tag}
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium max-w-full truncate ${
                          tag.includes('Vaporetto')
                            ? 'bg-[#fee2e2] text-[#b91c1c]'
                            : 'bg-[#f3f4f6] text-[#4b5563]'
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* CTA Button */}
                <button
                  type="button"
                  onClick={() => onExploreTrail(trail)}
                  className="mt-4 w-full min-h-[44px] bg-black hover:bg-[#191c1e] active:scale-[0.98] transition text-white py-2.5 px-4 rounded-full text-xs font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <span>Explore Route</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
