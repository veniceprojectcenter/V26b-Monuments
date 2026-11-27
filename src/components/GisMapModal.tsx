import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  X,
  Compass,
  ArrowRight,
  Box,
  Navigation,
  LocateFixed,
  AlertCircle,
  CornerUpLeft,
  CornerUpRight,
  ArrowUp,
  Flag,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Footprints,
  CheckCircle2,
  RefreshCw,
  Camera,
} from 'lucide-react';
import { MONUMENTS, REGION_MAP_VIEWPORTS } from '../data/monuments';
import { Monument, CuratedTrail } from '../types';
import { isPremadeTrail } from '../services/trailPhotos';
import { TrailPhotoUploadModal } from './TrailPhotoUploadModal';
import { ArtworkImage } from './ArtworkImage';
import {
  VeniceGoogleMap,
  ApproachRouteInfo,
  ActiveLegInfo,
  RouteSummaryInfo,
} from './VeniceGoogleMap';
import {
  LatLngPoint,
  RouteStatus,
  WalkingStep,
  computeBearing,
  computeRemainingRouteMetrics,
  distanceFromPointToPolylineMeters,
  formatDistance,
  formatWalkingDuration,
  getDistanceKm,
  optimizeRouteStopsForLocation,
} from '../utils/directions';

interface GisMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMonument: (monument: Monument) => void;
  targetCoords?: { lat: number; lng: number } | null;
  activeRoute?: CuratedTrail | null;
  onClearActiveRoute?: () => void;
  activeStopIndex?: number;
  quotaExceeded?: boolean;
  onOpenTrailPhotosInMenu?: (trail: CuratedTrail) => void;
}

const ARRIVAL_THRESHOLD_KM = 0.025; // 25 meters arrival radius
const OFF_ROUTE_THRESHOLD_METERS = 40; // Recalculate when > 40m off planned street polyline
const REROUTE_COOLDOWN_MS = 12000;
const REROUTE_MIN_MOVE_KM = 0.02;

function renderManeuverIcon(maneuver?: string) {
  const m = (maneuver || '').toUpperCase();
  if (m.includes('LEFT')) {
    return <CornerUpLeft className="w-6 h-6 text-white" />;
  }
  if (m.includes('RIGHT')) {
    return <CornerUpRight className="w-6 h-6 text-white" />;
  }
  if (m.includes('UTURN')) {
    return <RotateCcw className="w-6 h-6 text-white" />;
  }
  if (m === 'ARRIVE') {
    return <Flag className="w-6 h-6 text-white" />;
  }
  return <ArrowUp className="w-6 h-6 text-white" />;
}

export const GisMapModal: React.FC<GisMapModalProps> = ({
  isOpen,
  onClose,
  onSelectMonument,
  targetCoords,
  activeRoute,
  onClearActiveRoute,
  activeStopIndex = 0,
  quotaExceeded = false,
  onOpenTrailPhotosInMenu,
}) => {
  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'hybrid'>('satellite');
  const [currentCenter, setCurrentCenter] = useState(
    targetCoords || REGION_MAP_VIEWPORTS[0].coords
  );
  const [currentZoom, setCurrentZoom] = useState(
    targetCoords ? 17 : REGION_MAP_VIEWPORTS[0].zoom
  );
  const [selectedMonument, setSelectedMonument] = useState<Monument | null>(MONUMENTS[0]);
  const [activeLayer, setActiveLayer] = useState<
    'all' | 'statues' | 'reliefs' | 'monuments' | '3d'
  >('all');
  const [activeIsland, setActiveIsland] = useState<string>(REGION_MAP_VIEWPORTS[0].name);
  const [currentStopIndex, setCurrentStopIndex] = useState(activeStopIndex);

  // Actual GPS location & heading states (zero manual map-click override)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userHeading, setUserHeading] = useState<number | null>(null);
  const [userApproachInfo, setUserApproachInfo] = useState<ApproachRouteInfo | null>(null);
  const [activeLegInfo, setActiveLegInfo] = useState<ActiveLegInfo | null>(null);
  const [routeSummaryInfo, setRouteSummaryInfo] = useState<RouteSummaryInfo | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Walking navigation states
  // - 'approach': walking from GPS to Stop 1 (green street route)
  // - 'leg': walking from currentStopIndex to currentStopIndex + 1 (blue active leg, or live rerouted)
  // - 'single': walking from GPS to a single selected monument (no multi-stop trail)
  // - 'at_stop': arrived at art piece or clicked Next -> shows picture card at bottom
  const [navigationPhase, setNavigationPhase] = useState<'approach' | 'leg' | 'at_stop' | 'single'>('approach');
  const [singleNavMonument, setSingleNavMonument] = useState<Monument | null>(null);
  const [bottomMode, setBottomMode] = useState<'directions' | 'monument'>('monument');
  const [isNavigationActive, setIsNavigationActive] = useState(false);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [arrivedStopIndex, setArrivedStopIndex] = useState<number | null>(null);
  const [isStepsExpanded, setIsStepsExpanded] = useState(false);
  const [approachFetchNonce, setApproachFetchNonce] = useState(0);
  const [legRerouteActive, setLegRerouteActive] = useState(false);
  const [legRerouteNonce, setLegRerouteNonce] = useState(0);
  const [recenterNonce, setRecenterNonce] = useState(0);
  const [isTrailPhotoModalOpen, setIsTrailPhotoModalOpen] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const prevGpsFixRef = useRef<{ lat: number; lng: number } | null>(null);
  const compassActiveRef = useRef(false);
  const lastRerouteRef = useRef<{ timestamp: number; location: LatLngPoint | null }>({
    timestamp: 0,
    location: null,
  });
  const routeOrderAnchorRef = useRef<{
    routeId: string;
    anchor: { lat: number; lng: number } | null;
    route: CuratedTrail;
  } | null>(null);

  // Lock route stop reordering to the initial GPS fix per route so stops don't re-order mid-walk
  const routeStopsKey = activeRoute?.stops.map((s) => s.monumentId).join(',') || '';
  const effectiveRoute = useMemo(() => {
    if (!activeRoute) {
      routeOrderAnchorRef.current = null;
      return null;
    }
    const sig = `${activeRoute.id}:${routeStopsKey}`;
    if (!routeOrderAnchorRef.current || routeOrderAnchorRef.current.routeId !== sig) {
      const optimized = optimizeRouteStopsForLocation(
        activeRoute,
        userLocation,
        MONUMENTS
      ) as CuratedTrail;
      routeOrderAnchorRef.current = {
        routeId: sig,
        anchor: userLocation,
        route: optimized,
      };
    } else if (!routeOrderAnchorRef.current.anchor && userLocation) {
      const optimized = optimizeRouteStopsForLocation(
        activeRoute,
        userLocation,
        MONUMENTS
      ) as CuratedTrail;
      routeOrderAnchorRef.current = {
        routeId: sig,
        anchor: userLocation,
        route: optimized,
      };
    }
    return routeOrderAnchorRef.current.route;
  }, [activeRoute, routeStopsKey, userLocation]);

  // Synchronize stop index & clear leg reroute override when route or stop changes
  useEffect(() => {
    setCurrentStopIndex(activeStopIndex ?? 0);
    setLegRerouteActive(false);
  }, [activeRoute?.id, activeStopIndex]);

  useEffect(() => {
    setLegRerouteActive(false);
  }, [currentStopIndex]);

  // Request iOS Safari DeviceOrientation permission cleanly inside user gestures when available
  const requestCompassPermission = useCallback(async () => {
    try {
      const DOE = window.DeviceOrientationEvent as any;
      if (DOE && typeof DOE.requestPermission === 'function') {
        const res = await DOE.requestPermission();
        return res === 'granted';
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  // Listen to device compass / facing orientation whenever navigation is active
  useEffect(() => {
    if (!isOpen || !isNavigationActive || typeof window === 'undefined') return;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const ev = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
      let headingDeg: number | null = null;

      if (typeof ev.webkitCompassHeading === 'number' && Number.isFinite(ev.webkitCompassHeading)) {
        headingDeg = ev.webkitCompassHeading;
      } else if (ev.absolute && typeof ev.alpha === 'number' && Number.isFinite(ev.alpha)) {
        const screenAngle = window.screen?.orientation?.angle || 0;
        headingDeg = (360 - ev.alpha + screenAngle + 360) % 360;
      }

      if (headingDeg !== null) {
        compassActiveRef.current = true;
        setUserHeading(Math.round(headingDeg));
      }
    };

    window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
    window.addEventListener('deviceorientation', handleOrientation as EventListener, true);

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
      window.removeEventListener('deviceorientation', handleOrientation as EventListener, true);
    };
  }, [isOpen, isNavigationActive]);

  // Mobile Geolocation: Request actual high-accuracy GPS position & start continuous watchPosition
  const handleRequestMobileLocation = useCallback(
    (options?: { followCamera?: boolean; bumpApproach?: boolean }) => {
      const followCamera = options?.followCamera ?? true;
      const bumpApproach = options?.bumpApproach ?? true;

      setGeoError(null);
      setIsLocating(true);
      if (followCamera) {
        setIsFollowingUser(true);
        setIsNavigationActive(true);
      }

      if (typeof window === 'undefined' || !navigator.geolocation) {
        setIsLocating(false);
        setGeoError('GPS geolocation is not supported by your mobile browser.');
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIsLocating(false);
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          prevGpsFixRef.current = coords;
          setUserLocation(coords);
          setCurrentCenter(coords);

          if (
            typeof pos.coords.heading === 'number' &&
            Number.isFinite(pos.coords.heading) &&
            pos.coords.heading >= 0
          ) {
            setUserHeading(Math.round(pos.coords.heading));
          }

          if (bumpApproach) {
            setApproachFetchNonce((n) => n + 1);
          }
          if (followCamera) {
            setRecenterNonce((n) => n + 1);
          }

          if (watchIdRef.current === null) {
            watchIdRef.current = navigator.geolocation.watchPosition(
              (updatedPos) => {
                const nextCoords = {
                  lat: updatedPos.coords.latitude,
                  lng: updatedPos.coords.longitude,
                };
                setUserLocation(nextCoords);

                if (
                  typeof updatedPos.coords.heading === 'number' &&
                  Number.isFinite(updatedPos.coords.heading) &&
                  updatedPos.coords.heading >= 0 &&
                  (updatedPos.coords.speed ?? 0) > 0.35
                ) {
                  setUserHeading(Math.round(updatedPos.coords.heading));
                } else if (!compassActiveRef.current && prevGpsFixRef.current) {
                  const movedKm = getDistanceKm(prevGpsFixRef.current, nextCoords);
                  if (movedKm >= 0.004) {
                    setUserHeading(Math.round(computeBearing(prevGpsFixRef.current, nextCoords)));
                    prevGpsFixRef.current = nextCoords;
                  }
                }
              },
              () => {
                // Graceful silent fallback on brief signal drops in narrow calli
              },
              {
                enableHighAccuracy: true,
                timeout: 12000,
                maximumAge: 2000,
              }
            );
          }
        },
        (err) => {
          setIsLocating(false);
          if (err.code === err.PERMISSION_DENIED) {
            setGeoError(
              'GPS location permission denied. Allow Location Services in browser settings to navigate.'
            );
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            setGeoError(
              'GPS signal temporarily unavailable. Check your device Location Services and try again.'
            );
          } else {
            setGeoError(
              'Unable to acquire GPS signal right now. Step toward an open campo and retry.'
            );
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        }
      );
    },
    []
  );

  const handleStopLocationTracking = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setUserLocation(null);
    setUserHeading(null);
    setUserApproachInfo(null);
    setLegRerouteActive(false);
    setGeoError(null);
    setIsFollowingUser(false);
    setSingleNavMonument(null);
    if (navigationPhase === 'single') {
      setIsNavigationActive(false);
      setBottomMode('monument');
    }
  }, [navigationPhase]);

  // Clean up watchPosition when modal closes
  const prevNavInitKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) {
      prevNavInitKeyRef.current = null;
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsNavigationActive(false);
      setIsFollowingUser(false);
      setSingleNavMonument(null);
      setLegRerouteActive(false);
      setIsTrailPhotoModalOpen(false);
    }
  }, [isOpen]);

  // Auto-enter Google Maps-style walking navigation once per open/route transition
  useEffect(() => {
    if (!isOpen) return;

    const initKey = `${activeRoute?.id || 'none'}:${Boolean(targetCoords)}:${activeStopIndex ?? 0}`;
    if (prevNavInitKeyRef.current === initKey) return;
    prevNavInitKeyRef.current = initKey;

    if (activeRoute && activeRoute.stops.length > 0 && !targetCoords) {
      const startIdx = Math.min(Math.max(0, activeStopIndex ?? 0), activeRoute.stops.length - 1);
      setSingleNavMonument(null);
      setNavigationPhase(startIdx === 0 ? 'approach' : 'leg');
      setBottomMode('directions');
      setArrivedStopIndex(null);
      setIsStepsExpanded(false);
      setIsNavigationActive(true);
      setIsFollowingUser(true);
      handleRequestMobileLocation({ followCamera: true, bumpApproach: true });
    } else {
      setIsNavigationActive(false);
      setIsFollowingUser(false);
      setBottomMode('monument');
    }
  }, [isOpen, activeRoute, targetCoords, activeStopIndex, handleRequestMobileLocation]);

  // Sync center & selected monument when targetCoords changes (single-monument inspection)
  useEffect(() => {
    if (isOpen && targetCoords) {
      setCurrentCenter(targetCoords);
      setCurrentZoom(17);
      setBottomMode('monument');
      const nearby = MONUMENTS.find(
        (m) =>
          Math.abs(m.coordinates.lat - targetCoords.lat) < 0.0002 &&
          Math.abs(m.coordinates.lng - targetCoords.lng) < 0.0002
      );
      if (nearby) {
        setSelectedMonument(nearby);
      }
    }
  }, [isOpen, targetCoords]);

  // Synchronize selectedMonument when stop index changes
  useEffect(() => {
    if (!isOpen) return;
    if (effectiveRoute && effectiveRoute.stops.length > 0) {
      const idx = Math.min(Math.max(0, currentStopIndex), effectiveRoute.stops.length - 1);
      const mon = MONUMENTS.find((m) => m.id === effectiveRoute.stops[idx]?.monumentId);
      if (mon) {
        setSelectedMonument((prev) => (prev?.id === mon.id ? prev : mon));
        if (!isFollowingUser) {
          setCurrentCenter((prev) =>
            Math.abs(prev.lat - mon.coordinates.lat) < 0.00001 &&
            Math.abs(prev.lng - mon.coordinates.lng) < 0.00001
              ? prev
              : { lat: mon.coordinates.lat, lng: mon.coordinates.lng }
          );
        }
      }
    }
  }, [effectiveRoute, currentStopIndex, isOpen, isFollowingUser]);

  // Determine the current target stop for navigation depending on navigationPhase
  const navTargetStopIndex = useMemo(() => {
    if (!effectiveRoute || effectiveRoute.stops.length === 0) return 0;
    if (navigationPhase === 'approach') return 0;
    if (navigationPhase === 'leg') {
      return Math.min(currentStopIndex + 1, effectiveRoute.stops.length - 1);
    }
    return Math.min(currentStopIndex, effectiveRoute.stops.length - 1);
  }, [effectiveRoute, navigationPhase, currentStopIndex]);

  const navTargetStop = effectiveRoute?.stops?.[navTargetStopIndex];
  const navTargetMonument = useMemo(() => {
    if (navigationPhase === 'single') {
      return singleNavMonument;
    }
    return navTargetStop ? MONUMENTS.find((m) => m.id === navTargetStop.monumentId) || null : null;
  }, [navigationPhase, singleNavMonument, navTargetStop]);

  // Auto-detect arrival (<= 25m) at the target artwork and reveal its Picture Card at the bottom
  useEffect(() => {
    if (
      !isOpen ||
      !isNavigationActive ||
      !userLocation ||
      !navTargetMonument ||
      navigationPhase === 'at_stop'
    ) {
      return;
    }

    const distToTargetKm = getDistanceKm(userLocation, navTargetMonument.coordinates);
    if (distToTargetKm <= ARRIVAL_THRESHOLD_KM) {
      if (navigationPhase === 'single') {
        setNavigationPhase('at_stop');
        setBottomMode('monument');
        setSelectedMonument(navTargetMonument);
        setIsStepsExpanded(false);
        return;
      }
      setCurrentStopIndex(navTargetStopIndex);
      setNavigationPhase('at_stop');
      setBottomMode('monument');
      setArrivedStopIndex(navTargetStopIndex);
      setSelectedMonument(navTargetMonument);
      setIsStepsExpanded(false);
      setLegRerouteActive(false);
    }
  }, [
    isOpen,
    isNavigationActive,
    userLocation,
    navTargetMonument,
    navTargetStopIndex,
    navigationPhase,
  ]);

  // Live Off-Route Deviation Detection & Throttled Pedestrian Recalculation
  useEffect(() => {
    if (
      !isOpen ||
      !isNavigationActive ||
      !userLocation ||
      !navTargetMonument ||
      navigationPhase === 'at_stop' ||
      isLocating
    ) {
      return;
    }

    const activeInfo =
      navigationPhase === 'approach' || navigationPhase === 'single'
        ? userApproachInfo
        : activeLegInfo;

    if (
      !activeInfo ||
      activeInfo.isCalculating ||
      activeInfo.status === 'QUOTA_EXCEEDED' ||
      activeInfo.status !== 'OK' ||
      activeInfo.path.length < 2
    ) {
      return;
    }

    const { distanceMeters } = distanceFromPointToPolylineMeters(userLocation, activeInfo.path);
    if (distanceMeters <= OFF_ROUTE_THRESHOLD_METERS) {
      return;
    }

    const now = Date.now();
    const elapsed = now - lastRerouteRef.current.timestamp;
    const movedSinceLastRerouteKm = lastRerouteRef.current.location
      ? getDistanceKm(lastRerouteRef.current.location, userLocation)
      : Infinity;

    if (elapsed >= REROUTE_COOLDOWN_MS && movedSinceLastRerouteKm >= REROUTE_MIN_MOVE_KM) {
      lastRerouteRef.current = { timestamp: now, location: userLocation };
      if (navigationPhase === 'approach' || navigationPhase === 'single') {
        setApproachFetchNonce((n) => n + 1);
      } else if (navigationPhase === 'leg') {
        setLegRerouteActive(true);
        setLegRerouteNonce((n) => n + 1);
      }
    }
  }, [
    isOpen,
    isNavigationActive,
    userLocation,
    navTargetMonument,
    navigationPhase,
    isLocating,
    userApproachInfo,
    activeLegInfo,
  ]);

  // Handler for "Walk from My Location" button in top route bar
  const handlePressWalkFromMyLocation = useCallback(async () => {
    await requestCompassPermission();
    setSingleNavMonument(null);
    setLegRerouteActive(false);
    setNavigationPhase('approach');
    setCurrentStopIndex(0);
    setBottomMode('directions');
    setArrivedStopIndex(null);
    setIsNavigationActive(true);
    setIsFollowingUser(true);
    setRecenterNonce((n) => n + 1);
    handleRequestMobileLocation({ followCamera: true, bumpApproach: true });
  }, [requestCompassPermission, handleRequestMobileLocation]);

  // Handler for single-artwork "Walk Here" button (when no multi-stop trail is active)
  const handleWalkToSingleMonument = useCallback(
    async (monument: Monument) => {
      await requestCompassPermission();
      setSingleNavMonument(monument);
      setNavigationPhase('single');
      setBottomMode('directions');
      setArrivedStopIndex(null);
      setIsStepsExpanded(false);
      setIsNavigationActive(true);
      setIsFollowingUser(true);
      setRecenterNonce((n) => n + 1);
      handleRequestMobileLocation({ followCamera: true, bumpApproach: true });
    },
    [requestCompassPermission, handleRequestMobileLocation]
  );

  // Handler for Retry Route inside failed route notice
  const handleRetryRoute = useCallback(() => {
    if (navigationPhase === 'leg') {
      setLegRerouteActive(true);
      setLegRerouteNonce((n) => n + 1);
    } else {
      setApproachFetchNonce((n) => n + 1);
    }
  }, [navigationPhase]);

  // Handler for Re-center button on map
  const handleRecenter = useCallback(async () => {
    await requestCompassPermission();
    setIsFollowingUser(true);
    setRecenterNonce((n) => n + 1);
    if (!userLocation) {
      handleRequestMobileLocation({ followCamera: true, bumpApproach: true });
    }
  }, [requestCompassPermission, userLocation, handleRequestMobileLocation]);

  // Handler for top "Next" button: advances to next art piece and reveals its Picture Card at bottom
  const handleTopNextClick = useCallback(() => {
    if (!effectiveRoute || effectiveRoute.stops.length === 0) {
      if (selectedMonument) {
        setBottomMode('monument');
        setNavigationPhase('at_stop');
      }
      return;
    }

    let nextIdx = currentStopIndex;
    if (navigationPhase === 'approach') {
      nextIdx = 0;
    } else if (currentStopIndex < effectiveRoute.stops.length - 1) {
      nextIdx = currentStopIndex + 1;
    }

    setCurrentStopIndex(nextIdx);
    setLegRerouteActive(false);
    setNavigationPhase('at_stop');
    setBottomMode('monument');
    setArrivedStopIndex(null);
    setIsStepsExpanded(false);

    const nextMon = MONUMENTS.find((m) => m.id === effectiveRoute.stops[nextIdx]?.monumentId);
    if (nextMon) {
      setSelectedMonument(nextMon);
      if (!isFollowingUser) {
        setCurrentCenter({ lat: nextMon.coordinates.lat, lng: nextMon.coordinates.lng });
      }
    }
  }, [effectiveRoute, currentStopIndex, navigationPhase, isFollowingUser, selectedMonument]);

  // Resume turn-by-turn directions from a stop card toward the next stop (or Stop 1)
  const handleStartLegDirections = useCallback(
    async (phase: 'approach' | 'leg') => {
      await requestCompassPermission();
      setLegRerouteActive(false);
      setNavigationPhase(phase);
      setBottomMode('directions');
      setArrivedStopIndex(null);
      setIsNavigationActive(true);
      setIsFollowingUser(true);
      setRecenterNonce((n) => n + 1);
      if (!userLocation) {
        handleRequestMobileLocation({ followCamera: true, bumpApproach: true });
      }
    },
    [requestCompassPermission, userLocation, handleRequestMobileLocation]
  );

  // Compute active navigation step, dynamic remaining distance, ETA, and explicit failure status
  const activeNavData = useMemo(() => {
    const info =
      navigationPhase === 'approach' || navigationPhase === 'single'
        ? userApproachInfo
        : activeLegInfo;

    const status: RouteStatus = info?.status ?? 'OK';
    const isUnavailable = status !== 'OK' && !(info?.isCalculating ?? false);
    const steps: WalkingStep[] = status === 'OK' ? info?.steps || [] : [];
    const path = status === 'OK' ? info?.path || [] : [];

    const directMeters =
      info?.directDistanceMeters ??
      (userLocation && navTargetMonument
        ? Math.round(getDistanceKm(userLocation, navTargetMonument.coordinates) * 1000)
        : null);

    const remainingMetrics =
      status === 'OK'
        ? computeRemainingRouteMetrics(
            userLocation,
            path,
            steps,
            info?.distanceMeters ?? null,
            info?.durationMillis ?? null
          )
        : null;

    const liveStepIndex = remainingMetrics?.liveStepIndex ?? 0;

    return {
      status,
      isUnavailable,
      errorReason: info?.errorReason,
      isCalculating: info?.isCalculating ?? false,
      isReroutedFromUser: Boolean(
        navigationPhase === 'leg' && (activeLegInfo as ActiveLegInfo | null)?.isReroutedFromUser
      ),
      distanceText:
        remainingMetrics?.remainingDistanceText ||
        (status === 'OK' ? info?.distanceText || 'Calculating...' : 'Unavailable'),
      durationText:
        remainingMetrics?.remainingDurationText ||
        (status === 'OK' ? info?.durationText || '...' : 'Unavailable'),
      directDistanceText: directMeters !== null ? formatDistance(directMeters) : null,
      currentStepRemainingText: remainingMetrics?.currentStepRemainingText ?? null,
      distanceFromRouteMeters: remainingMetrics?.distanceFromRouteMeters ?? 0,
      steps,
      liveStepIndex,
      currentStep: steps[liveStepIndex] || null,
      upcomingStep: steps[liveStepIndex + 1] || null,
    };
  }, [navigationPhase, userApproachInfo, activeLegInfo, userLocation, navTargetMonument]);

  const apiKey = ((import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY as string) || '';

  const filteredMonuments = useMemo(
    () =>
      MONUMENTS.filter((m) => {
        if (effectiveRoute && effectiveRoute.stops.some((s) => s.monumentId === m.id)) {
          return true;
        }
        if (activeLayer === 'statues') return m.category === 'Statues';
        if (activeLayer === 'reliefs') return m.category === 'Reliefs';
        if (activeLayer === 'monuments') return m.category === 'Monuments';
        if (activeLayer === '3d') return m.has3DModel;
        return true;
      }),
    [effectiveRoute, activeLayer]
  );

  const handleSelectPinMonument = useCallback((m: Monument) => {
    setSelectedMonument(m);
    setBottomMode('monument');
    setIsFollowingUser(false);
  }, []);

  const handleUserPanAway = useCallback(() => {
    setIsFollowingUser(false);
  }, []);

  const handleApproachInfoChange = useCallback((info: ApproachRouteInfo | null) => {
    setUserApproachInfo(info);
  }, []);

  const handleActiveLegInfoChange = useCallback((info: ActiveLegInfo | null) => {
    setActiveLegInfo(info);
  }, []);

  const handleRouteSummaryChange = useCallback((summary: RouteSummaryInfo | null) => {
    setRouteSummaryInfo(summary);
  }, []);

  const navigationTarget = useMemo(
    () => navTargetMonument?.coordinates || null,
    [navTargetMonument]
  );

  const singleNavTargetCoords = useMemo(
    () => (!effectiveRoute && singleNavMonument ? singleNavMonument.coordinates : null),
    [effectiveRoute, singleNavMonument]
  );

  const canAdvanceStop =
    Boolean(effectiveRoute) &&
    (navigationPhase === 'approach' ||
      navigationPhase === 'leg' ||
      (effectiveRoute ? currentStopIndex < effectiveRoute.stops.length - 1 : false));

  const hasAnotherStopAfterCurrent = Boolean(
    effectiveRoute && currentStopIndex < effectiveRoute.stops.length - 1
  );

  const showDirectionsCard =
    isNavigationActive &&
    bottomMode === 'directions' &&
    (Boolean(effectiveRoute) || Boolean(singleNavMonument));

  const showPremadeRoutePhotoButton = isPremadeTrail(effectiveRoute);

  // Header route total label: strictly use authentic Google Maps total when computed, never fake straight-line multiplier
  const routeSummaryBadgeText = (() => {
    if (!effectiveRoute) return '';
    if (routeSummaryInfo?.isCalculating) {
      return `${effectiveRoute.stops.length} stops • calculating walk...`;
    }
    if (
      routeSummaryInfo &&
      routeSummaryInfo.overallStatus === 'OK' &&
      routeSummaryInfo.totalDistanceMeters !== null &&
      routeSummaryInfo.totalDurationMillis !== null
    ) {
      return `${effectiveRoute.stops.length} stops • ${formatDistance(
        routeSummaryInfo.totalDistanceMeters
      )} • ${formatWalkingDuration(routeSummaryInfo.totalDurationMillis)}`;
    }
    if (routeSummaryInfo && routeSummaryInfo.overallStatus !== 'OK') {
      if (
        routeSummaryInfo.totalDistanceMeters !== null &&
        routeSummaryInfo.failedLegCount < effectiveRoute.stops.length - 1
      ) {
        return `${effectiveRoute.stops.length} stops • ${routeSummaryInfo.failedLegCount} leg(s) unavailable`;
      }
      return `${effectiveRoute.stops.length} stops • route unavailable`;
    }
    return `${effectiveRoute.stops.length} stops`;
  })();

  useEffect(() => {
    if (!isOpen || isTrailPhotoModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isTrailPhotoModalOpen, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PreserVenice GIS Cartography"
      className={`fixed inset-0 z-50 bg-[#131b2e] flex-col overflow-hidden ${
        isOpen ? 'flex animate-in fade-in duration-200' : 'hidden pointer-events-none'
      }`}
    >
      {/* Top Header Bar */}
      <div className="h-14 bg-white/95 backdrop-blur-md border-b border-[#e2e8f0] px-4 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-[#131b2e] flex items-center justify-center text-white shrink-0">
            <Compass className="w-4 h-4 text-[#ff6d4d]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-sm text-[#111827] truncate">
                PreserVenice GIS Cartography
              </span>
              <span className="hidden sm:inline-block bg-[#fee2e2] text-[#b91c1c] text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                Google Maps High-Res
              </span>
            </div>
            <div className="text-[10px] font-mono text-[#76777d] truncate">
              {currentCenter.lat.toFixed(4)}° N, {currentCenter.lng.toFixed(4)}° E •{' '}
              {filteredMonuments.length} pins
            </div>
          </div>
        </div>

        {/* View Switcher & Close Button */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex bg-[#eceef0] p-0.5 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setMapType('satellite')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                mapType === 'satellite'
                  ? 'bg-white text-black shadow-2xs font-bold'
                  : 'text-[#45464d] hover:text-[#191c1e]'
              }`}
            >
              Satellite
            </button>
            <button
              onClick={() => setMapType('roadmap')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                mapType === 'roadmap'
                  ? 'bg-white text-black shadow-2xs font-bold'
                  : 'text-[#45464d] hover:text-[#191c1e]'
              }`}
            >
              Roadmap
            </button>
            <button
              onClick={() => setMapType('hybrid')}
              className={`hidden sm:inline-block px-2.5 py-1 rounded-lg transition cursor-pointer ${
                mapType === 'hybrid'
                  ? 'bg-white text-black shadow-2xs font-bold'
                  : 'text-[#45464d] hover:text-[#191c1e]'
              }`}
            >
              Hybrid
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#eceef0] hover:bg-[#e0e3e5] text-[#191c1e] flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0"
            aria-label="Close Map"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Navigation Route Banner */}
      {effectiveRoute && (
        <div className="bg-[#0f172a] text-white px-3 sm:px-4 py-2 border-b border-white/10 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-xs shrink-0 z-20 shadow-inner">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-6 h-6 rounded-full bg-[#0284c7] flex items-center justify-center text-white shrink-0 shadow-xs">
              <Navigation className="w-3.5 h-3.5 fill-current" />
            </div>

            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 min-w-0 flex-1">
              <span className="font-bold text-[#93ccff] uppercase tracking-wider text-[10px] shrink-0">
                ACTIVE ROUTE:
              </span>
              <span className="font-semibold text-white truncate max-w-[160px] sm:max-w-xs min-w-0">
                {effectiveRoute.number} — {effectiveRoute.title}
              </span>

              {/* Next / Target stop badge */}
              <button
                type="button"
                onClick={() => {
                  if (navTargetMonument) {
                    setSelectedMonument(navTargetMonument);
                    setIsFollowingUser(false);
                    setCurrentCenter({
                      lat: navTargetMonument.coordinates.lat,
                      lng: navTargetMonument.coordinates.lng,
                    });
                    setCurrentZoom(17);
                  }
                }}
                className="flex items-center gap-1.5 bg-[#0284c7]/40 hover:bg-[#0284c7]/60 border border-[#38bdf8]/60 text-white px-2 py-0.5 rounded-md text-[11px] font-semibold max-w-full min-w-0 shadow-xs cursor-pointer transition"
                title="Target artwork on route (click to view on map)"
              >
                <span className="text-[#93ccff] font-medium text-[10px] uppercase tracking-wider shrink-0">
                  {navigationPhase === 'approach'
                    ? 'Stop 1:'
                    : navTargetStopIndex === effectiveRoute.stops.length - 1
                    ? 'Final Stop:'
                    : 'Next Stop:'}
                </span>
                <span className="text-white font-bold truncate max-w-[130px] sm:max-w-[200px]">
                  {navTargetMonument?.title || 'Waypoint'}
                </span>
              </button>

              <span className="text-[#bec6e0] font-mono text-[11px] shrink-0">
                ({routeSummaryBadgeText})
              </span>

              {/* Green "Walk from My Location" button + live Approach status */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={handlePressWalkFromMyLocation}
                  disabled={isLocating}
                  className="flex items-center gap-1.5 bg-[#10b981] hover:bg-[#059669] active:scale-95 text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold transition cursor-pointer shrink-0 shadow-xs"
                  title="Generate green street-by-street walking route from your GPS location to Stop 1"
                >
                  <LocateFixed className={`w-3 h-3 text-white ${isLocating ? 'animate-spin' : ''}`} />
                  <span>
                    {isLocating
                      ? 'Acquiring GPS...'
                      : userLocation && userApproachInfo
                      ? userApproachInfo.status === 'OK'
                        ? `Walk from My Location • ${userApproachInfo.distanceText}`
                        : 'Walk from My Location • Route Unavailable'
                      : 'Walk from My Location'}
                  </span>
                </button>
                {userLocation && (
                  <button
                    onClick={handleStopLocationTracking}
                    className="p-0.5 rounded-full bg-white/10 hover:bg-red-500/40 text-white/80 hover:text-white cursor-pointer"
                    title="Stop GPS location tracking"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {effectiveRoute.stops.length >= 1 && (
              <div className="flex items-center bg-white/10 rounded-full p-0.5 border border-white/15">
                <button
                  disabled={currentStopIndex <= 0 && navigationPhase === 'approach'}
                  onClick={() => {
                    const newIdx = Math.max(0, currentStopIndex - 1);
                    setCurrentStopIndex(newIdx);
                    setLegRerouteActive(false);
                    setNavigationPhase('at_stop');
                    setBottomMode('monument');
                    setIsFollowingUser(false);
                    const prevMon = MONUMENTS.find(
                      (m) => m.id === effectiveRoute.stops[newIdx]?.monumentId
                    );
                    if (prevMon) {
                      setSelectedMonument(prevMon);
                      setCurrentCenter({
                        lat: prevMon.coordinates.lat,
                        lng: prevMon.coordinates.lng,
                      });
                    }
                  }}
                  className="px-2 py-0.5 text-[10px] font-bold text-white hover:text-[#93ccff] disabled:opacity-30 cursor-pointer"
                  title="Previous stop"
                >
                  Prev
                </button>
                <span className="text-[10px] text-white/80 px-1 font-mono">
                  {currentStopIndex + 1}/{effectiveRoute.stops.length}
                </span>
                <button
                  disabled={!canAdvanceStop}
                  onClick={handleTopNextClick}
                  className="px-2 py-0.5 text-[10px] font-bold text-white hover:text-[#93ccff] disabled:opacity-30 cursor-pointer"
                  title="Advance to next art piece"
                >
                  Next
                </button>
              </div>
            )}

            {onClearActiveRoute && (
              <button
                onClick={onClearActiveRoute}
                className="text-[11px] text-[#bec6e0] hover:text-white flex items-center gap-1 shrink-0 bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-full transition cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Geolocation feedback banner for mobile devices (GPS-only) */}
      {geoError && (
        <div className="bg-amber-600 text-white px-4 py-1.5 text-xs flex items-center justify-between gap-2 shrink-0 z-20">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate sm:whitespace-normal">{geoError}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => handleRequestMobileLocation({ followCamera: true, bumpApproach: true })}
              className="px-2 py-0.5 bg-white text-amber-800 font-bold rounded-full text-[11px] cursor-pointer"
            >
              Retry GPS
            </button>
            <button
              onClick={() => setGeoError(null)}
              className="p-1 hover:bg-white/20 rounded cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Unified Non-Stacking Filter & Navigation Ribbon */}
      <div className="bg-white/95 backdrop-blur-md px-3 sm:px-4 py-2 border-b border-[#e2e8f0] flex items-center gap-2 overflow-x-auto scroll-x-smooth no-scrollbar z-20 shrink-0 select-none">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setActiveLayer('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 ${
              activeLayer === 'all'
                ? 'bg-black text-white shadow-xs'
                : 'bg-[#eceef0] text-[#191c1e] hover:bg-[#e0e3e5]'
            }`}
          >
            All Works ({MONUMENTS.length})
          </button>

          <button
            onClick={() => setActiveLayer('statues')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 ${
              activeLayer === 'statues'
                ? 'bg-[#0284c7] text-white shadow-xs'
                : 'bg-[#eceef0] text-[#191c1e] hover:bg-[#e0e3e5]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#0284c7] border border-white shrink-0"></span>
            <span>Statues</span>
          </button>

          <button
            onClick={() => setActiveLayer('reliefs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 ${
              activeLayer === 'reliefs'
                ? 'bg-[#ea580c] text-white shadow-xs'
                : 'bg-[#eceef0] text-[#191c1e] hover:bg-[#e0e3e5]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#ea580c] border border-white shrink-0"></span>
            <span>Reliefs</span>
          </button>

          <button
            onClick={() => setActiveLayer('monuments')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 ${
              activeLayer === 'monuments'
                ? 'bg-[#b91c1c] text-white shadow-xs'
                : 'bg-[#eceef0] text-[#191c1e] hover:bg-[#e0e3e5]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#b91c1c] border border-white shrink-0"></span>
            <span>Monuments</span>
          </button>

          <button
            onClick={() => setActiveLayer('3d')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 ${
              activeLayer === '3d'
                ? 'bg-[#1e293b] text-white shadow-xs'
                : 'bg-[#eceef0] text-[#191c1e] hover:bg-[#e0e3e5]'
            }`}
          >
            <Box className="w-3 h-3" />
            <span>3D Scans</span>
          </button>
        </div>

        <div className="h-5 w-px bg-[#d8dadc] mx-1 shrink-0"></div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-bold text-[#76777d] uppercase tracking-wider shrink-0 mr-0.5">
            Region:
          </span>
          {REGION_MAP_VIEWPORTS.map((region) => {
            const isCurrent = activeIsland === region.name;
            return (
              <button
                key={region.id}
                onClick={() => {
                  setActiveIsland(region.name);
                  setIsFollowingUser(false);
                  setCurrentCenter(region.coords);
                  setCurrentZoom(region.zoom);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  isCurrent
                    ? 'bg-[#fee2e2] text-[#b91c1c] ring-1 ring-[#b91c1c]/40 font-bold'
                    : 'bg-[#eceef0] text-[#45464d] hover:bg-[#e0e3e5] hover:text-[#191c1e]'
                }`}
              >
                {region.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Map Viewport */}
      <div className="relative flex-1 bg-[#131b2e] overflow-hidden select-none">
        <VeniceGoogleMap
          apiKey={apiKey}
          monuments={filteredMonuments}
          selectedMonument={selectedMonument}
          onSelectMonument={handleSelectPinMonument}
          mapType={mapType}
          center={currentCenter}
          zoom={currentZoom}
          activeRoute={effectiveRoute}
          activeStopIndex={currentStopIndex}
          navigationPhase={navigationPhase}
          singleNavTargetCoords={singleNavTargetCoords}
          userLocation={userLocation}
          userHeading={userHeading}
          isNavigationActive={isNavigationActive}
          isFollowingUser={isFollowingUser}
          navigationTarget={navigationTarget}
          approachFetchNonce={approachFetchNonce}
          legRerouteActive={legRerouteActive}
          legRerouteNonce={legRerouteNonce}
          recenterNonce={recenterNonce}
          onUserPanAway={handleUserPanAway}
          onUserApproachInfoChange={handleApproachInfoChange}
          onActiveLegInfoChange={handleActiveLegInfoChange}
          onRouteSummaryChange={handleRouteSummaryChange}
          isVisible={isOpen}
          quotaExceeded={quotaExceeded}
        />

        {/* Bottom Dock Container */}
        <div className="absolute bottom-4 left-3 right-3 sm:left-6 sm:right-6 z-30 flex flex-col items-stretch sm:items-start gap-2.5 pointer-events-none">
          {/* Quick Action Row: Take Route Photo (premade trails only) + Re-center */}
          {(showPremadeRoutePhotoButton || isNavigationActive) && (
            <div className="flex items-center justify-between gap-2 w-full pointer-events-none">
              <div>
                {showPremadeRoutePhotoButton && (
                  <button
                    type="button"
                    onClick={() => setIsTrailPhotoModalOpen(true)}
                    className="pointer-events-auto min-h-[44px] flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold shadow-xl bg-[#b91c1c] hover:bg-[#991b1b] text-white border border-white/25 transition active:scale-95 cursor-pointer"
                    title="Take a photo of yourself along this premade trail"
                  >
                    <Camera className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap">Take Route Photo</span>
                  </button>
                )}
              </div>

              {isNavigationActive && (
                <button
                  onClick={handleRecenter}
                  className={`pointer-events-auto min-h-[44px] flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-bold shadow-xl border transition active:scale-95 cursor-pointer ${
                    isFollowingUser
                      ? 'bg-[#0f172a]/95 text-white border-[#10b981]/70'
                      : 'bg-white text-[#0284c7] border-[#0284c7]/40 ring-2 ring-[#0284c7]/25'
                  }`}
                  title="Re-center map on your walking position and facing direction"
                >
                  <Compass
                    className={`w-4 h-4 ${
                      isFollowingUser ? 'text-[#10b981]' : 'text-[#0284c7]'
                    }`}
                  />
                  <span>{isFollowingUser ? 'Centered (Heading)' : 'Re-center'}</span>
                  {userHeading !== null && (
                    <span className="font-mono text-[10px] opacity-80">{userHeading}°</span>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Option A: Live Google Maps Turn-by-Turn Walking Directions Card */}
          {showDirectionsCard && (
            <div className="pointer-events-auto w-full sm:w-[28rem] bg-[#0f172a]/95 backdrop-blur-md text-white rounded-3xl p-4 shadow-2xl border border-white/15 animate-in slide-in-from-bottom duration-200">
              <div className="flex items-start gap-3">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${
                    activeNavData.isUnavailable ? 'bg-amber-600' : 'bg-[#10b981]'
                  }`}
                >
                  {activeNavData.isUnavailable ? (
                    <AlertCircle className="w-6 h-6 text-white" />
                  ) : (
                    renderManeuverIcon(activeNavData.currentStep?.maneuver)
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6ee7b7] truncate">
                      {navigationPhase === 'single'
                        ? `Walking to • ${navTargetMonument?.title || 'Art Piece'}`
                        : navigationPhase === 'approach'
                        ? `Approach to Stop 1 • ${navTargetMonument?.title || 'Art Piece'}`
                        : `Leg ${currentStopIndex + 1} → Stop ${navTargetStopIndex + 1}${
                            activeNavData.isReroutedFromUser ? ' (Live Reroute)' : ''
                          } • ${navTargetMonument?.title || 'Art Piece'}`}
                    </span>
                    {!activeNavData.isUnavailable && !activeNavData.isCalculating && (
                      <span className="text-[11px] font-mono text-white/85 shrink-0">
                        {activeNavData.distanceText} ({activeNavData.durationText})
                      </span>
                    )}
                  </div>

                  {activeNavData.isCalculating || isLocating ? (
                    <p className="text-sm font-bold text-white mt-1">
                      {isLocating
                        ? 'Acquiring live GPS location...'
                        : 'Calculating Venice street & bridge walking route...'}
                    </p>
                  ) : !userLocation &&
                    (navigationPhase === 'approach' || navigationPhase === 'single') ? (
                    <div className="mt-1">
                      <p className="text-sm font-bold text-white leading-snug">
                        Enable GPS to begin turn-by-turn walking directions
                      </p>
                      <button
                        onClick={() =>
                          navigationPhase === 'single' && singleNavMonument
                            ? handleWalkToSingleMonument(singleNavMonument)
                            : handlePressWalkFromMyLocation()
                        }
                        className="mt-2 inline-flex items-center gap-1.5 bg-[#10b981] hover:bg-[#059669] text-white text-xs font-bold px-3 py-1.5 rounded-full cursor-pointer"
                      >
                        <LocateFixed className="w-3.5 h-3.5" />
                        <span>Enable GPS Navigation</span>
                      </button>
                    </div>
                  ) : activeNavData.isUnavailable ? (
                    <div className="mt-1 space-y-1.5">
                      <p className="font-display text-sm font-bold text-amber-300 leading-snug">
                        Walking directions unavailable
                      </p>
                      <p className="text-xs text-white/80 leading-relaxed">
                        {activeNavData.errorReason ||
                          'Google Maps could not compute a continuous pedestrian route along Venice walkways and bridges.'}
                      </p>
                      {activeNavData.directDistanceText && (
                        <p className="text-[11px] font-mono text-white/65">
                          Direct straight-line span: {activeNavData.directDistanceText} (not walkable)
                        </p>
                      )}
                      <button
                        onClick={handleRetryRoute}
                        className="mt-1 inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-bold px-3 py-1 rounded-full cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Retry Pedestrian Route</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="font-display text-base font-bold text-white leading-snug mt-0.5">
                        {activeNavData.currentStep?.instruction ||
                          `Follow highlighted pedestrian path to ${
                            navTargetMonument?.title || 'artwork'
                          }`}
                      </p>
                      {(activeNavData.currentStepRemainingText ||
                        activeNavData.currentStep?.distanceText) && (
                        <div className="text-xs text-[#93ccff] font-semibold mt-0.5">
                          In{' '}
                          {activeNavData.currentStepRemainingText ||
                            activeNavData.currentStep?.distanceText}
                          {activeNavData.upcomingStep
                            ? ` • Then ${activeNavData.upcomingStep.instruction}`
                            : ''}
                        </div>
                      )}
                      {userLocation &&
                        activeNavData.distanceFromRouteMeters > OFF_ROUTE_THRESHOLD_METERS && (
                          <div className="text-[11px] text-amber-300 font-semibold mt-1">
                            {activeNavData.distanceFromRouteMeters} m off planned walkway — recalculating...
                          </div>
                        )}
                    </>
                  )}
                </div>
              </div>

              {/* Footer Controls + Step-by-Step Expander */}
              <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between gap-2 text-xs">
                <button
                  disabled={activeNavData.steps.length === 0}
                  onClick={() => setIsStepsExpanded((v) => !v)}
                  className="flex items-center gap-1.5 text-white/80 hover:text-white disabled:opacity-40 font-semibold cursor-pointer"
                >
                  <Footprints className="w-3.5 h-3.5 text-[#6ee7b7]" />
                  <span>
                    {activeNavData.steps.length > 0
                      ? `${activeNavData.steps.length} street step${
                          activeNavData.steps.length === 1 ? '' : 's'
                        }`
                      : 'No pedestrian steps'}
                  </span>
                  {activeNavData.steps.length > 0 &&
                    (isStepsExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ))}
                </button>

                <button
                  onClick={handleTopNextClick}
                  className="flex items-center gap-1 text-[11px] font-bold bg-white/15 hover:bg-white/25 text-white px-3 py-1 rounded-full transition cursor-pointer"
                >
                  <span>View Art Piece</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* Expandable Full Street-by-Street Step List */}
              {isStepsExpanded && activeNavData.steps.length > 0 && (
                <div className="mt-3 pt-2 border-t border-white/10 max-h-44 overflow-y-auto overscroll-contain subtle-scrollbar space-y-2 pr-1">
                  {activeNavData.steps.map((step, sIdx) => {
                    const isCurrent = sIdx === activeNavData.liveStepIndex;
                    return (
                      <div
                        key={`${sIdx}-${step.instruction}`}
                        className={`flex items-start gap-2.5 p-2 rounded-xl text-xs ${
                          isCurrent
                            ? 'bg-[#10b981]/20 border border-[#10b981]/50 text-white'
                            : 'bg-white/5 text-white/80'
                        }`}
                      >
                        <span className="w-5 h-5 rounded-full bg-white/15 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {sIdx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium leading-snug">{step.instruction}</div>
                          <div className="text-[10px] text-white/60 mt-0.5 font-mono">
                            {step.distanceText} • {step.durationText}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Option B: Selected Monument Picture Card Docked at Bottom */}
          {!showDirectionsCard && selectedMonument && (
            <div className="pointer-events-auto w-full sm:w-96 bg-white/95 backdrop-blur-md rounded-3xl p-4 shadow-2xl border border-[#e2e8f0] transition animate-in slide-in-from-bottom duration-200">
              {arrivedStopIndex !== null && effectiveRoute && (
                <div className="mb-2.5 px-2.5 py-1 rounded-xl bg-[#ecfdf5] border border-[#a7f3d0] text-[#065f46] text-[11px] font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981] shrink-0" />
                  <span>Arrived at Stop {arrivedStopIndex + 1}</span>
                </div>
              )}

              <div className="flex gap-3">
                <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 bg-[#f3f4f6]">
                  <ArtworkImage
                    src={selectedMonument.imageUrl}
                    alt={selectedMonument.title}
                    surveyCode={selectedMonument.surveyCode}
                    compact
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold text-[#b91c1c] uppercase tracking-wider truncate">
                    {selectedMonument.regionDisplay} • {selectedMonument.category}
                  </div>
                  <h4 className="font-display font-bold text-sm text-[#191c1e] truncate leading-tight mt-0.5">
                    {selectedMonument.title}
                  </h4>
                  <div className="text-[11px] font-mono text-[#76777d] mt-1">
                    {selectedMonument.coordinates.formatted}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#f1f5f9] text-[#334155] truncate max-w-[125px]">
                      {selectedMonument.generalNotes || selectedMonument.surveyCode}
                    </span>

                    <button
                      onClick={() => {
                        onSelectMonument(selectedMonument);
                        onClose();
                      }}
                      className="flex items-center gap-1 text-xs font-bold text-[#b91c1c] hover:underline cursor-pointer shrink-0"
                    >
                      <span>View Record</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Navigation CTAs (either continue multi-stop route OR start single-artwork GPS walk) */}
              {effectiveRoute ? (
                <div className="mt-3 pt-2.5 border-t border-[#e5e7eb] flex items-center gap-2">
                  {hasAnotherStopAfterCurrent ? (
                    <button
                      onClick={() => handleStartLegDirections('leg')}
                      className="w-full bg-[#0284c7] hover:bg-[#0369a1] text-white py-2 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
                    >
                      <Navigation className="w-3.5 h-3.5 fill-current" />
                      <span>Navigate to Stop {currentStopIndex + 2}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handlePressWalkFromMyLocation}
                      className="w-full bg-[#10b981] hover:bg-[#059669] text-white py-2 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
                    >
                      <Navigation className="w-3.5 h-3.5 fill-current" />
                      <span>
                        {effectiveRoute.stops.length > 1
                          ? 'Restart Route from My Location'
                          : 'Walk from My Location'}
                      </span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-3 pt-2.5 border-t border-[#e5e7eb] flex items-center gap-2">
                  <button
                    onClick={() => handleWalkToSingleMonument(selectedMonument)}
                    className="w-full bg-[#10b981] hover:bg-[#059669] text-white py-2 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer shadow-xs"
                  >
                    <Navigation className="w-3.5 h-3.5 fill-current" />
                    <span>Walk Here from My Location</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Premade Trail Public Selfie / Photo Upload Modal */}
      {showPremadeRoutePhotoButton && effectiveRoute && (
        <TrailPhotoUploadModal
          isOpen={isTrailPhotoModalOpen}
          trail={effectiveRoute}
          stopTitle={navTargetMonument?.title || selectedMonument?.title}
          userLocation={userLocation}
          onClose={() => setIsTrailPhotoModalOpen(false)}
          onViewTrailPhotos={(trail) => {
            setIsTrailPhotoModalOpen(false);
            onOpenTrailPhotosInMenu?.(trail);
          }}
        />
      )}
    </div>
  );
};
