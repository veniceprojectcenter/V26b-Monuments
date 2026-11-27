import React from 'react';
import { Compass, Landmark, Route, HeartHandshake, Settings, Scan } from 'lucide-react';
import { ActiveTab } from '../types';

interface BottomNavBarProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  savedRoutesCount: number;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onChangeTab,
  savedRoutesCount,
}) => {
  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: number; isLens?: boolean }[] = [
    {
      id: 'explore',
      label: 'Explore',
      icon: <Compass className="w-5 h-5" />,
    },
    {
      id: 'collection',
      label: 'Collection',
      icon: <Landmark className="w-5 h-5" />,
    },
    {
      id: 'lens',
      label: 'Lens',
      icon: <Scan className="w-5 h-5" />,
      isLens: true,
    },
    {
      id: 'routes',
      label: 'Routes',
      icon: <Route className="w-5 h-5" />,
      badge: savedRoutesCount > 0 ? savedRoutesCount : undefined,
    },
    {
      id: 'support',
      label: 'Support',
      icon: <HeartHandshake className="w-5 h-5" />,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-5 h-5" />,
    },
  ];

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#e5e7eb] pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
    >
      <div className="max-w-lg mx-auto px-2 sm:px-4 h-16 flex items-center justify-around">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={tab.badge !== undefined ? `${tab.label} (${tab.badge} in route)` : tab.label}
              className={`relative flex flex-col items-center justify-center min-w-[48px] sm:min-w-[56px] min-h-[44px] py-1 px-1.5 rounded-xl transition-colors group cursor-pointer ${
                tab.isLens
                  ? isActive
                    ? 'text-[#b91c1c]'
                    : 'text-[#111827] hover:text-[#b91c1c]'
                  : isActive
                  ? 'text-[#b91c1c]'
                  : 'text-[#6b7280] hover:text-[#111827]'
              }`}
            >
              <div
                className={`relative flex items-center justify-center transition-transform ${
                  tab.isLens
                    ? isActive
                      ? 'w-8 h-8 rounded-full bg-[#fee2e2] text-[#b91c1c] shadow-xs ring-2 ring-[#b91c1c]/30'
                      : 'w-8 h-8 rounded-full bg-[#f3f4f6] group-hover:bg-[#e5e7eb] text-[#111827]'
                    : ''
                }`}
              >
                {tab.icon}
                {tab.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-[#b91c1c] text-white text-[9px] font-bold flex items-center justify-center shadow-xs tabular-nums">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] mt-0.5 tracking-tight whitespace-nowrap ${
                  tab.isLens ? 'font-bold text-[#b91c1c]' : isActive ? 'font-bold' : 'font-medium'
                }`}
              >
                {tab.label}
              </span>
              {isActive && !tab.isLens && (
                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#b91c1c] mt-0.5"></span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
