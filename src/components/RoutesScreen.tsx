import React, { useState } from 'react';
import { 
  Route, 
  MapPin, 
  Clock, 
  Star, 
  Navigation, 
  ArrowRight, 
  Compass, 
  Trash2, 
  Footprints,
  CheckCircle,
  Camera,
  Maximize2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../firebase';
import { CURATED_TRAILS } from '../data/routes';
import { MONUMENTS, getRegionDisplayName } from '../data/monuments';
import { CuratedTrail, Monument } from '../types';
import { getDistanceKm } from '../utils/directions';
import {
  deleteTrailPhoto,
  isPremadeTrail,
  subscribeToTrailPhotos,
  TrailPhoto,
} from '../services/trailPhotos';
import { ImageLightboxModal } from './ImageLightboxModal';
import { ArtworkImage } from './ArtworkImage';

interface RoutesScreenProps {
  savedRouteIds: string[];
  onRemoveFromRoute: (id: string) => void;
  onClearCustomRoute: () => void;
  onSelectMonument: (monument: Monument) => void;
  onOpenGisMap: () => void;
  onOpenGisRoute: (trail: CuratedTrail, stopIndex?: number) => void;
  selectedTrailForNavigation: CuratedTrail | null;
  onSelectTrail?: (trail: CuratedTrail) => void;
  onClearSelectedTrail: () => void;
  openTrailPhotosNonce?: number;
}

export const RoutesScreen: React.FC<RoutesScreenProps> = ({
  savedRouteIds,
  onRemoveFromRoute,
  onClearCustomRoute,
  onSelectMonument,
  onOpenGisMap,
  onOpenGisRoute,
  selectedTrailForNavigation,
  onSelectTrail,
  onClearSelectedTrail,
  openTrailPhotosNonce = 0,
}) => {
  const [activeTrail, setActiveTrail] = useState<CuratedTrail | null>(selectedTrailForNavigation);
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [tourCompletedMessage, setTourCompletedMessage] = useState<string | null>(null);

  const [trailPhotos, setTrailPhotos] = useState<TrailPhoto[]>([]);
  const [trailPhotosLoading, setTrailPhotosLoading] = useState(false);
  const [trailPhotosError, setTrailPhotosError] = useState<string | null>(null);
  const [isTrailPhotosOpen, setIsTrailPhotosOpen] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(() => auth.currentUser);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const trailPhotosSectionRef = React.useRef<HTMLDivElement | null>(null);

  const customMonuments = MONUMENTS.filter((m) => savedRouteIds.includes(m.id));

  const customDirectKm = customMonuments.reduce((sum, m, idx) => {
    if (idx === 0) return 0;
    return sum + getDistanceKm(customMonuments[idx - 1].coordinates, m.coordinates);
  }, 0);

  const buildCustomTrail = (): CuratedTrail => {
    const coveredRegions = Array.from(new Set(customMonuments.map((m) => m.sestiere)));
    const coveredDisplay = Array.from(
      new Set(customMonuments.map((m) => m.regionDisplay))
    );
    const regionSummary =
      coveredDisplay.length > 0 ? coveredDisplay.slice(0, 2).join(' • ') : 'Venice';

    return {
      id: 'custom-route',
      number: 'CUSTOM ROUTE',
      title: 'My Custom Venetian Route',
      description: 'Personalized pedestrian trail connecting selected monuments via Venice walkways.',
      distanceKm: Number(customDirectKm.toFixed(2)),
      estimatedMinutes: Math.max(2, Math.round((customDirectKm * 1000) / 70)),
      stopsCount: customMonuments.length,
      rating: undefined,
      reviewsCount: undefined,
      imageUrl: customMonuments[0]?.imageUrl || '',
      tags: ['Custom Itinerary', regionSummary],
      sestieriCovered: coveredRegions,
      vaporettoAccessStop: `${regionSummary}, Venice`,
      stops: customMonuments.map((m, idx) => {
        const legDirectM =
          idx > 0
            ? Math.round(
                getDistanceKm(customMonuments[idx - 1].coordinates, m.coordinates) * 1000
              )
            : 0;
        return {
          monumentId: m.id,
          order: idx + 1,
          walkingTimeMinutes: legDirectM > 0 ? Math.max(1, Math.round(legDirectM / 70)) : 0,
          walkingDistanceMeters: legDirectM,
          highlightNote: m.generalNotes
            ? `${m.title}: ${m.generalNotes}`
            : `${m.title} (${m.coordinates.formatted})`,
          bridgesToCross: 0,
        };
      }),
    };
  };

  // If user selected a trail from another screen, sync it and ensure it starts at Stop 1 (index 0)
  React.useEffect(() => {
    if (selectedTrailForNavigation) {
      setActiveTrail(selectedTrailForNavigation);
      setCurrentStepIndex(0);
      setIsNavigating(false);
    }
  }, [selectedTrailForNavigation]);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setCurrentUser(user));
    return () => unsub();
  }, []);

  React.useEffect(() => {
    if (!activeTrail || !isPremadeTrail(activeTrail)) {
      setTrailPhotos([]);
      setTrailPhotosLoading(false);
      setTrailPhotosError(null);
      return;
    }

    setTrailPhotosLoading(true);
    setTrailPhotosError(null);
    const unsub = subscribeToTrailPhotos(
      activeTrail.id,
      (photos) => {
        setTrailPhotos(photos);
        setTrailPhotosLoading(false);
        setTrailPhotosError(null);
      },
      (errMsg) => {
        setTrailPhotosLoading(false);
        setTrailPhotosError(errMsg);
      }
    );

    return () => unsub();
  }, [activeTrail?.id]);

  const scrollToTrailPhotos = React.useCallback(() => {
    setIsTrailPhotosOpen(true);
    window.setTimeout(() => {
      trailPhotosSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, []);

  React.useEffect(() => {
    if (openTrailPhotosNonce > 0 && activeTrail && isPremadeTrail(activeTrail)) {
      scrollToTrailPhotos();
    }
  }, [openTrailPhotosNonce, activeTrail, scrollToTrailPhotos]);

  const handleDeleteOwnPhoto = async (photoId: string) => {
    setDeletingPhotoId(photoId);
    try {
      await deleteTrailPhoto(photoId);
      setConfirmDeleteId(null);
    } catch (err: any) {
      setTrailPhotosError(err?.message || 'Unable to delete photo right now.');
    } finally {
      setDeletingPhotoId(null);
    }
  };

  return (
    <div className="pt-4 pb-24 px-4 sm:px-6 max-w-4xl mx-auto w-full animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-wider text-[#b91c1c] uppercase mb-1">
            NARRATIVE EXPEDITIONS
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#111827] tracking-tight">
            Curated Heritage Trails
          </h1>
          <p className="text-xs text-[#6b7280] mt-1">
            Carefully calibrated walking itineraries connecting outdoor statues &amp; stone reliefs
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (activeTrail) {
              onOpenGisRoute(activeTrail, currentStepIndex);
            } else if (customMonuments.length > 0) {
              onOpenGisRoute(buildCustomTrail(), 0);
            } else {
              onOpenGisMap();
            }
          }}
          className="shrink-0 min-h-[40px] flex items-center gap-1.5 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#111827] px-3.5 py-2 rounded-xl text-xs font-semibold border border-[#e5e7eb] transition cursor-pointer whitespace-nowrap"
        >
          <Compass className="w-3.5 h-3.5 text-[#b91c1c] shrink-0" />
          <span>GIS View</span>
        </button>
      </div>

      {/* My Custom Itinerary Banner if user has added monuments */}
      {customMonuments.length > 0 && (
        <div className="mb-6 bg-gradient-to-br from-[#131b2e] to-[#0f172a] text-white rounded-3xl p-5 shadow-sm border border-white/10 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#93ccff] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#188ace] shrink-0" aria-hidden="true"></span>
              <span>Custom User Route</span>
            </span>
            <button
              type="button"
              onClick={onClearCustomRoute}
              className="min-h-[32px] px-2 text-xs text-white/75 hover:text-white flex items-center gap-1 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>Clear</span>
            </button>
          </div>

          <h3 className="font-display font-bold text-lg text-white">
            My Venetian Discovery Itinerary
          </h3>
          <p className="text-xs text-[#bec6e0] mt-0.5 tabular-nums">
            {customMonuments.length} monument{customMonuments.length === 1 ? '' : 's'} selected
            {customMonuments.length > 1
              ? ` • ${customDirectKm.toFixed(2)} km direct span (pedestrian route computed on map)`
              : ' • Live walking route computed from your GPS on map'}
          </p>

          <div className="mt-4 space-y-2">
            {customMonuments.map((m, idx) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-2 bg-white/10 hover:bg-white/15 p-2.5 rounded-2xl text-xs transition min-w-0"
              >
                <button
                  type="button"
                  onClick={() => onSelectMonument(m)}
                  className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1 text-left"
                >
                  <span className="w-5 h-5 rounded-full bg-[#b91c1c] text-white text-[10px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="font-semibold text-white truncate">{m.title}</span>
                  <span className="text-[10px] text-white/70 font-mono shrink-0 hidden sm:inline">
                    {m.regionDisplay}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onRemoveFromRoute(m.id)}
                  className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer shrink-0"
                  title="Remove from Route"
                  aria-label={`Remove ${m.title} from route`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              onOpenGisRoute(buildCustomTrail(), 0);
            }}
            className="mt-4 w-full min-h-[44px] bg-[#b91c1c] hover:bg-[#991b1b] text-white py-2.5 px-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition active:scale-[0.98] cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5 shrink-0" />
            <span>Map Custom Route on Lagoon GIS</span>
          </button>
        </div>
      )}

      {/* Active Trail Detail / Navigation Drawer */}
      {activeTrail && (
        <div className="mb-6 bg-white rounded-3xl p-4 sm:p-5 border-2 border-[#b91c1c] shadow-lg animate-in slide-in-from-top-4 duration-200 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="bg-black text-white px-3 py-1 rounded-full text-xs font-bold tracking-wider whitespace-nowrap">
              {activeTrail.number} • ACTIVE TOUR
            </span>
            <button
              onClick={() => {
                setActiveTrail(null);
                onClearSelectedTrail();
                setIsNavigating(false);
              }}
              className="text-xs text-[#6b7280] hover:text-[#111827] font-semibold cursor-pointer"
            >
              Close Trail
            </button>
          </div>

          <h2 className="font-display font-bold text-xl text-[#111827]">
            {activeTrail.title}
          </h2>
          <p className="text-xs text-[#4b5563] mt-1 leading-relaxed">
            {activeTrail.description}
          </p>

          {/* Vaporetto Line Access Pill */}
          <div className="mt-3 bg-[#fee2e2] text-[#b91c1c] px-3 py-2 rounded-2xl text-xs font-semibold flex items-center gap-2">
            <Compass className="w-4 h-4 shrink-0" />
            <span>Transit Access: {activeTrail.vaporettoAccessStop}</span>
          </div>

          {/* Waypoints List */}
          <div className="mt-4 pt-4 border-t border-[#e5e7eb]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#6b7280] mb-3">
              Route Itinerary ({activeTrail.stops.length} Guided Stops)
            </h4>

            <div className="space-y-3">
              {activeTrail.stops.map((stop, index) => {
                const monument = MONUMENTS.find((m) => m.id === stop.monumentId);
                const isCurrentStep = isNavigating && currentStepIndex === index;
                const isPassed = isNavigating && currentStepIndex > index;

                return (
                  <div
                    key={stop.monumentId}
                    className={`p-3.5 rounded-2xl transition border ${
                      isCurrentStep
                        ? 'bg-[#fee2e2]/40 border-[#b91c1c] shadow-sm'
                        : isPassed
                        ? 'bg-[#f3f4f6] border-transparent opacity-60'
                        : 'bg-[#f9fafb] border-[#e5e7eb]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 tabular-nums ${
                            isCurrentStep
                              ? 'bg-[#b91c1c] text-white'
                              : isPassed
                              ? 'bg-[#10b981] text-white'
                              : 'bg-black text-white'
                          }`}
                        >
                          {isPassed ? <CheckCircle className="w-3.5 h-3.5" /> : index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h5 className="font-display font-bold text-sm text-[#111827] break-words">
                            {monument?.title || 'Venetian Waypoint'}
                          </h5>
                          <span className="text-[11px] text-[#6b7280] block truncate">
                            {monument?.locationName || monument?.regionDisplay || 'Venice'}
                          </span>
                        </div>
                      </div>

                      {monument && (
                        <button
                          type="button"
                          onClick={() => onSelectMonument(monument)}
                          className="min-h-[32px] px-2 text-xs font-bold text-[#b91c1c] hover:underline shrink-0 cursor-pointer"
                        >
                          Inspect
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-[#4b5563] mt-2 italic bg-white/70 p-2 rounded-xl break-words">
                      "{stop.highlightNote}"
                    </p>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-[#6b7280]">
                      <span className="flex items-center gap-1">
                        <Footprints className="w-3 h-3 text-[#b91c1c] shrink-0" />
                        {index === 0 ? 'Starting stop' : 'Street & bridge route on GIS map'}
                      </span>
                      {stop.walkingDistanceMeters > 0 && (
                        <span className="tabular-nums">Direct span: ~{stop.walkingDistanceMeters}m</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Navigation Simulator Controls */}
            {tourCompletedMessage && (
              <div className="mt-4 bg-[#ecfdf5] border border-[#a7f3d0] text-[#065f46] px-3.5 py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2">
                <span>{tourCompletedMessage}</span>
                <button
                  type="button"
                  onClick={() => setTourCompletedMessage(null)}
                  className="text-[11px] font-bold text-[#047857] hover:underline cursor-pointer shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {!isNavigating ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setTourCompletedMessage(null);
                      setIsNavigating(true);
                      setCurrentStepIndex(0);
                      onOpenGisRoute(activeTrail, 0);
                    }}
                    className="min-w-[160px] flex-1 min-h-[44px] bg-black hover:bg-[#111827] text-white px-4 py-2.5 rounded-full text-xs font-bold flex items-center justify-center gap-2 transition active:scale-[0.98] cursor-pointer whitespace-nowrap"
                  >
                    <Navigation className="w-3.5 h-3.5 text-[#fee2e2] shrink-0" />
                    <span className="sm:hidden">Start Tour</span>
                    <span className="hidden sm:inline">Start Live GIS Walking Tour</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenGisRoute(activeTrail, 0)}
                    className="min-h-[44px] px-4 bg-[#0284c7] hover:bg-[#0369a1] text-white py-2.5 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-[0.98] shadow-sm cursor-pointer whitespace-nowrap shrink-0"
                    title="View route line on GIS map"
                  >
                    <Compass className="w-3.5 h-3.5 shrink-0" />
                    <span>GIS Map</span>
                  </button>
                  {isPremadeTrail(activeTrail) && (
                    <button
                      type="button"
                      onClick={scrollToTrailPhotos}
                      className="min-h-[44px] px-4 bg-[#fee2e2] hover:bg-[#fecaca] text-[#b91c1c] border border-[#b91c1c]/25 py-2.5 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
                      title="View public traveler photos for this trail"
                    >
                      <Camera className="w-3.5 h-3.5 shrink-0" />
                      <span>Photos ({trailPhotos.length})</span>
                    </button>
                  )}
                </>
              ) : (
                <div className="flex-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={currentStepIndex === 0}
                    onClick={() => setCurrentStepIndex((idx) => Math.max(idx - 1, 0))}
                    className="flex-1 min-w-[110px] min-h-[44px] bg-[#eceef0] disabled:opacity-40 text-[#191c1e] py-2.5 px-3 rounded-full text-xs font-bold transition cursor-pointer whitespace-nowrap"
                  >
                    Previous Stop
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (currentStepIndex < activeTrail.stops.length - 1) {
                        setCurrentStepIndex((idx) => idx + 1);
                      } else {
                        setTourCompletedMessage('Tour completed! You have visited all stops on this Venetian trail.');
                        setIsNavigating(false);
                        setCurrentStepIndex(0);
                      }
                    }}
                    className="flex-1 min-w-[110px] min-h-[44px] bg-[#b91c1c] hover:bg-[#991b1b] text-white py-2.5 px-3 rounded-full text-xs font-bold transition cursor-pointer whitespace-nowrap"
                  >
                    {currentStepIndex < activeTrail.stops.length - 1 ? 'Next Stop' : 'Complete Tour'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenGisRoute(activeTrail, currentStepIndex)}
                    className="min-h-[44px] px-4 bg-[#0284c7] hover:bg-[#0369a1] text-white py-2.5 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-[0.98] shadow-sm cursor-pointer whitespace-nowrap shrink-0"
                    title="View route line on GIS map"
                  >
                    <Compass className="w-4 h-4 shrink-0" />
                    <span>GIS Map</span>
                  </button>
                  {isPremadeTrail(activeTrail) && (
                    <button
                      type="button"
                      onClick={scrollToTrailPhotos}
                      className="min-h-[44px] px-4 bg-[#fee2e2] hover:bg-[#fecaca] text-[#b91c1c] border border-[#b91c1c]/25 py-2.5 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
                      title="View public traveler photos for this trail"
                    >
                      <Camera className="w-4 h-4 shrink-0" />
                      <span>Photos ({trailPhotos.length})</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Public Trail Photos Section at Bottom of Trail Menu (Premade Trails Only) */}
            {isPremadeTrail(activeTrail) && (
              <div
                ref={trailPhotosSectionRef}
                id="trail-public-photos"
                className="mt-6 pt-5 border-t border-[#e5e7eb]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h4 className="font-display font-bold text-sm text-[#111827] flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-[#b91c1c] shrink-0" />
                      <span>Public Trail Photos</span>
                    </h4>
                    <p className="text-[11px] text-[#6b7280] mt-0.5 tabular-nums">
                      {trailPhotosLoading
                        ? 'Loading community photos...'
                        : `${trailPhotos.length} public photo${trailPhotos.length === 1 ? '' : 's'} shared along this route`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenGisRoute(activeTrail, currentStepIndex)}
                      className="px-3 py-1.5 rounded-full bg-[#111827] hover:bg-black text-white text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                    >
                      <Camera className="w-3.5 h-3.5 text-[#ff6d4d]" />
                      <span>Add Photo on Map</span>
                    </button>
                    <button
                      type="button"
                      aria-expanded={isTrailPhotosOpen}
                      onClick={() => setIsTrailPhotosOpen((v) => !v)}
                      className="w-9 h-9 rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] flex items-center justify-center transition cursor-pointer"
                      aria-label={isTrailPhotosOpen ? 'Collapse trail photos' : 'Expand trail photos'}
                    >
                      {isTrailPhotosOpen ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {isTrailPhotosOpen && (
                  <div className="space-y-3">
                    {trailPhotosError && (
                      <div className="text-xs text-[#991b1b] bg-[#fef2f2] border border-[#fecaca] rounded-2xl px-3.5 py-2.5">
                        {trailPhotosError}
                      </div>
                    )}

                    {trailPhotosLoading ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {[0, 1, 2].map((skeletonIdx) => (
                          <div
                            key={skeletonIdx}
                            className="rounded-2xl bg-[#f3f4f6] h-44 animate-pulse border border-[#e5e7eb]"
                          />
                        ))}
                      </div>
                    ) : trailPhotos.length === 0 ? (
                      <div className="rounded-2xl bg-[#f9fafb] border border-dashed border-[#cbd5e1] p-5 text-center space-y-2">
                        <Camera className="w-7 h-7 text-[#b91c1c] mx-auto" />
                        <p className="text-xs font-bold text-[#111827]">
                          No public trail photos yet
                        </p>
                        <p className="text-[11px] text-[#6b7280] max-w-sm mx-auto leading-relaxed">
                          Open this trail on the GIS Map and tap Take Route Photo to share the first public photo along {activeTrail.title}.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {trailPhotos.map((photo, idx) => {
                          const isOwner = currentUser?.uid === photo.authorUid;
                          const isConfirmingDelete = confirmDeleteId === photo.id;
                          const dateStr = new Date(photo.createdAtMs).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          });

                          return (
                            <div
                              key={photo.id}
                              className="rounded-2xl overflow-hidden border border-[#e5e7eb] bg-[#f9fafb] flex flex-col min-w-0"
                            >
                              <button
                                type="button"
                                onClick={() => setLightboxIndex(idx)}
                                className="relative aspect-[4/3] w-full bg-[#111827] overflow-hidden cursor-zoom-in group"
                                title="Click to view full uncropped photo"
                              >
                                <img
                                  src={photo.imageDataUrl}
                                  alt={photo.caption || `Trail photo by ${photo.authorName}`}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  loading="lazy"
                                />
                                <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
                                  <Maximize2 className="w-3 h-3" />
                                </span>
                              </button>

                              <div className="p-2.5 flex-1 flex flex-col justify-between gap-1.5 text-[11px] min-w-0">
                                <div className="min-w-0">
                                  <div className="flex items-center justify-between gap-1 min-w-0">
                                    <span className="font-bold text-[#111827] truncate">
                                      {photo.authorName}
                                    </span>
                                    <span className="text-[10px] text-[#6b7280] shrink-0 tabular-nums">
                                      {dateStr}
                                    </span>
                                  </div>
                                  {photo.caption && (
                                    <p className="text-[#374151] mt-1 line-clamp-2 leading-snug break-words">
                                      {photo.caption}
                                    </p>
                                  )}
                                  {photo.stopTitle && (
                                    <div className="flex items-center gap-1 text-[10px] text-[#6b7280] mt-1 truncate">
                                      <MapPin className="w-3 h-3 text-[#b91c1c] shrink-0" />
                                      <span className="truncate">{photo.stopTitle}</span>
                                    </div>
                                  )}
                                </div>

                                {isOwner && (
                                  <div className="pt-1.5 border-t border-[#e5e7eb] flex items-center justify-end gap-1.5">
                                    {isConfirmingDelete ? (
                                      <>
                                        <button
                                          type="button"
                                          disabled={deletingPhotoId === photo.id}
                                          onClick={() => handleDeleteOwnPhoto(photo.id)}
                                          className="text-[10px] font-bold text-white bg-[#b91c1c] hover:bg-[#991b1b] px-2 py-0.5 rounded-full cursor-pointer disabled:opacity-50"
                                        >
                                          {deletingPhotoId === photo.id ? 'Deleting...' : 'Confirm'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteId(null)}
                                          className="text-[10px] font-semibold text-[#6b7280] hover:text-[#111827] cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(photo.id)}
                                        className="text-[10px] text-[#6b7280] hover:text-[#b91c1c] flex items-center gap-1 cursor-pointer"
                                        title="Delete your photo"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                        <span>Delete</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* All Curated Trails List */}
      <div className="space-y-4">
        {CURATED_TRAILS.map((trail) => {
          const regionsLabel =
            trail.sestieriCovered.map(getRegionDisplayName).join(' · ') || 'Venice';
          return (
            <article
              key={trail.id}
              className="bg-white rounded-3xl overflow-hidden border border-[#e5e7eb] shadow-sm hover:shadow-md transition duration-200 flex flex-col sm:flex-row"
            >
              <div className="relative h-44 sm:h-auto sm:w-56 shrink-0 bg-[#f3f4f6] overflow-hidden">
                <ArtworkImage
                  src={trail.imageUrl}
                  alt={trail.title}
                  surveyCode={trail.number}
                  regionLabel={regionsLabel}
                  className="w-full h-full object-cover"
                />
                <span className="absolute top-3 left-3 bg-black/80 text-white backdrop-blur-md px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap">
                  {trail.number}
                </span>
              </div>

              <div className="p-4 sm:p-5 flex-1 min-w-0 flex flex-col justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5 min-w-0">
                    {trail.rating !== undefined ? (
                      <div className="flex items-center gap-1 text-xs font-bold text-[#111827] min-w-0">
                        <Star className="w-3.5 h-3.5 fill-[#b91c1c] text-[#b91c1c] shrink-0" />
                        <span className="tabular-nums">
                          {trail.rating} ({trail.reviewsCount})
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#b91c1c] min-w-0 break-words">
                        {regionsLabel} · Survey123
                      </span>
                    )}
                    {trail.featuredBadge && (
                      <span className="bg-[#b91c1c] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap shrink-0 max-w-full truncate">
                        {trail.featuredBadge}
                      </span>
                    )}
                  </div>

                  <h3 className="font-display font-bold text-lg text-[#111827] leading-snug break-words">
                    {trail.title}
                  </h3>
                  <p className="text-xs text-[#45464d] mt-1.5 leading-relaxed line-clamp-2">
                    {trail.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs text-[#6b7280] font-semibold tabular-nums">
                    <span>~{trail.distanceKm} km est.</span>
                    <span aria-hidden="true">·</span>
                    <span>~{trail.estimatedMinutes} min est.</span>
                    <span aria-hidden="true">·</span>
                    <span>{trail.stopsCount} stops</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#f2f4f6] flex flex-wrap items-center justify-between gap-2.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
                    {trail.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] font-medium bg-[#eceef0] text-[#45464d] px-2.5 py-0.5 rounded-full max-w-full truncate"
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTrail(trail);
                      onSelectTrail?.(trail);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="min-h-[40px] bg-black hover:bg-[#191c1e] text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <span>Select Trail</span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {activeTrail && lightboxIndex !== null && trailPhotos[lightboxIndex] && (
        <ImageLightboxModal
          isOpen={true}
          images={trailPhotos.map((p) => p.imageDataUrl)}
          currentIndex={lightboxIndex}
          title={trailPhotos[lightboxIndex].caption || `${activeTrail.title} — Trail Photo`}
          subtitle={`Shared by ${trailPhotos[lightboxIndex].authorName}`}
          onClose={() => setLightboxIndex(null)}
          onChangeIndex={(idx) => setLightboxIndex(idx)}
        />
      )}
    </div>
  );
};
