import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Sestiere, MonumentCategory } from '../types';
import { AVAILABLE_REGIONS, DATASET_STATS } from '../data/monuments';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSestiere: Sestiere | 'All';
  onChangeSestiere: (s: Sestiere | 'All') => void;
  selectedCategory: MonumentCategory | 'All';
  onChangeCategory: (c: MonumentCategory | 'All') => void;
  onlyWithNotes: boolean;
  onChangeOnlyWithNotes: (val: boolean) => void;
  onlyMultiPhoto: boolean;
  onChangeOnlyMultiPhoto: (val: boolean) => void;
  only3D: boolean;
  onChangeOnly3D: (val: boolean) => void;
  onReset: () => void;
}

const CATEGORIES: (MonumentCategory | 'All')[] = ['All', 'Statues', 'Reliefs', 'Monuments'];

export const FilterModal: React.FC<FilterModalProps> = ({
  isOpen,
  onClose,
  selectedSestiere,
  onChangeSestiere,
  selectedCategory,
  onChangeCategory,
  onlyWithNotes,
  onChangeOnlyWithNotes,
  onlyMultiPhoto,
  onChangeOnlyMultiPhoto,
  only3D,
  onChangeOnly3D,
  onReset,
}) => {
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Filter Venice Survey123 Catalog"
    >
      <div
        className="bg-white w-full max-w-lg max-h-[85dvh] sm:rounded-3xl rounded-t-3xl overflow-hidden flex flex-col shadow-2xl border border-[#e2e8f0]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[#e2e8f0] flex items-center justify-between shrink-0">
          <h3 className="font-display text-lg font-bold text-[#191c1e]">
            Filter Venice Survey123 Catalog
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="w-9 h-9 rounded-full bg-[#eceef0] hover:bg-[#e0e3e5] flex items-center justify-center transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4 text-[#191c1e]" />
          </button>
        </div>

        {/* Filters Scrollable List */}
        <div className="p-5 overflow-y-auto overscroll-contain subtle-scrollbar space-y-6">
          {/* Sestiere / Island Region */}
          <div>
            <span className="text-xs font-bold text-[#191c1e] uppercase tracking-wider block mb-2">
              Sestiere &amp; Island Coverage ({AVAILABLE_REGIONS.length} Regions)
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={selectedSestiere === 'All'}
                onClick={() => onChangeSestiere('All')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                  selectedSestiere === 'All'
                    ? 'bg-black text-white shadow-xs'
                    : 'bg-[#eceef0] text-[#45464d] hover:bg-[#e0e3e5]'
                }`}
              >
                All ({DATASET_STATS.totalArtworks})
              </button>
              {AVAILABLE_REGIONS.map((reg) => {
                const isSelected =
                  selectedSestiere === reg.rawRegion || selectedSestiere === reg.displayName;
                return (
                  <button
                    type="button"
                    key={reg.rawRegion}
                    aria-pressed={isSelected}
                    onClick={() => onChangeSestiere(reg.rawRegion)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                      isSelected
                        ? 'bg-black text-white shadow-xs'
                        : 'bg-[#eceef0] text-[#45464d] hover:bg-[#e0e3e5]'
                    }`}
                  >
                    {reg.displayName} ({reg.count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Artwork Type */}
          <div>
            <span className="text-xs font-bold text-[#191c1e] uppercase tracking-wider block mb-2">
              Survey123 Artwork Type
            </span>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  aria-pressed={selectedCategory === c}
                  onClick={() => onChangeCategory(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                    selectedCategory === c
                      ? 'bg-[#b91c1c] text-white shadow-xs'
                      : 'bg-[#eceef0] text-[#45464d] hover:bg-[#e0e3e5]'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles matching real Survey123 attributes */}
          <div className="space-y-2.5 pt-1">
            <label className="flex items-center gap-3 p-3 bg-[#eceef0] rounded-2xl cursor-pointer">
              <input
                type="checkbox"
                checked={onlyWithNotes}
                onChange={(e) => onChangeOnlyWithNotes(e.target.checked)}
                className="w-4 h-4 accent-[#b91c1c] rounded cursor-pointer shrink-0"
              />
              <span className="text-xs font-bold text-[#191c1e]">
                Only show artworks with recorded Survey123 general notes
              </span>
            </label>

            <label className="flex items-center gap-3 p-3 bg-[#eceef0] rounded-2xl cursor-pointer">
              <input
                type="checkbox"
                checked={onlyMultiPhoto}
                onChange={(e) => onChangeOnlyMultiPhoto(e.target.checked)}
                className="w-4 h-4 accent-[#b91c1c] rounded cursor-pointer shrink-0"
              />
              <span className="text-xs font-bold text-[#191c1e]">
                Only show multi-photo records (2+ attachments)
              </span>
            </label>

            <label className="flex items-center gap-3 p-3 bg-[#eceef0] rounded-2xl cursor-pointer">
              <input
                type="checkbox"
                checked={only3D}
                onChange={(e) => onChangeOnly3D(e.target.checked)}
                className="w-4 h-4 accent-[#b91c1c] rounded cursor-pointer shrink-0"
              />
              <div>
                <span className="text-xs font-bold text-[#191c1e] block">
                  Only show records with 3D model captured
                </span>
                <span className="text-[10px] text-[#6b7280]">
                  Currently {DATASET_STATS.with3DModelCount} of {DATASET_STATS.totalArtworks} Survey123 records report _3d_model_captured = &quot;Yes&quot;
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#e2e8f0] flex items-center justify-between gap-3 bg-[#f7f9fb] shrink-0">
          <button
            type="button"
            onClick={onReset}
            className="min-h-[40px] text-xs font-bold text-[#76777d] hover:text-[#191c1e] px-3 py-2 cursor-pointer"
          >
            Reset Filters
          </button>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] bg-[#b91c1c] hover:bg-[#991b1b] text-white text-xs font-bold px-6 py-2.5 rounded-full shadow-sm transition active:scale-95 cursor-pointer"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
};

