import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Map,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
  useApiLoadingStatus,
  APILoadingStatus,
} from '@vis.gl/react-google-maps';
import { Monument, CuratedTrail, MonumentCategory } from '../types';
import { MONUMENTS } from '../data/monuments';
import { MapPin, AlertCircle } from 'lucide-react';
import {
  ComputedWalkingLegResult,
  LatLngPoint,
  RouteStatus,
  WalkingStep,
  computeBearing,
  fetchMultiStopWalkingRoute,
  fetchSingleWalkingLeg,
  getDistanceKm,
  splitPolylineAtLocation,
} from '../utils/directions';

// Declare google namespace loaded dynamically by Google Maps script
declare const google: any;

// Internal Usage Attribution ID override for AI Studio
const ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];

export interface ApproachRouteInfo {
  status: RouteStatus;
  distanceText: string;
  durationText: string;
  distanceMeters: number | null;
  durationMillis: number | null;
  directDistanceMeters?: number;
  steps: WalkingStep[];
  path: LatLngPoint[];
  isCalculating: boolean;
  errorReason?: string;
}

export interface ActiveLegInfo {
  status: RouteStatus;
  distanceText: string;
  durationText: string;
  distanceMeters: number | null;
  durationMillis: number | null;
  directDistanceMeters?: number;
  steps: WalkingStep[];
  path: LatLngPoint[];
  isCalculating: boolean;
  isReroutedFromUser?: boolean;
  errorReason?: string;
}

export interface RouteSummaryInfo {
  overallStatus: RouteStatus;
  totalDistanceMeters: number | null;
  totalDurationMillis: number | null;
  failedLegCount: number;
  isCalculating: boolean;
  errorReason?: string;
}

// Pin category color definitions:
// - Statues: Blue pins (#0284c7)
// - Reliefs: Orange pins (#ea580c)
// - Monuments: Red pins (#b91c1c)
export const getCategoryPinTheme = (category?: MonumentCategory | string) => {
  switch (category) {
    case 'Statues':
      return {
        bg: 'bg-[#0284c7]',
        border: 'border-[#0284c7]',
        hex: '#0284c7',
        text: 'text-white',
      };
    case 'Reliefs':
      return {
        bg: 'bg-[#ea580c]',
        border: 'border-[#ea580c]',
        hex: '#ea580c',
        text: 'text-white',
      };
    case 'Monuments':
    default:
      return {
        bg: 'bg-[#b91c1c]',
        border: 'border-[#b91c1c]',
        hex: '#b91c1c',
        text: 'text-white',
      };
  }
};

interface VeniceGoogleMapProps {
  apiKey: string;
  monuments: Monument[];
  selectedMonument: Monument | null;
  onSelectMonument: (monument: Monument) => void;
  center: { lat: number; lng: number };
  zoom: number;
  activeRoute?: CuratedTrail | null;
  activeStopIndex?: number;
  navigationPhase?: 'approach' | 'leg' | 'at_stop' | 'single';
  singleNavTargetCoords?: { lat: number; lng: number } | null;
  userLocation?: { lat: number; lng: number } | null;
  userHeading?: number | null;
  isNavigationActive?: boolean;
  isFollowingUser?: boolean;
  navigationTarget?: { lat: number; lng: number } | null;
  approachFetchNonce?: number;
  legRerouteActive?: boolean;
  legRerouteNonce?: number;
  recenterNonce?: number;
  onUserPanAway?: () => void;
  onUserApproachInfoChange?: (info: ApproachRouteInfo | null) => void;
  onActiveLegInfoChange?: (info: ActiveLegInfo | null) => void;
  onRouteSummaryChange?: (summary: RouteSummaryInfo | null) => void;
  isVisible?: boolean;
  quotaExceeded?: boolean;
}

// Controller component to smoothly pan/zoom, orient camera to walking heading, and fit route bounds
function MapCameraController({
  center,
  zoom,
  fullRouteCoordinates,
  userLocation,
  userHeading,
  isNavigationActive,
  isFollowingUser,
  navigationTarget,
  recenterNonce,
  activeRouteId,
  isVisible = true,
  onUserPanAway,
}: {
  center: { lat: number; lng: number };
  zoom: number;
  fullRouteCoordinates: { lat: number; lng: number }[];
  userLocation?: { lat: number; lng: number } | null;
  userHeading?: number | null;
  isNavigationActive?: boolean;
  isFollowingUser?: boolean;
  navigationTarget?: { lat: number; lng: number } | null;
  recenterNonce?: number;
  activeRouteId?: string | null;
  isVisible?: boolean;
  onUserPanAway?: () => void;
}) {
  const map = useMap();
  const fittedRouteSignatureRef = useRef<string | null>(null);
  const prevCenterZoomRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null);
  const lastRecenterNonceRef = useRef<number>(recenterNonce ?? 0);
  const onUserPanAwayRef = useRef(onUserPanAway);
  onUserPanAwayRef.current = onUserPanAway;

  // Refresh map tiles and viewport cleanly whenever modal becomes visible again
  useEffect(() => {
    if (!isVisible || !map || typeof google === 'undefined') return;
    if (google?.maps?.event?.trigger) {
      google.maps.event.trigger(map, 'resize');
    }
  }, [isVisible, map]);

  // Detect manual user map pan/drag to pause follow-heading mode until Re-center is pressed
  useEffect(() => {
    if (!map || typeof google === 'undefined') return;
    const listener = map.addListener('dragstart', () => {
      onUserPanAwayRef.current?.();
    });
    return () => {
      if (listener && typeof listener.remove === 'function') {
        listener.remove();
      } else if (google?.maps?.event?.removeListener && listener) {
        google.maps.event.removeListener(listener);
      }
    };
  }, [map]);

  // 1. Live Google Maps walking follow camera: track GPS location & walking/facing heading
  useEffect(() => {
    if (!map || !isNavigationActive || !isFollowingUser || !userLocation) return;

    const recenterTriggered = (recenterNonce ?? 0) !== lastRecenterNonceRef.current;
    lastRecenterNonceRef.current = recenterNonce ?? 0;

    const targetHeading =
      userHeading !== null && userHeading !== undefined && Number.isFinite(userHeading)
        ? userHeading
        : navigationTarget
        ? computeBearing(userLocation, navigationTarget)
        : 0;

    const renderingType =
      typeof map.getRenderingType === 'function' ? map.getRenderingType() : 'RASTER';
    const supportsVectorTiltHeading = renderingType === 'VECTOR';

    try {
      if (typeof map.moveCamera === 'function') {
        map.moveCamera({
          center: userLocation,
          zoom: recenterTriggered ? 18.5 : Math.max(map.getZoom?.() || 18, 18),
          ...(supportsVectorTiltHeading ? { heading: targetHeading, tilt: 45 } : {}),
        });
        return;
      }
    } catch {
      // Fallback below
    }

    map.panTo(userLocation);
    if (recenterTriggered || (map.getZoom?.() || 0) < 17) {
      map.setZoom(18);
    }
  }, [
    map,
    isNavigationActive,
    isFollowingUser,
    userLocation,
    userHeading,
    navigationTarget,
    recenterNonce,
  ]);

  // 2. Initial route bounds fitting (when not actively locked to user GPS follow mode)
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google?.maps?.LatLngBounds) return;
    if (isNavigationActive && isFollowingUser && userLocation) return;

    const routeSignature = activeRouteId
      ? `${activeRouteId}:${fullRouteCoordinates.length}`
      : null;

    if (
      routeSignature &&
      fullRouteCoordinates.length >= 2 &&
      fittedRouteSignatureRef.current !== routeSignature
    ) {
      fittedRouteSignatureRef.current = routeSignature;
      const bounds = new google.maps.LatLngBounds();
      fullRouteCoordinates.forEach((coord) => bounds.extend(coord));
      if (userLocation) {
        bounds.extend(userLocation);
      }
      map.fitBounds(bounds, { top: 90, right: 60, bottom: 200, left: 60 });
      return;
    }

    const prev = prevCenterZoomRef.current;
    const centerOrZoomChanged =
      !prev ||
      Math.abs(prev.lat - center.lat) > 0.00001 ||
      Math.abs(prev.lng - center.lng) > 0.00001 ||
      prev.zoom !== zoom;

    if (centerOrZoomChanged) {
      prevCenterZoomRef.current = { lat: center.lat, lng: center.lng, zoom };
      map.panTo(center);
      map.setZoom(zoom);
    }
  }, [
    map,
    center,
    zoom,
    fullRouteCoordinates,
    userLocation,
    activeRouteId,
    isNavigationActive,
    isFollowingUser,
  ]);

  return null;
}

// Render OpenStreetMap tiles as the actual visible basemap while retaining the existing map projection for pins,
// navigation controls and route overlays.
function OpenStreetMapBase() {
  const map = useMap();
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.ImageMapType) return;
    const tiles = new google.maps.ImageMapType({
      tileSize: new google.maps.Size(256, 256),
      minZoom: 1,
      maxZoom: 19,
      name: 'OpenStreetMap',
      alt: 'OpenStreetMap contributors',
      isPng: true,
      getTileUrl: (coord: { x: number; y: number }, zoom: number) => {
        const scale = 2 ** zoom;
        if (coord.y < 0 || coord.y >= scale) return '';
        const x = ((coord.x % scale) + scale) % scale;
        return `https://tile.openstreetmap.org/${zoom}/${x}/${coord.y}.png`;
      },
    });
    map.setOptions({ mapTypeId: 'none', mapTypeControl: false });
    map.overlayMapTypes.insertAt(0, tiles);
    return () => {
      const index = map.overlayMapTypes.getArray().indexOf(tiles);
      if (index >= 0) map.overlayMapTypes.removeAt(index);
    };
  }, [map]);
  return null;
}

// Multi-Segment Navigation Route Polyline Layer (strictly renders ONLY authentic street paths):
// - Active User Approach / Single-Target ahead of user: EMERALD / GREEN
// - Completed / behind-user segments (both green approach & blue route legs): GREY
// - Active leg ahead of user: HIGHLIGHTED BLUE
// - Upcoming remaining legs: SOFT BLUE
function NavigationRoutePolyline({
  completedApproachPath,
  activeApproachPath,
  traveledLegPaths,
  activeLegAheadPath,
  upcomingLegPaths,
}: {
  completedApproachPath: LatLngPoint[];
  activeApproachPath: LatLngPoint[];
  traveledLegPaths: LatLngPoint[][];
  activeLegAheadPath: LatLngPoint[];
  upcomingLegPaths: LatLngPoint[][];
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google?.maps?.Polyline) return;
    const createdPolylines: any[] = [];

    const drawGreyCompletedPath = (path: LatLngPoint[]) => {
      if (path.length < 2) return;
      const greyCasing = new google.maps.Polyline({
        path,
        geodesic: false,
        strokeColor: '#334155',
        strokeOpacity: 0.75,
        strokeWeight: 6,
        zIndex: 5,
        map,
      });

      const greyCore = new google.maps.Polyline({
        path,
        geodesic: false,
        strokeColor: '#94a3b8',
        strokeOpacity: 0.9,
        strokeWeight: 4,
        zIndex: 6,
        map,
      });

      createdPolylines.push(greyCasing, greyCore);
    };

    // 1. Completed / behind-user approach path (Grey)
    drawGreyCompletedPath(completedApproachPath);

    // 2. Completed / behind-user trail legs (Grey)
    for (const seg of traveledLegPaths) {
      drawGreyCompletedPath(seg);
    }

    // 3. Upcoming Remaining Legs: Soft navigation blue
    for (const seg of upcomingLegPaths) {
      if (seg.length < 2) continue;
      const upcomingCasing = new google.maps.Polyline({
        path: seg,
        geodesic: false,
        strokeColor: '#0f172a',
        strokeOpacity: 0.65,
        strokeWeight: 6,
        zIndex: 7,
        map,
      });

      const upcomingCore = new google.maps.Polyline({
        path: seg,
        geodesic: false,
        strokeColor: '#38bdf8',
        strokeOpacity: 0.7,
        strokeWeight: 3.5,
        zIndex: 8,
        map,
      });

      createdPolylines.push(upcomingCasing, upcomingCore);
    }

    // 4. Active Leg Ahead of User (between current pin/stop and next): HIGHLIGHTED BLUE
    if (activeLegAheadPath.length >= 2) {
      const activeCasing = new google.maps.Polyline({
        path: activeLegAheadPath,
        geodesic: false,
        strokeColor: '#082f49',
        strokeOpacity: 0.95,
        strokeWeight: 8,
        zIndex: 12,
        map,
      });

      const activeCore = new google.maps.Polyline({
        path: activeLegAheadPath,
        geodesic: false,
        strokeColor: '#0284c7',
        strokeOpacity: 1.0,
        strokeWeight: 5,
        zIndex: 13,
        map,
      });

      const activeGlow = new google.maps.Polyline({
        path: activeLegAheadPath,
        geodesic: false,
        strokeColor: '#7dd3fc',
        strokeOpacity: 0.85,
        strokeWeight: 2,
        zIndex: 14,
        map,
      });

      createdPolylines.push(activeCasing, activeCore, activeGlow);
    }

    // 5. Active User Approach / Single-Target Street Route Ahead of User (Emerald/Green)
    if (activeApproachPath.length >= 2) {
      const approachCasing = new google.maps.Polyline({
        path: activeApproachPath,
        geodesic: false,
        strokeColor: '#064e3b',
        strokeOpacity: 0.92,
        strokeWeight: 8,
        zIndex: 15,
        map,
      });

      const approachCore = new google.maps.Polyline({
        path: activeApproachPath,
        geodesic: false,
        strokeColor: '#10b981',
        strokeOpacity: 1.0,
        strokeWeight: 5,
        zIndex: 16,
        map,
      });

      const approachGlow = new google.maps.Polyline({
        path: activeApproachPath,
        geodesic: false,
        strokeColor: '#6ee7b7',
        strokeOpacity: 0.85,
        strokeWeight: 2,
        zIndex: 17,
        map,
      });

      createdPolylines.push(approachCasing, approachCore, approachGlow);
    }

    return () => {
      createdPolylines.forEach((p) => p.setMap(null));
    };
  }, [
    map,
    completedApproachPath,
    activeApproachPath,
    traveledLegPaths,
    activeLegAheadPath,
    upcomingLegPaths,
  ]);

  return null;
}

const VeniceGoogleMapInner: React.FC<Omit<VeniceGoogleMapProps, 'apiKey'>> = ({
  monuments,
  selectedMonument,
  onSelectMonument,
  center,
  zoom,
  activeRoute,
  activeStopIndex = 0,
  navigationPhase = 'approach',
  singleNavTargetCoords = null,
  userLocation,
  userHeading = null,
  isNavigationActive = false,
  isFollowingUser = false,
  navigationTarget = null,
  approachFetchNonce = 0,
  legRerouteActive = false,
  legRerouteNonce = 0,
  recenterNonce = 0,
  onUserPanAway,
  onUserApproachInfoChange,
  onActiveLegInfoChange,
  onRouteSummaryChange,
  isVisible = true,
}) => {
  const routesLib = useMapsLibrary('routes');
  const loadingStatus = useApiLoadingStatus();

  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(selectedMonument?.id || null);
  const [routeLegResults, setRouteLegResults] = useState<ComputedWalkingLegResult[]>([]);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [userApproachPath, setUserApproachPath] = useState<{ lat: number; lng: number }[] | null>(null);
  const [liveLegOverrideResult, setLiveLegOverrideResult] = useState<ComputedWalkingLegResult | null>(null);
  const [isReroutingLeg, setIsReroutingLeg] = useState(false);

  const lastApproachFetchRef = useRef<{
    targetKey: string;
    nonce: number;
  } | null>(null);
  const lastLegRerouteRef = useRef<{
    stopIdx: number;
    dest: { lat: number; lng: number };
    nonce: number;
  } | null>(null);

  const onUserApproachInfoChangeRef = useRef(onUserApproachInfoChange);
  onUserApproachInfoChangeRef.current = onUserApproachInfoChange;
  const onActiveLegInfoChangeRef = useRef(onActiveLegInfoChange);
  onActiveLegInfoChangeRef.current = onActiveLegInfoChange;
  const onRouteSummaryChangeRef = useRef(onRouteSummaryChange);
  onRouteSummaryChangeRef.current = onRouteSummaryChange;

  useEffect(() => {
    if (selectedMonument) {
      setActiveMarkerId(selectedMonument.id);
    }
  }, [selectedMonument]);

  useEffect(() => {
    if (loadingStatus === APILoadingStatus.AUTH_FAILURE) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }, [loadingStatus]);

  // Extract ordered stop numbers and indices for the active route
  const routeStopsMap = useMemo(() => {
    const stopsRecord: Record<string, { order: number; index: number }> = {};
    if (!activeRoute) return stopsRecord;
    activeRoute.stops.forEach((stop, index) => {
      stopsRecord[stop.monumentId] = { order: index + 1, index };
    });
    return stopsRecord;
  }, [activeRoute]);

  // Ordered stop monument coordinates (depends only on activeRoute so filtered pin changes never re-trigger routing)
  const stopCoordinates = useMemo(() => {
    if (!activeRoute || activeRoute.stops.length === 0) return [];
    return activeRoute.stops
      .map((stop) => {
        const m = MONUMENTS.find((item) => item.id === stop.monumentId);
        return m ? { lat: m.coordinates.lat, lng: m.coordinates.lng } : null;
      })
      .filter(Boolean) as { lat: number; lng: number }[];
  }, [activeRoute]);

  // 1. Fetch pedestrian walking street routes via Route.computeRoutes() with intermediates for multi-stop trails
  useEffect(() => {
    if (!activeRoute || stopCoordinates.length < 2) {
      setRouteLegResults([]);
      setIsCalculatingRoute(false);
      onRouteSummaryChangeRef.current?.(null);
      return;
    }

    if (!routesLib) {
      setIsCalculatingRoute(true);
      onRouteSummaryChangeRef.current?.({
        overallStatus: 'OK',
        totalDistanceMeters: null,
        totalDurationMillis: null,
        failedLegCount: 0,
        isCalculating: true,
      });
      return;
    }

    let isCancelled = false;
    setIsCalculatingRoute(true);
    onRouteSummaryChangeRef.current?.({
      overallStatus: 'OK',
      totalDistanceMeters: null,
      totalDurationMillis: null,
      failedLegCount: 0,
      isCalculating: true,
    });

    const computePedestrianRoute = async () => {
      const multiResult = await fetchMultiStopWalkingRoute(stopCoordinates, routesLib);
      if (!isCancelled) {
        setRouteLegResults(multiResult.legs);
        setIsCalculatingRoute(false);
        onRouteSummaryChangeRef.current?.({
          overallStatus: multiResult.overallStatus,
          totalDistanceMeters: multiResult.totalDistanceMeters,
          totalDurationMillis: multiResult.totalDurationMillis,
          failedLegCount: multiResult.failedLegCount,
          isCalculating: false,
          errorReason: multiResult.errorReason,
        });
      }
    };

    computePedestrianRoute();

    return () => {
      isCancelled = true;
    };
  }, [activeRoute, stopCoordinates, routesLib]);

  // 2. Live off-route recalculation for inter-stop 'leg' phase when user deviates from planned leg
  useEffect(() => {
    if (
      !activeRoute ||
      navigationPhase !== 'leg' ||
      !legRerouteActive ||
      !userLocation ||
      activeStopIndex >= stopCoordinates.length - 1
    ) {
      setLiveLegOverrideResult(null);
      setIsReroutingLeg(false);
      lastLegRerouteRef.current = null;
      return;
    }

    const targetStop = stopCoordinates[activeStopIndex + 1];
    if (!targetStop || !routesLib) return;

    const prev = lastLegRerouteRef.current;
    const forceRequested = prev?.nonce !== legRerouteNonce;
    if (
      !forceRequested &&
      prev &&
      prev.stopIdx === activeStopIndex &&
      getDistanceKm(prev.dest, targetStop) < 0.005
    ) {
      return;
    }

    let isCancelled = false;
    setIsReroutingLeg(true);

    const recomputeActiveLeg = async () => {
      const result = await fetchSingleWalkingLeg(userLocation, targetStop, routesLib, {
        bypassCache: forceRequested,
      });
      if (!isCancelled) {
        lastLegRerouteRef.current = {
          stopIdx: activeStopIndex,
          dest: targetStop,
          nonce: legRerouteNonce,
        };
        setLiveLegOverrideResult(result);
        setIsReroutingLeg(false);
      }
    };

    recomputeActiveLeg();

    return () => {
      isCancelled = true;
    };
  }, [
    activeRoute,
    navigationPhase,
    legRerouteActive,
    legRerouteNonce,
    userLocation,
    activeStopIndex,
    stopCoordinates,
    routesLib,
  ]);

  // 3. Report active inter-stop leg info (prefer live rerouted leg if user deviated off-route)
  useEffect(() => {
    if (!activeRoute || routeLegResults.length === 0) {
      onActiveLegInfoChangeRef.current?.(null);
      return;
    }

    if (legRerouteActive && liveLegOverrideResult) {
      onActiveLegInfoChangeRef.current?.({
        status: liveLegOverrideResult.status,
        distanceText: liveLegOverrideResult.distanceText,
        durationText: liveLegOverrideResult.durationText,
        distanceMeters: liveLegOverrideResult.distanceMeters,
        durationMillis: liveLegOverrideResult.durationMillis,
        directDistanceMeters: liveLegOverrideResult.directDistanceMeters,
        steps: liveLegOverrideResult.steps,
        path: liveLegOverrideResult.path,
        isCalculating: isReroutingLeg,
        isReroutedFromUser: true,
        errorReason: liveLegOverrideResult.errorReason,
      });
      return;
    }

    const leg = routeLegResults[activeStopIndex];
    if (leg) {
      onActiveLegInfoChangeRef.current?.({
        status: leg.status,
        distanceText: leg.distanceText,
        durationText: leg.durationText,
        distanceMeters: leg.distanceMeters,
        durationMillis: leg.durationMillis,
        directDistanceMeters: leg.directDistanceMeters,
        steps: leg.steps,
        path: leg.path,
        isCalculating: isCalculatingRoute || isReroutingLeg,
        errorReason: leg.errorReason,
      });
    } else {
      onActiveLegInfoChangeRef.current?.(null);
    }
  }, [
    activeRoute,
    routeLegResults,
    activeStopIndex,
    isCalculatingRoute,
    isReroutingLeg,
    legRerouteActive,
    liveLegOverrideResult,
  ]);

  // Determine target destination for approach (Stop 1) or single-artwork navigation
  const approachOrSingleTarget = useMemo(() => {
    if (activeRoute && stopCoordinates.length > 0) {
      return stopCoordinates[0];
    }
    if (!activeRoute && singleNavTargetCoords) {
      return singleNavTargetCoords;
    }
    return null;
  }, [activeRoute, stopCoordinates, singleNavTargetCoords]);

  const approachTargetKey = useMemo(() => {
    if (activeRoute && stopCoordinates.length > 0) {
      return `route:${activeRoute.id}:${stopCoordinates[0].lat.toFixed(5)},${stopCoordinates[0].lng.toFixed(5)}`;
    }
    if (!activeRoute && singleNavTargetCoords) {
      return `single:${singleNavTargetCoords.lat.toFixed(5)},${singleNavTargetCoords.lng.toFixed(5)}`;
    }
    return 'none';
  }, [activeRoute, stopCoordinates, singleNavTargetCoords]);

  // Clear stale green approach path only when target destination changes or GPS tracking stops
  useEffect(() => {
    if (!userLocation || !approachOrSingleTarget || approachTargetKey === 'none') {
      setUserApproachPath(null);
      lastApproachFetchRef.current = null;
      onUserApproachInfoChangeRef.current?.(null);
      return;
    }
    if (
      lastApproachFetchRef.current &&
      lastApproachFetchRef.current.targetKey !== approachTargetKey
    ) {
      setUserApproachPath(null);
      lastApproachFetchRef.current = null;
    }
  }, [userLocation, approachOrSingleTarget, approachTargetKey]);

  // 4. Fetch green street-by-street walking route from User's GPS Location -> Stop 1 or Single Target Artwork.
  // Kept anchored to start point during active walk so traveled path behind user turns grey cleanly;
  // re-fetches only when approachFetchNonce increments (Walk from My Location / Retry / >40m off-route).
  useEffect(() => {
    if (!userLocation || !approachOrSingleTarget) return;
    if (navigationPhase !== 'approach' && navigationPhase !== 'single') return;

    const prev = lastApproachFetchRef.current;
    const forceRequested = !prev || prev.nonce !== approachFetchNonce || prev.targetKey !== approachTargetKey;
    if (!forceRequested) {
      return;
    }

    if (!routesLib) return;

    let isCancelled = false;

    const computeApproach = async () => {
      onUserApproachInfoChangeRef.current?.({
        status: 'OK',
        distanceText: 'Calculating...',
        durationText: '...',
        distanceMeters: null,
        durationMillis: null,
        steps: [],
        path: [],
        isCalculating: true,
      });

      const result = await fetchSingleWalkingLeg(
        userLocation,
        approachOrSingleTarget,
        routesLib,
        { bypassCache: prev !== null && prev.nonce !== approachFetchNonce }
      );

      if (!isCancelled) {
        lastApproachFetchRef.current = {
          targetKey: approachTargetKey,
          nonce: approachFetchNonce,
        };
        // CRITICAL: Only render polyline when authentic pedestrian geometry succeeded
        setUserApproachPath(result.status === 'OK' && result.path.length >= 2 ? result.path : null);
        onUserApproachInfoChangeRef.current?.({
          status: result.status,
          distanceText: result.distanceText,
          durationText: result.durationText,
          distanceMeters: result.distanceMeters,
          durationMillis: result.durationMillis,
          directDistanceMeters: result.directDistanceMeters,
          steps: result.steps,
          path: result.path,
          isCalculating: false,
          errorReason: result.errorReason,
        });
      }
    };

    computeApproach();

    return () => {
      isCancelled = true;
    };
  }, [
    userLocation,
    approachOrSingleTarget,
    approachTargetKey,
    navigationPhase,
    routesLib,
    approachFetchNonce,
  ]);

  // Determine whether the green approach / single-target segment has been completed
  const isApproachCompleted = Boolean(
    userApproachPath &&
      userApproachPath.length >= 2 &&
      ((Boolean(activeRoute) &&
        (activeStopIndex > 0 || navigationPhase === 'leg' || navigationPhase === 'at_stop')) ||
        (!activeRoute && navigationPhase === 'at_stop'))
  );

  // Segment ONLY authentic computed pedestrian legs and split active paths behind userLocation
  const {
    completedApproachPath,
    activeApproachPath,
    traveledLegPaths,
    activeLegAheadPath,
    upcomingLegPaths,
    fullRouteCoordinates,
  } = useMemo(() => {
    let compApproach: LatLngPoint[] = [];
    let actApproach: LatLngPoint[] = [];

    if (userApproachPath && userApproachPath.length >= 2) {
      if (isApproachCompleted) {
        compApproach = userApproachPath;
        actApproach = [];
      } else if (userLocation) {
        const split = splitPolylineAtLocation(userApproachPath, userLocation);
        compApproach = split.behindPath;
        actApproach = split.aheadPath;
      } else {
        compApproach = [];
        actApproach = userApproachPath;
      }
    }

    const validLegPaths = routeLegResults.map((r) =>
      r.status === 'OK' && r.path.length >= 2 ? r.path : []
    );

    if (validLegPaths.length === 0) {
      const singlePts =
        userApproachPath && userApproachPath.length >= 2 ? userApproachPath : stopCoordinates;
      return {
        completedApproachPath: compApproach,
        activeApproachPath: actApproach,
        traveledLegPaths: [] as LatLngPoint[][],
        activeLegAheadPath: [] as LatLngPoint[],
        upcomingLegPaths: [] as LatLngPoint[][],
        fullRouteCoordinates: singlePts,
      };
    }

    const currStopIdx = Math.min(Math.max(0, activeStopIndex), validLegPaths.length);

    // Completed legs prior to activeStopIndex
    const traveledLegs: LatLngPoint[][] = [];
    for (let i = 0; i < currStopIdx; i++) {
      if (validLegPaths[i].length >= 2) {
        traveledLegs.push(validLegPaths[i]);
      }
    }

    // Active leg: use live rerouted pedestrian path from user GPS if active and valid, else planned leg
    let rawActiveLeg: LatLngPoint[] = [];
    if (
      legRerouteActive &&
      liveLegOverrideResult?.status === 'OK' &&
      liveLegOverrideResult.path.length >= 2
    ) {
      rawActiveLeg = liveLegOverrideResult.path;
    } else if (currStopIdx < validLegPaths.length) {
      rawActiveLeg = validLegPaths[currStopIdx];
    }

    // Split active leg behind userLocation during live 'leg' navigation so walked segments turn grey
    let activeLegAhead: LatLngPoint[] = rawActiveLeg;
    if (navigationPhase === 'leg' && userLocation && rawActiveLeg.length >= 2) {
      const splitLeg = splitPolylineAtLocation(rawActiveLeg, userLocation);
      if (splitLeg.behindPath.length >= 2) {
        traveledLegs.push(splitLeg.behindPath);
      }
      activeLegAhead = splitLeg.aheadPath;
    }

    // Upcoming legs after activeStopIndex
    const upcomingLegs: LatLngPoint[][] = [];
    for (let i = currStopIdx + 1; i < validLegPaths.length; i++) {
      if (validLegPaths[i].length >= 2) {
        upcomingLegs.push(validLegPaths[i]);
      }
    }

    const full = validLegPaths.flat();

    return {
      completedApproachPath: compApproach,
      activeApproachPath: actApproach,
      traveledLegPaths: traveledLegs,
      activeLegAheadPath: activeLegAhead,
      upcomingLegPaths: upcomingLegs,
      fullRouteCoordinates: full.length >= 2 ? full : stopCoordinates,
    };
  }, [
    routeLegResults,
    activeStopIndex,
    stopCoordinates,
    userApproachPath,
    isApproachCompleted,
    userLocation,
    navigationPhase,
    legRerouteActive,
    liveLegOverrideResult,
  ]);

  const effectivePuckHeading = useMemo(() => {
    if (userHeading !== null && userHeading !== undefined && Number.isFinite(userHeading)) {
      return userHeading;
    }
    if (userLocation && navigationTarget) {
      return computeBearing(userLocation, navigationTarget);
    }
    return null;
  }, [userHeading, userLocation, navigationTarget]);

  return (
    <div className="w-full h-full relative">
      <Map
        mapId="DEMO_MAP_ID"
        defaultCenter={center}
        defaultZoom={zoom}
        mapTypeId="none"
        gestureHandling="greedy"
        internalUsageAttributionIds={ATTRIBUTION_IDS}
        className="w-full h-full"
        style={{ width: '100%', height: '100%' }}
      >
        <OpenStreetMapBase />
        <MapCameraController
          center={center}
          zoom={zoom}
          fullRouteCoordinates={fullRouteCoordinates}
          userLocation={userLocation}
          userHeading={userHeading}
          isNavigationActive={isNavigationActive}
          isFollowingUser={isFollowingUser}
          navigationTarget={navigationTarget}
          recenterNonce={recenterNonce}
          activeRouteId={activeRoute?.id || null}
          isVisible={isVisible}
          onUserPanAway={onUserPanAway}
        />

        {/* Pedestrian navigation route layer */}
        <NavigationRoutePolyline
          completedApproachPath={completedApproachPath}
          activeApproachPath={activeApproachPath}
          traveledLegPaths={traveledLegPaths}
          activeLegAheadPath={activeLegAheadPath}
          upcomingLegPaths={upcomingLegPaths}
        />

        {/* User Location Marker (Google Maps directional navigation puck) */}
        {userLocation && (
          <AdvancedMarker position={userLocation} title="Your GPS Location" zIndex={55}>
            <div className="relative flex items-center justify-center">
              {effectivePuckHeading !== null && (
                <div
                  className="absolute w-14 h-14 pointer-events-none transition-transform duration-150 ease-out"
                  style={{ transform: `rotate(${effectivePuckHeading}deg)` }}
                >
                  <div
                    className="w-full h-full rounded-full"
                    style={{
                      background:
                        'conic-gradient(from -32deg at 50% 50%, rgba(16,185,129,0.55) 0deg, rgba(16,185,129,0.18) 64deg, transparent 65deg)',
                    }}
                  />
                  <div className="absolute top-0.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-[#10b981]" />
                </div>
              )}

              <div className="relative flex items-center justify-center">
                <div className="absolute w-8 h-8 rounded-full bg-[#10b981]/30 animate-ping" />
                <div className="w-5 h-5 rounded-full bg-[#0284c7] border-2 border-white shadow-lg flex items-center justify-center z-10">
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div>
              </div>
            </div>
          </AdvancedMarker>
        )}

        {/* Monument Markers across Venice */}
        {monuments.map((m) => {
          const isSelected = activeMarkerId === m.id;
          const stopInfo = routeStopsMap[m.id];
          const isRouteStop = stopInfo !== undefined;
          const stopIndex = stopInfo?.index ?? -1;
          const stopNumber = stopInfo?.order ?? 0;

          const isAlreadyVisited = isRouteStop && stopIndex < activeStopIndex;
          const isNextStop = isRouteStop && stopIndex === activeStopIndex + 1;
          const isCurrentStop = isRouteStop && stopIndex === activeStopIndex;

          const categoryTheme = getCategoryPinTheme(m.category);

          const diamondColorClass = isCurrentStop
            ? 'bg-[#10b981] border border-[#059669]'
            : isAlreadyVisited
            ? 'bg-black border border-black'
            : `${categoryTheme.bg} border ${categoryTheme.border}`;

          return (
            <AdvancedMarker
              key={m.id}
              position={{ lat: m.coordinates.lat, lng: m.coordinates.lng }}
              title={m.title}
              zIndex={
                isNextStop
                  ? 35
                  : isCurrentStop
                  ? 30
                  : isRouteStop && !isAlreadyVisited
                  ? 25
                  : isSelected
                  ? 20
                  : 10
              }
              onClick={() => {
                setActiveMarkerId(m.id);
                onSelectMonument(m);
              }}
            >
              <div
                className={`relative flex items-center justify-center cursor-pointer transition-transform duration-200 ${
                  isSelected ? 'scale-120 z-40' : 'hover:scale-110'
                }`}
              >
                {isRouteStop && !isAlreadyVisited ? (
                  <div className="relative flex flex-col items-center">
                    <div
                      className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-md border border-white text-white transition ${
                        categoryTheme.bg
                      } ${isSelected ? 'ring-2 ring-white shadow-xl scale-105' : ''} ${
                        isNextStop ? 'ring-2 ring-[#38bdf8] shadow-lg' : ''
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-white/25 flex items-center justify-center text-[10px] font-black shrink-0">
                        {stopNumber}
                      </span>

                      <span className="max-w-[130px] truncate text-[11px] font-bold">
                        {m.title}
                      </span>

                      {isNextStop && (
                        <span className="bg-white/20 text-white text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-full border border-white/40 shadow-xs">
                          NEXT
                        </span>
                      )}
                    </div>

                    <div
                      className={`w-2.5 h-2.5 rotate-45 -mt-1 shadow-xs transition-colors duration-200 ${diamondColorClass}`}
                    ></div>
                  </div>
                ) : (
                  <div className="relative flex flex-col items-center">
                    <div
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 shadow-md border border-white/60 transition ${
                        isSelected
                          ? `${categoryTheme.bg} text-white ring-2 ring-white scale-110`
                          : isAlreadyVisited
                          ? 'bg-black text-white/90 border-white/40 opacity-80'
                          : `${categoryTheme.bg} text-white`
                      }`}
                    >
                      <MapPin className="w-3 h-3 fill-current shrink-0" />
                      <span className="hidden sm:inline-block max-w-[110px] truncate text-[10px]">
                        {m.title}
                      </span>
                    </div>
                    <div className={`w-1.5 h-1.5 rotate-45 -mt-0.5 shadow-2xs ${diamondColorClass}`}></div>
                  </div>
                )}
              </div>
            </AdvancedMarker>
          );
        })}
      </Map>
      <div className="absolute bottom-1 right-1 z-10 rounded-sm bg-white/85 px-1.5 py-0.5 text-[10px] text-slate-700">
        © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap contributors</a>
      </div>

      {/* Calculating Pedestrian Route Indicator */}
      {(isCalculatingRoute || isReroutingLeg) && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-[#0f172a]/90 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg border border-white/20 flex items-center gap-2 pointer-events-none animate-in fade-in duration-200">
          <div className="w-2 h-2 rounded-full bg-[#38bdf8] animate-ping"></div>
          <span>
            {isReroutingLeg
              ? 'Recalculating pedestrian walking route...'
              : 'Calculating Venice pedestrian street route...'}
          </span>
        </div>
      )}
    </div>
  );
};

const OfflineVeniceFallbackMap: React.FC<{
  reason: 'missing_key' | 'quota_exceeded';
  monuments: Monument[];
  selectedMonument: Monument | null;
  onSelectMonument: (monument: Monument) => void;
  activeRoute?: CuratedTrail | null;
  activeStopIndex?: number;
  userLocation?: { lat: number; lng: number } | null;
}> = ({
  reason,
  monuments,
  selectedMonument,
  onSelectMonument,
  activeRoute,
  activeStopIndex = 0,
  userLocation,
}) => {
  const { bounds, projectedMonuments, routeSegments } = useMemo(() => {
    const sourceForBounds = monuments.length > 0 ? monuments : MONUMENTS;
    const lats = sourceForBounds.map((m) => m.coordinates.lat);
    const lngs = sourceForBounds.map((m) => m.coordinates.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latSpan = Math.max(maxLat - minLat, 0.0005);
    const lngSpan = Math.max(maxLng - minLng, 0.0005);

    const project = (lat: number, lng: number) => ({
      x: 10 + ((lng - minLng) / lngSpan) * 80,
      y: 16 + ((maxLat - lat) / latSpan) * 66,
    });

    const stopOrderMap: Record<string, { order: number; index: number }> = {};
    if (activeRoute) {
      activeRoute.stops.forEach((s, idx) => {
        stopOrderMap[s.monumentId] = { order: idx + 1, index: idx };
      });
    }

    const projected = monuments.map((m) => {
      const pt = project(m.coordinates.lat, m.coordinates.lng);
      return {
        monument: m,
        x: pt.x,
        y: pt.y,
        stopInfo: stopOrderMap[m.id],
      };
    });

    const segments: Array<{
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      completed: boolean;
      active: boolean;
    }> = [];
    if (activeRoute && activeRoute.stops.length >= 2) {
      const stopPts = activeRoute.stops
        .map((s) => MONUMENTS.find((item) => item.id === s.monumentId))
        .filter(Boolean)
        .map((m) => project(m!.coordinates.lat, m!.coordinates.lng));
      for (let i = 0; i < stopPts.length - 1; i++) {
        segments.push({
          x1: stopPts[i].x,
          y1: stopPts[i].y,
          x2: stopPts[i + 1].x,
          y2: stopPts[i + 1].y,
          completed: i < activeStopIndex,
          active: i === activeStopIndex,
        });
      }
    }

    return {
      bounds: { project },
      projectedMonuments: projected,
      routeSegments: segments,
    };
  }, [monuments, activeRoute, activeStopIndex]);

  const userPoint = useMemo(() => {
    if (!userLocation) return null;
    const p = bounds.project(userLocation.lat, userLocation.lng);
    return {
      x: Math.max(4, Math.min(96, p.x)),
      y: Math.max(8, Math.min(92, p.y)),
    };
  }, [userLocation, bounds]);

  const handleRetryLiveMap = () => {
    try {
      sessionStorage.removeItem('pv_gmp_quota_exceeded');
    } catch {
      // Ignore storage errors
    }
    window.dispatchEvent(new CustomEvent('gmp-quota-reset'));
  };

  return (
    <div className="w-full h-full relative bg-gradient-to-br from-[#0f172a] via-[#131b2e] to-[#1e293b] overflow-hidden select-none">
      {/* Venice Lagoon Grid + Canal Vector Layer */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      >
        <defs>
          <pattern id="pv-gis-fallback-grid" width="8" height="8" patternUnits="userSpaceOnUse">
            <path
              d="M 8 0 L 0 0 0 8"
              fill="none"
              stroke="rgba(148, 163, 184, 0.14)"
              strokeWidth="0.25"
            />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#pv-gis-fallback-grid)" />
        {/* Stylized Grand Canal & Giudecca Canal contours */}
        <path
          d="M 0 88 Q 30 82, 60 86 T 100 80"
          fill="none"
          stroke="rgba(56, 189, 248, 0.25)"
          strokeWidth="3.2"
        />
        <path
          d="M 62 0 Q 72 18, 86 28 T 100 50"
          fill="none"
          stroke="rgba(56, 189, 248, 0.22)"
          strokeWidth="2.4"
        />
        {routeSegments.map((seg, idx) => (
          <line
            key={idx}
            x1={seg.x1}
            y1={seg.y1}
            x2={seg.x2}
            y2={seg.y2}
            stroke={seg.completed ? '#94a3b8' : seg.active ? '#0284c7' : '#38bdf8'}
            strokeWidth={seg.active ? '0.9' : '0.6'}
            strokeDasharray={seg.active ? undefined : '1.4 1.1'}
            strokeLinecap="round"
            opacity={seg.completed ? 0.6 : 0.95}
          />
        ))}
      </svg>

      {/* Top Fallback Notice Pill */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-[92%] sm:max-w-lg">
        <div className="bg-[#0f172a]/90 backdrop-blur-md text-white px-3.5 py-2 rounded-2xl border border-amber-400/40 shadow-xl flex items-center gap-2.5 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-white/90 leading-snug">
            {reason === 'quota_exceeded'
              ? 'Live Google Maps tiles & street routing paused (daily quota reached). Interactive Survey123 GIS pins active.'
              : 'Google Maps API key not configured. Interactive Survey123 GIS pins active.'}
          </span>
          {reason === 'quota_exceeded' && (
            <button
              type="button"
              onClick={handleRetryLiveMap}
              className="shrink-0 bg-amber-400 hover:bg-amber-300 text-[#0f172a] font-bold px-2.5 py-1 rounded-full text-[11px] transition cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      {/* User GPS Marker if available */}
      {userPoint && (
        <div
          style={{ left: `${userPoint.x}%`, top: `${userPoint.y}%` }}
          className="absolute -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none"
          title="Your GPS Location"
        >
          <div className="w-5 h-5 rounded-full bg-[#0284c7] border-2 border-white shadow-lg flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white" />
          </div>
        </div>
      )}

      {/* Interactive Monument Pins */}
      {projectedMonuments.map(({ monument, x, y, stopInfo }) => {
        const theme = getCategoryPinTheme(monument.category);
        const isSelected = selectedMonument?.id === monument.id;
        return (
          <button
            key={monument.id}
            type="button"
            onClick={() => onSelectMonument(monument)}
            style={{ left: `${x}%`, top: `${y}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 rounded-full border border-white text-white shadow-md transition-transform cursor-pointer ${
              stopInfo ? `${theme.bg} px-2 py-0.5 text-[10px] font-bold z-20` : `${theme.bg} p-1.5 z-10`
            } ${isSelected ? 'ring-2 ring-white scale-125 z-30' : 'hover:scale-115'}`}
            title={monument.title}
          >
            {stopInfo ? (
              <span>{stopInfo.order}</span>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
            )}
          </button>
        );
      })}
    </div>
  );
};

export const VeniceGoogleMap: React.FC<VeniceGoogleMapProps> = ({
  apiKey,
  quotaExceeded = false,
  ...rest
}) => {
  if (!apiKey || quotaExceeded) {
    return (
      <OfflineVeniceFallbackMap
        reason={!apiKey ? 'missing_key' : 'quota_exceeded'}
        monuments={rest.monuments}
        selectedMonument={rest.selectedMonument}
        onSelectMonument={rest.onSelectMonument}
        activeRoute={rest.activeRoute}
        activeStopIndex={rest.activeStopIndex}
        userLocation={rest.userLocation}
      />
    );
  }

  return (
    <div className="w-full h-full relative">
      <VeniceGoogleMapInner {...rest} />
    </div>
  );
};
