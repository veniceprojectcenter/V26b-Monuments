import React, { useMemo, useState } from 'react';
import { RotateCw, ArrowUpRight, Compass } from 'lucide-react';
import { MONUMENTS, DATASET_STATS } from '../data/monuments';
import { getCategoryPinTheme } from './VeniceGoogleMap';

interface LagoonRadarProps {
  onLaunchGis: () => void;
  onSelectMonumentId?: (id: string) => void;
  isVisible?: boolean;
  quotaExceeded?: boolean;
}

export const LagoonRadar: React.FC<LagoonRadarProps> = ({
  onLaunchGis,
  onSelectMonumentId,
  quotaExceeded = false,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastScanTime, setLastScanTime] = useState('Survey123 Dataset');

  const plottedMonuments = useMemo(() => {
    if (MONUMENTS.length === 0) return [];
    const lats = MONUMENTS.map((m) => m.coordinates.lat);
    const lngs = MONUMENTS.map((m) => m.coordinates.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latSpan = Math.max(maxLat - minLat, 0.0005);
    const lngSpan = Math.max(maxLng - minLng, 0.0005);

    return MONUMENTS.map((m) => ({
      monument: m,
      xPercent: 10 + ((m.coordinates.lng - minLng) / lngSpan) * 80,
      yPercent: 14 + ((maxLat - m.coordinates.lat) / latSpan) * 70,
    }));
  }, []);

  const activeMonument = useMemo(
    () => (activeId ? MONUMENTS.find((m) => m.id === activeId) || null : null),
    [activeId]
  );

  const handleScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setLastScanTime('Synced just now');
    }, 1200);
  };

  return (
    <div className="px-4 sm:px-6 max-w-4xl mx-auto w-full mb-6">
      <div className="bg-[#eceef0] rounded-3xl p-4 sm:p-5 shadow-xs border border-[#e0e3e5] relative overflow-hidden">
        {/* Lightweight Cartographic Dorsoduro Radar Grid (preserves Google Maps API quota until GIS Map is launched) */}
        <div className="relative w-full h-48 sm:h-56 bg-gradient-to-br from-[#0f172a] via-[#131b2e] to-[#1e293b] rounded-2xl overflow-hidden border border-[#c6c6cd]/40 shadow-inner">
          {/* Subtle Dorsoduro Canal & Cartographic Grid Contours */}
          <svg
            viewBox="0 0 600 260"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none opacity-45"
            aria-hidden="true"
          >
            <defs>
              <pattern id="pv-radar-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path
                  d="M 36 0 L 0 0 0 36"
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.16)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="600" height="260" fill="url(#pv-radar-grid)" />
            {/* Stylized Grand Canal / Giudecca / Rio di San Barnaba water corridors */}
            <path
              d="M 0 232 Q 180 218, 360 226 T 600 212"
              fill="none"
              stroke="rgba(56, 189, 248, 0.28)"
              strokeWidth="14"
            />
            <path
              d="M 380 0 Q 430 46, 515 72 T 600 130"
              fill="none"
              stroke="rgba(56, 189, 248, 0.24)"
              strokeWidth="10"
            />
            <path
              d="M 180 18 Q 210 110, 195 225"
              fill="none"
              stroke="rgba(56, 189, 248, 0.16)"
              strokeWidth="4"
            />
            <path
              d="M 335 28 Q 345 120, 325 224"
              fill="none"
              stroke="rgba(56, 189, 248, 0.16)"
              strokeWidth="4"
            />
            {/* Concentric radar distance rings */}
            <circle cx="300" cy="130" r="46" fill="none" stroke="rgba(255,255,255,0.12)" strokeDasharray="3 4" />
            <circle cx="300" cy="130" r="92" fill="none" stroke="rgba(255,255,255,0.09)" strokeDasharray="3 4" />
            <circle cx="300" cy="130" r="142" fill="none" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 4" />
          </svg>

          {/* Top Status Pill */}
          <div className="absolute top-2.5 left-2.5 right-2.5 z-10 flex items-center justify-between gap-2 pointer-events-none">
            <div className="inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-full text-[10px] font-bold text-[#0f172a] shadow-xs min-w-0">
              <Compass className="w-3 h-3 text-[#b91c1c] shrink-0" />
              <span className="truncate">Venice Lagoon GIS • {MONUMENTS.length} Surveyed Works</span>
            </div>

            {quotaExceeded && (
              <span className="bg-amber-100/95 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full text-[10px] font-semibold shadow-xs shrink-0">
                Offline Vector Mode
              </span>
            )}
          </div>

          {/* All Survey123 Monument Nodes plotted by exact lat/lng */}
          {plottedMonuments.map(({ monument, xPercent, yPercent }) => {
            const theme = getCategoryPinTheme(monument.category);
            const isSelected = activeId === monument.id;
            return (
              <button
                key={monument.id}
                type="button"
                onClick={() => {
                  setActiveId(monument.id);
                  onSelectMonumentId?.(monument.id);
                }}
                style={{ left: `${xPercent}%`, top: `${yPercent}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition-transform cursor-pointer ${
                  theme.bg
                } ${
                  isSelected
                    ? 'w-4 h-4 z-20 ring-2 ring-white scale-125'
                    : 'w-3 h-3 z-10 hover:scale-125 hover:z-20'
                }`}
                title={`${monument.title} (${monument.category})`}
                aria-label={`Inspect ${monument.title}`}
              />
            );
          })}

          {/* Selected Monument Quick Tag */}
          {activeMonument && (
            <div className="absolute bottom-2.5 right-2.5 z-20 max-w-[55%] bg-[#0f172a]/90 backdrop-blur-sm text-white px-2.5 py-1 rounded-xl text-[10px] font-semibold border border-white/15 truncate shadow-md pointer-events-none">
              {activeMonument.title}
            </div>
          )}

          {/* Optional Radar Scan Pulse Overlay */}
          {isScanning && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="w-64 h-64 rounded-full animate-radar-sweep">
                <div className="w-1/2 h-1/2 bg-gradient-to-br from-[#ef4444]/30 to-transparent origin-bottom-right rounded-tl-full"></div>
              </div>
            </div>
          )}

          {/* Compact Pin Legend */}
          <div className="absolute bottom-2.5 left-2.5 z-10 pointer-events-none flex items-center gap-2 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] font-semibold text-[#111827] shadow-xs border border-[#e5e7eb]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#0284c7]"></span>Statues
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#ea580c]"></span>Reliefs
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#b91c1c]"></span>Monuments
            </span>
          </div>
        </div>

        {/* Bottom Metadata & Controls */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold text-[#191c1e] leading-snug">
              GIS Radar
            </h3>
            <p className="carto-mono text-xs text-[#45464d] mt-0.5 truncate">
              45.4371° N, 12.3326° E • {lastScanTime}
            </p>
          </div>

          <button
            type="button"
            onClick={handleScan}
            disabled={isScanning}
            className="min-h-[40px] flex items-center gap-1.5 bg-[#fee2e2] hover:bg-[#fecaca] active:scale-95 transition text-[#b91c1c] px-3.5 py-2 rounded-2xl text-xs font-semibold shadow-2xs cursor-pointer shrink-0"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning...' : 'Scan'}</span>
          </button>
        </div>

        {/* Announcement Row */}
        <div className="mt-3 pt-3 border-t border-[#d8dadc] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-[#45464d] min-w-0 flex-1">
            <span className="w-2 h-2 rounded-full bg-[#ef4444] shrink-0"></span>
            <span className="truncate">
              {DATASET_STATS.statuesCount} statues, {DATASET_STATS.reliefsCount} reliefs &amp;{' '}
              {DATASET_STATS.monumentsCount} monument across {DATASET_STATS.regionsCount} Venice regions
            </span>
          </div>

          <button
            type="button"
            onClick={onLaunchGis}
            className="shrink-0 flex items-center gap-1 font-bold text-[#b91c1c] hover:underline cursor-pointer min-h-[32px]"
          >
            <span>Launch GIS</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
