import React from 'react';
import { Landmark, SquareAsterisk, Box } from 'lucide-react';
import { MonumentCategory } from '../types';
import { DATASET_STATS } from '../data/monuments';

interface QuickNavigationProps {
  onSelectCategory: (cat: MonumentCategory) => void;
  onOpenGis3D: () => void;
}

export const QuickNavigation: React.FC<QuickNavigationProps> = ({
  onSelectCategory,
  onOpenGis3D,
}) => {
  return (
    <section className="px-4 sm:px-6 max-w-4xl mx-auto w-full mb-10">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
        <h2 className="font-display text-lg font-bold text-[#111827] tracking-tight">
          Quick Navigation
        </h2>
        <span className="text-[11px] font-bold tracking-wider text-[#b91c1c] uppercase">
          SPATIAL TOOLSET
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Card 1 */}
        <button
          type="button"
          onClick={() => onSelectCategory('Statues')}
          className="flex flex-col justify-between p-4 bg-white rounded-2xl border border-[#e5e7eb] shadow-2xs hover:shadow-sm hover:border-[#b91c1c]/40 transition text-left active:scale-[0.98] cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-[#e0f2fe] flex items-center justify-center text-[#0284c7] mb-3">
            <Landmark className="w-5 h-5" />
          </div>
          <div>
            <div className="font-display font-bold text-sm text-[#111827]">
              Venice Statues
            </div>
            <div className="text-xs text-[#6b7280] mt-0.5">
              {DATASET_STATS.statuesCount} Survey123 Works
            </div>
          </div>
        </button>

        {/* Card 2 */}
        <button
          type="button"
          onClick={() => onSelectCategory('Reliefs')}
          className="flex flex-col justify-between p-4 bg-white rounded-2xl border border-[#e5e7eb] shadow-2xs hover:shadow-sm hover:border-[#b91c1c]/40 transition text-left active:scale-[0.98] cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-[#ffedd5] flex items-center justify-center text-[#ea580c] mb-3">
            <SquareAsterisk className="w-5 h-5" />
          </div>
          <div>
            <div className="font-display font-bold text-sm text-[#111827]">
              Stone Bas-Reliefs
            </div>
            <div className="text-xs text-[#6b7280] mt-0.5">
              {DATASET_STATS.reliefsCount} Survey123 Works
            </div>
          </div>
        </button>

        {/* Card 3 */}
        <button
          type="button"
          onClick={onOpenGis3D}
          className="flex flex-col justify-between p-4 bg-white rounded-2xl border border-[#e5e7eb] shadow-2xs hover:shadow-sm hover:border-[#b91c1c]/40 transition text-left active:scale-[0.98] cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-[#fee2e2] flex items-center justify-center text-[#b91c1c] mb-3">
            <Box className="w-5 h-5" />
          </div>
          <div>
            <div className="font-display font-bold text-sm text-[#191c1e]">
              Venice GIS Map
            </div>
            <div className="text-xs text-[#76777d] mt-0.5">
              {DATASET_STATS.totalArtworks} Georeferenced Pins
            </div>
          </div>
        </button>
      </div>
    </section>
  );
};

