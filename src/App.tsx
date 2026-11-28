import React, { useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { Header } from './components/Header';
import { LagoonRadar } from './components/LagoonRadar';
import { CuratedTrails } from './components/CuratedTrails';
import { ArtworkOfTheDay } from './components/ArtworkOfTheDay';
import { QuickNavigation } from './components/QuickNavigation';
import { BottomNavBar } from './components/BottomNavBar';
import { GisMapModal } from './components/GisMapModal';
import { MonumentDetailModal } from './components/MonumentDetailModal';
import { FilterModal } from './components/FilterModal';
import { CollectionScreen } from './components/CollectionScreen';
import { RoutesScreen } from './components/RoutesScreen';
import { SupportScreen } from './components/SupportScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { FieldSurveyModal } from './components/FieldSurveyModal';
import { LensScreen } from './components/LensScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MONUMENTS } from './data/monuments';
import {
  ActiveTab,
  MonumentCategory,
  Monument,
  CuratedTrail,
  Sestiere,
} from './types';

export default function App() {
  const [language, setLanguage] = useState<'en' | 'it'>(() => (localStorage.getItem('vpc-language') as 'en' | 'it') || 'en');
  const translatedOriginals = React.useRef(new WeakMap<Text, string>());
  const [activeTab, setActiveTab] = useState<ActiveTab>('explore');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MonumentCategory | 'All'>('All');
  const [quotaExceeded, setQuotaExceeded] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && Boolean(window.sessionStorage?.getItem('pv_gmp_quota_exceeded'));
    } catch {
      return false;
    }
  });

  // Modals & Sheets
  const [isGisMapOpen, setIsGisMapOpen] = useState(false);
  const [hasOpenedGisMap, setHasOpenedGisMap] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isFieldSurveyModalOpen, setIsFieldSurveyModalOpen] = useState(false);
  const [selectedMonumentForModal, setSelectedMonumentForModal] = useState<Monument | null>(null);
  const [selectedTrailForNavigation, setSelectedTrailForNavigation] = useState<CuratedTrail | null>(null);
  const [activeRouteForMap, setActiveRouteForMap] = useState<CuratedTrail | null>(null);
  const [activeStopIndexForMap, setActiveStopIndexForMap] = useState<number>(0);
  const [gisTargetCoords, setGisTargetCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingDonationCollectionId, setPendingDonationCollectionId] = useState<string | null>(null);
  const [openTrailPhotosNonce, setOpenTrailPhotosNonce] = useState(0);

  React.useEffect(() => {
    const translations: Record<string, string> = {
      'PreserVenice is a non-profit organization devoted to the preservation and restoration of public art in Venice, Italy.': 'PreserVenice è un’organizzazione senza scopo di lucro dedicata alla conservazione e al restauro dell’arte pubblica a Venezia, Italia.',
      'PreserVenice Website': 'Sito PreserVenice', 'About': 'Chi siamo', 'Search statues, monuments, reliefs, or GIS coordinates...': 'Cerca statue, monumenti, rilievi o coordinate GIS...',
      'Search Venetian artworks and GIS coordinates': 'Cerca opere veneziane e coordinate GIS', 'Filter Options': 'Opzioni filtro', 'Filter by Sestiere, Type, Attributes': 'Filtra per sestiere, tipo e attributi',
      'Interactive GIS Map': 'Mappa GIS interattiva', 'Statues': 'Statue', 'Monuments': 'Monumenti', 'Reliefs': 'Rilievi', 'Surveys': 'Rilievi sul campo', 'All': 'Tutti',
      'Explore': 'Esplora', 'Collection': 'Collezione', 'Lens': 'Obiettivo', 'Routes': 'Itinerari', 'Support': 'Sostieni', 'Settings': 'Impostazioni',
      'Explore Venice’s monuments': 'Esplora i monumenti di Venezia', 'Search': 'Cerca', 'Loading...': 'Caricamento...'
    };
    localStorage.setItem('vpc-language', language);
    document.documentElement.lang = language;
    const originals = translatedOriginals.current;
    const apply = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (!originals.has(node)) originals.set(node, node.nodeValue || '');
        const original = originals.get(node) || '';
        const next = language === 'it' ? (translations[original.trim()] || original) : original;
        if (node.nodeValue !== next) node.nodeValue = next;
      }
      document.querySelectorAll<HTMLInputElement>('[placeholder], [aria-label], [title]').forEach((el) => {
        for (const attr of ['placeholder', 'aria-label', 'title'] as const) {
          if (!el.hasAttribute(attr)) continue;
          const key = `langOriginal${attr}`;
          if (!el.dataset[key]) el.dataset[key] = el.getAttribute(attr) || '';
          const original = el.dataset[key];
          const next = language === 'it' ? (translations[original] || original) : original;
          if (el.getAttribute(attr) !== next) el.setAttribute(attr, next);
        }
      });
      const picker = document.querySelector<HTMLElement>('[data-language-flag]');
      const flag = language === 'it' ? '🇮🇹' : '🇬🇧';
      if (picker && picker.textContent !== flag) picker.textContent = flag;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);

  // Saved user custom route items (anchored to valid Survey123 record)
  const [savedRouteIds, setSavedRouteIds] = useState<string[]>([MONUMENTS[0].id]);

  // Listen for Google Maps quota events
  React.useEffect(() => {
    const handleQuota = () => setQuotaExceeded(true);
    const handleQuotaReset = () => setQuotaExceeded(false);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    window.addEventListener('gmp-quota-reset', handleQuotaReset);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', handleQuota);
      window.removeEventListener('gmp-quota-reset', handleQuotaReset);
    };
  }, []);

  React.useEffect(() => {
    if (isGisMapOpen) {
      setHasOpenedGisMap(true);
    }
  }, [isGisMapOpen]);

  const hasOpenModal =
    isGisMapOpen ||
    Boolean(selectedMonumentForModal) ||
    isFilterModalOpen ||
    isFieldSurveyModalOpen;

  React.useEffect(() => {
    if (!hasOpenModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [hasOpenModal]);

  const mapsApiKey = ((import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY as string) || '';

  // Filter parameters aligned strictly with Survey123 dataset fields
  const [selectedSestiere, setSelectedSestiere] = useState<Sestiere | 'All'>('All');
  const [onlyWithNotes, setOnlyWithNotes] = useState(false);
  const [onlyMultiPhoto, setOnlyMultiPhoto] = useState(false);
  const [only3D, setOnly3D] = useState(false);

  // Featured artwork of the day from imported Venice Survey123 dataset
  const artworkOfTheDay =
    MONUMENTS.find((m) => m.id === 'a92deb11-7c77-4d4c-8b6e-6142b9fa535d') || MONUMENTS[0];

  const handleToggleRoute = (id: string) => {
    setSavedRouteIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleResetFilters = () => {
    setSelectedSestiere('All');
    setSelectedCategory('All');
    setOnlyWithNotes(false);
    setOnlyMultiPhoto(false);
    setOnly3D(false);
  };

  const handleExploreTrail = (trail: CuratedTrail) => {
    setSelectedTrailForNavigation(trail);
    setActiveRouteForMap(trail);
    setActiveStopIndexForMap(0);
    setActiveTab('routes');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCategoryFromQuickNav = (cat: MonumentCategory) => {
    setSelectedCategory(cat);
    setOnly3D(false);
    setActiveTab('collection');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const appContent = (
    <div className="min-h-screen bg-[#ffffff] text-[#111827] selection:bg-[#fee2e2] selection:text-[#b91c1c] flex flex-col justify-between">
      {/* Sticky Google Maps Quota Warning Banner */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Explore Tab (kept mounted via CSS to avoid remounting Google Map across tab switches) */}
      <main
        className={activeTab === 'explore' ? 'pb-20' : 'hidden'}
        aria-hidden={activeTab !== 'explore'}
      >
        {/* Header with Search and Categories */}
        <Header
          language={language}
          onLanguageChange={setLanguage}
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            if (q.trim().length > 1) {
              setActiveTab('collection');
            }
          }}
          selectedCategory={selectedCategory}
          onSelectCategory={(cat) => {
            setSelectedCategory(cat);
            setOnly3D(false);
            if (cat !== 'All') {
              setActiveTab('collection');
            }
          }}
          onOpenFilter={() => setIsFilterModalOpen(true)}
          onOpenGisMap={() => {
            setGisTargetCoords(null);
            setIsGisMapOpen(true);
          }}
          onNavigateTab={(tab) => {
            setActiveTab(tab);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />

        {/* Nearby Dorsoduro Radar Section */}
        <LagoonRadar
          isVisible={activeTab === 'explore'}
          quotaExceeded={quotaExceeded}
          onLaunchGis={() => {
            setGisTargetCoords(null);
            setIsGisMapOpen(true);
          }}
          onSelectMonumentId={(id) => {
            const target = MONUMENTS.find((m) => m.id === id);
            if (target) setSelectedMonumentForModal(target);
          }}
        />

        {/* Popular Curated Trails Section */}
        <CuratedTrails
          onViewAllTrails={() => {
            setActiveTab('routes');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onExploreTrail={handleExploreTrail}
        />

        {/* Artwork of the Day Section */}
        <ArtworkOfTheDay
          monument={artworkOfTheDay}
          onViewDetails={(m) => setSelectedMonumentForModal(m)}
          onToggleRoute={handleToggleRoute}
          isInRoute={savedRouteIds.includes(artworkOfTheDay.id)}
        />

        {/* Quick Navigation / Spatial Toolset */}
        <QuickNavigation
          onSelectCategory={handleCategoryFromQuickNav}
          onOpenGis3D={() => {
            setGisTargetCoords(null);
            setIsGisMapOpen(true);
          }}
        />
      </main>

      {activeTab === 'collection' && (
        <CollectionScreen
          onSelectMonument={(m) => setSelectedMonumentForModal(m)}
          onToggleRoute={handleToggleRoute}
          savedRouteIds={savedRouteIds}
          onOpenFilter={() => setIsFilterModalOpen(true)}
          onOpenGisMap={() => {
            setGisTargetCoords(null);
            setIsGisMapOpen(true);
          }}
          initialCategory={selectedCategory}
          initialSearchQuery={searchQuery}
          selectedSestiere={selectedSestiere}
          onClearSestiere={() => setSelectedSestiere('All')}
          onlyWithNotes={onlyWithNotes}
          onlyMultiPhoto={onlyMultiPhoto}
          only3D={only3D}
          onNavigateToSupport={(collectionId) => {
            setPendingDonationCollectionId(collectionId);
            setActiveTab('support');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      {activeTab === 'lens' && (
        <LensScreen
          onSelectMonument={(m) => setSelectedMonumentForModal(m)}
          onOpenGisLocation={(coords) => {
            setGisTargetCoords(coords);
            setIsGisMapOpen(true);
          }}
          onToggleRoute={handleToggleRoute}
          isInRoute={(id) => savedRouteIds.includes(id)}
          onBrowseCatalog={() => {
            setSelectedCategory('All');
            setActiveTab('collection');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenCitizenSurvey={() => setIsFieldSurveyModalOpen(true)}
        />
      )}

      {activeTab === 'routes' && (
        <RoutesScreen
          savedRouteIds={savedRouteIds}
          onRemoveFromRoute={handleToggleRoute}
          onClearCustomRoute={() => setSavedRouteIds([])}
          onSelectMonument={(m) => setSelectedMonumentForModal(m)}
          onOpenGisMap={() => {
            setGisTargetCoords(null);
            setIsGisMapOpen(true);
          }}
          onOpenGisRoute={(trail, stopIndex = 0) => {
            setActiveRouteForMap(trail);
            setActiveStopIndexForMap(stopIndex);
            setGisTargetCoords(null);
            setIsGisMapOpen(true);
          }}
          selectedTrailForNavigation={selectedTrailForNavigation}
          onSelectTrail={(trail) => {
            setSelectedTrailForNavigation(trail);
            setActiveRouteForMap(trail);
            setActiveStopIndexForMap(0);
          }}
          onClearSelectedTrail={() => {
            setSelectedTrailForNavigation(null);
            setActiveRouteForMap(null);
          }}
          openTrailPhotosNonce={openTrailPhotosNonce}
        />
      )}

      {activeTab === 'support' && (
        <SupportScreen
          onOpenFieldSurvey={() => setIsFieldSurveyModalOpen(true)}
          onOpenGisMap={() => {
            setGisTargetCoords(null);
            setIsGisMapOpen(true);
          }}
          initialOpenDonationCollectionId={pendingDonationCollectionId}
          onConsumeInitialDonation={() => setPendingDonationCollectionId(null)}
        />
      )}

      {activeTab === 'settings' && <SettingsScreen />}

      {/* Official PreserVenice Website Footer */}
      <footer className="w-full bg-white pb-20 pt-4 text-center text-xs text-[#4b5563]">
        <div className="max-w-4xl mx-auto px-4">
          <div className="border-t-2 border-[#b91c1c] mb-4"></div>
          <p>
            Copyright &copy; 2013 &middot;{' '}
            <a
              href="https://preservenice.org/index.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#b91c1c] font-bold hover:underline"
            >
              PreserVenice
            </a>{' '}
            &middot; All Rights Reserved
          </p>
        </div>
      </footer>

      {/* Global Bottom Navigation Bar */}
      <BottomNavBar
        activeTab={activeTab}
        onChangeTab={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        savedRoutesCount={savedRouteIds.length}
      />

      {/* Full GIS Cartography Modal with Google Maps & Active Route (lazy-mounted on first open, kept mounted thereafter) */}
      {(isGisMapOpen || hasOpenedGisMap) &&
        (mapsApiKey && !quotaExceeded ? (
          <APIProvider
            apiKey={mapsApiKey}
            libraries={['places', 'marker', 'routes', 'geometry']}
            language="en"
            region="IT"
            onError={(err) => {
              const msg = String((err as any)?.message || err || '');
              if (
                msg.includes('OverQuota') ||
                msg.includes('Quota') ||
                msg.includes('OVER_QUERY_LIMIT') ||
                msg.includes('RESOURCE_EXHAUSTED')
              ) {
                try {
                  sessionStorage.setItem('pv_gmp_quota_exceeded', String(Date.now()));
                } catch {
                  // Ignore storage errors
                }
                window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
              }
            }}
          >
            <GisMapModal
              isOpen={isGisMapOpen}
              onClose={() => setIsGisMapOpen(false)}
              onSelectMonument={(m) => setSelectedMonumentForModal(m)}
              targetCoords={gisTargetCoords}
              activeRoute={activeRouteForMap}
              activeStopIndex={activeStopIndexForMap}
              onClearActiveRoute={() => setActiveRouteForMap(null)}
              quotaExceeded={quotaExceeded}
              onOpenTrailPhotosInMenu={(trail) => {
                setSelectedTrailForNavigation(trail);
                setActiveRouteForMap(trail);
                setIsGisMapOpen(false);
                setActiveTab('routes');
                setOpenTrailPhotosNonce((n) => n + 1);
              }}
            />
          </APIProvider>
        ) : (
          <GisMapModal
            isOpen={isGisMapOpen}
            onClose={() => setIsGisMapOpen(false)}
            onSelectMonument={(m) => setSelectedMonumentForModal(m)}
            targetCoords={gisTargetCoords}
            activeRoute={activeRouteForMap}
            activeStopIndex={activeStopIndexForMap}
            onClearActiveRoute={() => setActiveRouteForMap(null)}
            quotaExceeded={quotaExceeded}
            onOpenTrailPhotosInMenu={(trail) => {
              setSelectedTrailForNavigation(trail);
              setActiveRouteForMap(trail);
              setIsGisMapOpen(false);
              setActiveTab('routes');
              setOpenTrailPhotosNonce((n) => n + 1);
            }}
          />
        ))}

      {/* Monument Detail Archival Modal */}
      <MonumentDetailModal
        monument={selectedMonumentForModal}
        onClose={() => setSelectedMonumentForModal(null)}
        onToggleRoute={handleToggleRoute}
        isInRoute={selectedMonumentForModal ? savedRouteIds.includes(selectedMonumentForModal.id) : false}
        onLaunchGisLocation={(coords) => {
          setGisTargetCoords(coords);
          setIsGisMapOpen(true);
        }}
      />

      {/* Filter Parameters Modal */}
      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        selectedSestiere={selectedSestiere}
        onChangeSestiere={setSelectedSestiere}
        selectedCategory={selectedCategory}
        onChangeCategory={setSelectedCategory}
        onlyWithNotes={onlyWithNotes}
        onChangeOnlyWithNotes={setOnlyWithNotes}
        onlyMultiPhoto={onlyMultiPhoto}
        onChangeOnlyMultiPhoto={setOnlyMultiPhoto}
        only3D={only3D}
        onChangeOnly3D={setOnly3D}
        onReset={handleResetFilters}
      />

      {/* Citizen GIS Field Survey Submission Modal */}
      <FieldSurveyModal
        isOpen={isFieldSurveyModalOpen}
        onClose={() => setIsFieldSurveyModalOpen(false)}
        onSubmitSurvey={(surveyData) => {
          console.log('New field survey recorded:', surveyData);
        }}
      />
    </div>
  );

  return <ErrorBoundary>{appContent}</ErrorBoundary>;
}
