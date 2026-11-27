import React, { useState } from 'react';
import { Bell, WifiOff, Check } from 'lucide-react';
import { DATASET_STATS } from '../data/monuments';

export const SettingsScreen: React.FC = () => {
  const [sirenAlerts, setSirenAlerts] = useState(true);
  const [alertThreshold, setAlertThreshold] = useState('110');
  const [offlineCacheSaved, setOfflineCacheSaved] = useState(false);

  const handleDownloadOfflineTiles = () => {
    setOfflineCacheSaved(true);
    setTimeout(() => setOfflineCacheSaved(false), 2500);
  };

  return (
    <div className="pt-4 pb-24 px-4 sm:px-6 max-w-4xl mx-auto w-full animate-in fade-in duration-200">
      {/* Header */}
      <div className="mb-6">
        <div className="text-[11px] font-bold tracking-wider text-[#b91c1c] uppercase mb-1">
          SYSTEM PREFERENCES
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#111827] tracking-tight">
          PreserVenice Settings &amp; Cartography
        </h1>
        <p className="text-xs text-[#6b7280] mt-1">
          Configure tidal sirens and offline vector tile caching
        </p>
      </div>

      <div className="space-y-4">
        {/* Acqua Alta Alerts */}
        <div className="bg-white p-5 rounded-3xl border border-[#e2e8f0] shadow-2xs space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#fee2e2] flex items-center justify-center text-[#b91c1c] shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="font-display font-bold text-sm text-[#111827]">
                  Acqua Alta Siren Notifications
                </h4>
                <p className="text-xs text-[#6b7280]">
                  Push alerts when Venice tide forecast exceeds critical threshold
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={sirenAlerts}
                onChange={(e) => setSirenAlerts(e.target.checked)}
                aria-label="Enable Acqua Alta Siren Notifications"
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-[#eceef0] peer-focus-visible:ring-2 peer-focus-visible:ring-[#b91c1c] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#b91c1c]"></div>
            </label>
          </div>

          {sirenAlerts && (
            <div className="pt-3 border-t border-[#f2f4f6] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label htmlFor="siren-threshold-select" className="text-xs font-semibold text-[#45464d] shrink-0">
                Trigger Siren at:
              </label>
              <select
                id="siren-threshold-select"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(e.target.value)}
                className="w-full sm:w-auto max-w-full min-w-0 bg-[#eceef0] rounded-xl px-3 py-2 text-base sm:text-xs font-bold text-[#191c1e] cursor-pointer truncate"
              >
                <option value="100">+100 cm (Piazza San Marco flooded)</option>
                <option value="110">+110 cm (Official Venice Acqua Alta warning)</option>
                <option value="130">+130 cm (Severe lagoon inundation)</option>
              </select>
            </div>
          )}
        </div>

        {/* Offline Vector Tiles & Mesh Storage */}
        <div className="bg-white p-5 rounded-3xl border border-[#e2e8f0] shadow-2xs space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#eceef0] flex items-center justify-center text-[#191c1e] shrink-0">
                <WifiOff className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="font-display font-bold text-sm text-[#191c1e]">
                  Offline Venice GIS Map Cache
                </h4>
                <p className="text-xs text-[#76777d]">
                  Cached vector tiles: 48 MB • Survey123 records: {DATASET_STATS.totalArtworks} artworks ({DATASET_STATS.regionsCount} regions)
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadOfflineTiles}
            className="w-full min-h-[44px] py-2.5 px-4 bg-[#eceef0] hover:bg-[#e0e3e5] active:scale-[0.98] transition rounded-2xl text-xs font-bold text-[#191c1e] flex items-center justify-center gap-2 cursor-pointer"
          >
            {offlineCacheSaved ? (
              <>
                <Check className="w-4 h-4 text-[#0d9488]" />
                <span className="text-[#0d9488]">Lagoon Tile Cache Ready for Fieldwork</span>
              </>
            ) : (
              <span>Download Full Venetian Lagoon Offline Pack</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
