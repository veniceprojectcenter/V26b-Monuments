import React from 'react';
import { 
  Layers, 
  Search, 
  SlidersHorizontal, 
  User, 
  Landmark, 
  SquareAsterisk, 
  Scan
} from 'lucide-react';
import { MonumentCategory } from '../types';

interface HeaderProps {
  language: 'en' | 'it';
  onLanguageChange: (language: 'en' | 'it') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: MonumentCategory | 'All';
  onSelectCategory: (cat: MonumentCategory | 'All') => void;
  onOpenFilter: () => void;
  onOpenGisMap: () => void;
  onNavigateTab?: (tab: 'explore' | 'collection' | 'lens' | 'routes' | 'support' | 'settings') => void;
}

export const Header: React.FC<HeaderProps> = ({
  language,
  onLanguageChange,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onSelectCategory,
  onOpenFilter,
  onOpenGisMap,
  onNavigateTab,
}) => {
  return (
    <header className="bg-white border-b border-[#e5e7eb] max-w-4xl mx-auto w-full pt-3 pb-4 px-4 sm:px-6">
      {/* Top Banner matching official PreserVenice website format */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2">
        {/* Left: PreserVenice Official Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateTab?.('explore')}
            className="rounded-xl p-1 -m-1 cursor-pointer focus-visible:outline-none"
            aria-label="PreserVenice Explore home"
          >
            <img
              src="/assets/aistudio/pv_logo_60_588922ef.png"
              alt="PreserVenice"
              className="h-12 sm:h-14 w-auto object-contain"
            />
          </button>
        </div>

        {/* Right: PreserVenice Official Mission Statement in Italics */}
        <div className="flex items-center gap-3">
        <label className="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs not-italic whitespace-nowrap" aria-label="Language / Lingua">
          <span data-language-flag aria-hidden="true">{language === 'it' ? '🇮🇹' : '🇬🇧'}</span>
          <select value={language} onChange={(event) => onLanguageChange(event.target.value as 'en' | 'it')} className="bg-white" aria-label="Language / Lingua">
            <option value="en">English</option><option value="it">Italiano</option>
          </select>
        </label>
        <div className="text-xs sm:text-sm text-[#111827] italic font-serif leading-relaxed max-w-md text-left md:text-right">
          <p>
            PreserVenice is a non-profit organization devoted to the preservation and restoration of public art in Venice, Italy.
          </p>
        </div>
        </div>
      </div>

      {/* PreserVenice Website (Left) & About (Right-aligned) */}
      <div className="flex items-center justify-between gap-4 pt-1 pb-0.5 text-xs">
        <a
          href="https://preservenice.org/index.html"
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-[#b91c1c] hover:underline"
        >
          PreserVenice Website
        </a>
        <a
          href="https://preservenice.org/about.html"
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-[#b91c1c] hover:underline text-right"
        >
          About
        </a>
      </div>

      {/* Primary Red Horizontal Divider Rule */}
      <div className="border-t-2 border-[#b91c1c] my-3"></div>

      {/* Search Bar & GIS Cartography Launch */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 mb-3">
        {/* Search Input */}
        <div className="relative flex-1 flex items-center min-w-0">
          <div className="absolute left-3.5 text-[#6b7280] pointer-events-none">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search statues, monuments, reliefs, or GIS coordinates..."
            aria-label="Search Venetian artworks and GIS coordinates"
            className="w-full bg-[#f9fafb] hover:bg-[#f3f4f6] focus:bg-white text-base sm:text-sm text-[#111827] placeholder-[#6b7280] rounded-xl pl-10 pr-11 py-2.5 border border-[#e5e7eb] focus:outline-none focus:ring-2 focus:ring-[#b91c1c]/30 focus:border-[#b91c1c] transition"
          />
          <button
            type="button"
            onClick={onOpenFilter}
            className="absolute right-2 w-8 h-8 rounded-lg hover:bg-black/5 active:scale-95 flex items-center justify-center transition cursor-pointer"
            aria-label="Filter Options"
            title="Filter by Sestiere, Type, Attributes"
          >
            <SlidersHorizontal className="w-4 h-4 text-[#b91c1c]" />
          </button>
        </div>

        {/* GIS Cartography Button */}
        <button
          type="button"
          onClick={onOpenGisMap}
          className="shrink-0 min-h-[42px] flex items-center justify-center gap-2 bg-[#b91c1c] hover:bg-[#991b1b] active:scale-95 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs transition cursor-pointer whitespace-nowrap"
        >
          <Layers className="w-4 h-4 text-white shrink-0" />
          <span>Interactive GIS Map</span>
        </button>
      </div>

      {/* Category Pills (Statues, Monuments, Reliefs, Surveys) */}
      <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 overflow-x-auto sm:overflow-visible scroll-x-smooth no-scrollbar pt-1">
        <button
          type="button"
          aria-pressed={selectedCategory === 'Statues'}
          onClick={() => onSelectCategory(selectedCategory === 'Statues' ? 'All' : 'Statues')}
          className={`flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-full text-xs font-semibold transition shrink-0 cursor-pointer whitespace-nowrap ${
            selectedCategory === 'Statues'
              ? 'bg-[#000000] text-white shadow-xs'
              : 'bg-[#f3f4f6] text-[#111827] hover:bg-[#e5e7eb] border border-[#e5e7eb]'
          }`}
        >
          <User className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />
          <span>Statues</span>
        </button>

        <button
          type="button"
          aria-pressed={selectedCategory === 'Monuments'}
          onClick={() => onSelectCategory(selectedCategory === 'Monuments' ? 'All' : 'Monuments')}
          className={`flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-full text-xs font-semibold transition shrink-0 cursor-pointer whitespace-nowrap ${
            selectedCategory === 'Monuments'
              ? 'bg-[#000000] text-white shadow-xs'
              : 'bg-[#f3f4f6] text-[#111827] hover:bg-[#e5e7eb] border border-[#e5e7eb]'
          }`}
        >
          <Landmark className="w-3.5 h-3.5 text-[#b91c1c] shrink-0" />
          <span>Monuments</span>
        </button>

        <button
          type="button"
          aria-pressed={selectedCategory === 'Reliefs'}
          onClick={() => onSelectCategory(selectedCategory === 'Reliefs' ? 'All' : 'Reliefs')}
          className={`flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-full text-xs font-semibold transition shrink-0 cursor-pointer whitespace-nowrap ${
            selectedCategory === 'Reliefs'
              ? 'bg-[#000000] text-white shadow-xs'
              : 'bg-[#f3f4f6] text-[#111827] hover:bg-[#e5e7eb] border border-[#e5e7eb]'
          }`}
        >
          <SquareAsterisk className="w-3.5 h-3.5 text-[#ea580c] shrink-0" />
          <span>Reliefs</span>
        </button>

        <button
          type="button"
          aria-pressed={selectedCategory === 'Surveys'}
          onClick={() => onSelectCategory(selectedCategory === 'Surveys' ? 'All' : 'Surveys')}
          className={`flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-full text-xs font-semibold transition shrink-0 cursor-pointer whitespace-nowrap ${
            selectedCategory === 'Surveys'
              ? 'bg-[#000000] text-white shadow-xs'
              : 'bg-[#f3f4f6] text-[#111827] hover:bg-[#e5e7eb] border border-[#e5e7eb]'
          }`}
        >
          <Scan className="w-3.5 h-3.5 text-[#10b981] shrink-0" />
          <span>Surveys / 3D Scans</span>
        </button>
      </div>
    </header>
  );
};
