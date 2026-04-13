// src/components/ResourceFinder.tsx
import {
  Component,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import mapboxgl from "mapbox-gl";
import Fuse from "fuse.js";

import type { Resource } from "../types/resourceTypes";
import { fetchResourcesLocal } from "../utils/fetchResources";
import { ResourceCard } from "./ResourceCard";
import ViewToggle, { type ViewMode } from "./ViewToggle";
import Pagination from "./Pagination";
import { Tooltip } from "./Tooltip";
import TranslateDropdown from "./TranslateDropdown";

import {
  COUNTIES,
  SERVICES,
  ORG_SERVICES,
  type County,
  type Service,
  type OrgService,
  splitCommaList,
  normalizeValue,
  labelForService,
  labelForOrgService,
  SERVICE_DELIVERY_OPTIONS,
  type ServiceDeliveryFilter,
  normalizeServiceDeliveryFlags,
} from "../static/filters";

import { SingleSelect, type SelectOption } from "./SingleSelect";
import { MultiSelect } from "./MultiSelect";

import caCountyBoundsRaw from "../static/ca_county_bounds.json";

type Audience = "Resident" | "Organization";
type SortMode = "alphabetical" | "proximity";
type PerPageOption = 12 | 36 | 72 | "all";

type CountyBoundsMap = Record<string, [[number, number], [number, number]]>;
const CA_COUNTY_BOUNDS = caCountyBoundsRaw as unknown as CountyBoundsMap;

const CA_BOUNDS: mapboxgl.LngLatBoundsLike = [
  [-124.48, 32.53],
  [-114.13, 42.01],
];

const MAP_SOURCE_ID = "resources";
const MAP_LAYER_ID = "resources-circle";

class TranslateErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; resetKey: number }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, resetKey: 0 };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      setTimeout(() => {
        this.setState((s) => ({ hasError: false, resetKey: s.resetKey + 1 }));
      }, 0);
    }
  }

  render() {
    if (this.state.hasError) return null;
    return <div key={this.state.resetKey}>{this.props.children}</div>;
  }
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function getLonLat(r: Resource): { lon: number; lat: number } | null {
  const lat = r.lat;
  const lon = r.long;

  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lon < -180 || lon > 180) return null;

  return { lat, lon };
}

function normalizeCountyMaybe(v: unknown): string {
  return normalizeValue(String(v ?? ""));
}

type IndexedResource = Resource & {
  countiesSet: Set<County>;
  servicesSet: Set<Service>;
  servicesLabels: string[];
  orgServicesRaw: string;
  orgServicesSet: Set<OrgService>;
  orgServicesLabels: string[];
  hasOrgServices: boolean;
  hasVirtual: boolean;
  hasInPerson: boolean;
  physicalCountyNorm: string;
};

type ResourceFeatureProps = {
  id: string;
  name: string;
  address: string;
  website: string;
};

type ResourceFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: ResourceFeatureProps;
};

type ResourceFeatureCollection = {
  type: "FeatureCollection";
  features: ResourceFeature[];
};

function applyFeatureStateBatched(
  map: mapboxgl.Map,
  ids: string[],
  hidden: boolean,
  opts?: { batchSize?: number }
) {
  const batchSize = opts?.batchSize ?? 900;
  let i = 0;

  const step = () => {
    const end = Math.min(i + batchSize, ids.length);
    for (; i < end; i++) {
      map.setFeatureState({ source: MAP_SOURCE_ID, id: ids[i] }, { hidden });
    }
    if (i < ids.length) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

export default function ResourceFinder() {
  const [allResources, setAllResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  const [viewMode, setViewMode] = useState<ViewMode>("map");

  const [audience, setAudience] = useState<Audience>("Resident");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCounty, setSelectedCounty] = useState<County | "">(
    (import.meta.env.VITE_DEFAULT_COUNTY as County | undefined) ?? ""
  );

  const [selectedResidentServices, setSelectedResidentServices] = useState<Service[]>([]);
  const [selectedOrgServices, setSelectedOrgServices] = useState<OrgService[]>([]);

  const [serviceDeliveryFilter, setServiceDeliveryFilter] =
    useState<ServiceDeliveryFilter>("Either Virtually or In-Person");

  const [sortMode, setSortMode] = useState<SortMode>("alphabetical");
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationError, setLocationError] = useState("");

  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState<PerPageOption>(12);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const hoverPopupRef = useRef<mapboxgl.Popup | null>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const coordByIdRef = useRef<Map<string, [number, number]>>(new Map());
  const allIdsRef = useRef<string[]>([]);
  const prevWantedIdsRef = useRef<Set<string>>(new Set());
  const pendingSyncRef = useRef<number | null>(null);
  const isFlyingRef = useRef(false);

  const flyToCalifornia = useCallback((opts?: { immediate?: boolean }) => {
    const map = mapRef.current;
    if (!map) return;

    const run = () => {
      map.fitBounds(CA_BOUNDS, {
        padding: 40,
        maxZoom: 6.5,
        duration: opts?.immediate ? 0 : 800,
        essential: true,
      });
    };

    if (!map.isStyleLoaded()) map.once("load", run);
    else run();
  }, []);

  const flyToCounty = useCallback(
    (county: County, opts?: { immediate?: boolean }) => {
      const map = mapRef.current;
      if (!map) return;

      const b = CA_COUNTY_BOUNDS[county];
      if (!b) {
        flyToCalifornia(opts);
        return;
      }

      const run = () => {
        map.fitBounds(b, {
          padding: 40,
          maxZoom: 9,
          duration: opts?.immediate ? 0 : 800,
          essential: true,
        });
      };

      if (!map.isStyleLoaded()) map.once("load", run);
      else run();
    },
    [flyToCalifornia]
  );

  const flyToResourceId = useCallback((id: string, opts?: { immediate?: boolean }) => {
    const map = mapRef.current;
    if (!map) return;

    const coords = coordByIdRef.current.get(id);
    if (!coords) return;

    const run = () => {
      map.flyTo({
        center: coords,
        zoom: 12,
        duration: opts?.immediate ? 0 : 550,
        essential: true,
      });
    };

    if (!map.isStyleLoaded()) map.once("load", run);
    else run();
  }, []);

  const requestLocation = useCallback(() => {
    setLocationError("");

    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      setSortMode("alphabetical");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (error) => {
        let msg = "Unable to retrieve your location";
        if (error.code === error.PERMISSION_DENIED) msg = "Location permission denied.";
        else if (error.code === error.POSITION_UNAVAILABLE) msg = "Location unavailable.";
        else if (error.code === error.TIMEOUT) msg = "Location request timed out.";
        setLocationError(msg);
        setSortMode("alphabetical");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  }, []);

  const calculateDistance = useCallback(
    (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    },
    []
  );

  const onSortModeChange = useCallback(
    (mode: SortMode) => {
      if (mode === "proximity") {
        setSortMode("proximity");
        if (!userLocation) requestLocation();
      } else {
        setSortMode(mode);
      }
    },
    [requestLocation, userLocation]
  );

  useEffect(() => {
    fetchResourcesLocal()
      .then(setAllResources)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const indexedResources = useMemo<IndexedResource[]>(() => {
    const countyMap = new Map<string, County>(COUNTIES.map((c) => [normalizeValue(c), c]));
    const serviceMap = new Map<string, Service>(SERVICES.map((s) => [normalizeValue(s), s]));
    const orgServiceMap = new Map<string, OrgService>(
      ORG_SERVICES.map((s) => [normalizeValue(s), s])
    );

    return allResources.map((r) => {
      const counties = splitCommaList(r.countiesServedRaw)
        .map(normalizeValue)
        .map((n) => countyMap.get(n))
        .filter((v): v is County => Boolean(v));

      const services = splitCommaList(r.servicesIndividualsRaw)
        .map(normalizeValue)
        .map((n) => serviceMap.get(n))
        .filter((v): v is Service => Boolean(v));

      const orgRaw = (r.servicesOrganizationsRaw ?? "").trim();
      const orgList = splitCommaList(orgRaw)
        .map(normalizeValue)
        .map((n) => orgServiceMap.get(n))
        .filter((v): v is OrgService => Boolean(v));

      const flags = normalizeServiceDeliveryFlags(r.serviceDelivery, r.addressLine1);

      const physicalCountyNorm = normalizeCountyMaybe(
        (r as Resource & { physicalCounty?: string }).physicalCounty
      );

      return {
        ...r,
        countiesSet: new Set(counties),
        servicesSet: new Set(services),
        servicesLabels: services.map((s) => labelForService(s)),
        orgServicesRaw: orgRaw,
        orgServicesSet: new Set(orgList),
        orgServicesLabels: orgList.map((s) => labelForOrgService(s)),
        hasOrgServices: orgList.length > 0,
        hasInPerson: flags.hasInPerson,
        hasVirtual: flags.hasVirtual,
        physicalCountyNorm,
      };
    });
  }, [allResources]);

  const { allMapGeoJson, coordLookup, allIds } = useMemo(() => {
    const feats: ResourceFeature[] = [];
    const lookup = new Map<string, [number, number]>();
    const ids: string[] = [];

    for (const r of indexedResources) {
      const ll = getLonLat(r);
      if (!ll) continue;

      const coords: [number, number] = [ll.lon, ll.lat];
      lookup.set(r.id, coords);

      const address = [r.addressLine1, r.city, r.state, r.zip].filter(Boolean).join(", ");

      feats.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: coords },
        properties: {
          id: r.id,
          name: r.name ?? "",
          address,
          website: r.website ?? "",
        },
      });

      ids.push(r.id);
    }

    return {
      allMapGeoJson: { type: "FeatureCollection", features: feats } as ResourceFeatureCollection,
      coordLookup: lookup,
      allIds: ids,
    };
  }, [indexedResources]);

  useEffect(() => {
    coordByIdRef.current = coordLookup;
    allIdsRef.current = allIds;
    prevWantedIdsRef.current = new Set(allIds);
  }, [coordLookup, allIds]);

  const fuse = useMemo(() => {
    return new Fuse(indexedResources, {
      includeScore: false,
      shouldSort: true,
      threshold: 0.35,
      distance: 200,
      ignoreLocation: true,
      minMatchCharLength: 2,
      keys: [
        { name: "name", weight: 4 },
        { name: "orgType", weight: 2 },
        { name: "serviceArea", weight: 1.5 },
        { name: "addressLine1", weight: 1.2 },
        { name: "city", weight: 1.2 },
        { name: "state", weight: 1.0 },
        { name: "zip", weight: 1.0 },
        { name: "website", weight: 1.0 },
        { name: "contactName", weight: 1.0 },
        { name: "contactEmail", weight: 1.0 },
        { name: "countiesServedRaw", weight: 1.2 },
        { name: "servicesIndividualsRaw", weight: 1.2 },
        { name: "orgServicesRaw", weight: 1.2 },
        { name: "serviceDelivery", weight: 1.3 },
      ],
    });
  }, [indexedResources]);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const filtered = useMemo(() => {
    const q = deferredSearchQuery.trim();
    const searched: IndexedResource[] = !q ? indexedResources : fuse.search(q).map((x) => x.item);

    const isInPersonFilter = serviceDeliveryFilter === "In-Person";
    const countySelected = Boolean(selectedCounty);

    return searched.filter((r) => {
      if (countySelected) {
        const selectedCountyNorm = normalizeValue(selectedCounty);

        if (!r.countiesSet.has(selectedCounty as County)) return false;

        if (serviceDeliveryFilter === "In-Person" && r.hasInPerson) {
          const geocodedCountyMatches =
            r.physicalCountyNorm !== "" && r.physicalCountyNorm === selectedCountyNorm;
          const addressVerifiedNoGeocode =
            r.addressIsVerifiedPhysical === true && r.physicalCountyNorm === "";

          if (!geocodedCountyMatches && !addressVerifiedNoGeocode) return false;
        }
      }

      if (audience === "Organization") {
        if (r.orgServicesSet.size === 0) return false;
        if (
          selectedOrgServices.length > 0 &&
          !selectedOrgServices.some((s) => r.orgServicesSet.has(s))
        ) {
          return false;
        }
      } else {
        if (r.servicesSet.size === 0) return false;
        if (
          selectedResidentServices.length > 0 &&
          !selectedResidentServices.some((s) => r.servicesSet.has(s))
        ) {
          return false;
        }
      }

      if (serviceDeliveryFilter === "Virtually") {
        if (!r.hasVirtual) return false;
      } else if (isInPersonFilter) {
        if (!r.hasInPerson) return false;
      } else {
        if (!(r.hasVirtual || r.hasInPerson)) return false;
      }

      return true;
    });
  }, [
    indexedResources,
    fuse,
    deferredSearchQuery,
    selectedCounty,
    audience,
    selectedResidentServices,
    selectedOrgServices,
    serviceDeliveryFilter,
  ]);

  const debouncedFilteredForMap = useDebouncedValue(filtered, 120);
  const debouncedFilteredForMapRef = useRef(debouncedFilteredForMap);
  useEffect(() => {
    debouncedFilteredForMapRef.current = debouncedFilteredForMap;
  }, [debouncedFilteredForMap]);

  const selectedCountyRef = useRef<County | "">("");
  useEffect(() => {
    selectedCountyRef.current = selectedCounty;
  }, [selectedCounty]);

  const syncMapVisibilityDelta = useCallback((map: mapboxgl.Map, nextWanted: Set<string>) => {
    if (!map.getSource(MAP_SOURCE_ID)) return;

    const prevWanted = prevWantedIdsRef.current;
    const toHide: string[] = [];
    const toShow: string[] = [];

    for (const id of prevWanted) if (!nextWanted.has(id)) toHide.push(id);
    for (const id of nextWanted) if (!prevWanted.has(id)) toShow.push(id);

    if (toHide.length) applyFeatureStateBatched(map, toHide, true);
    if (toShow.length) applyFeatureStateBatched(map, toShow, false);

    prevWantedIdsRef.current = nextWanted;
  }, []);

  const getMapWantedIds = useCallback(
    (resources: IndexedResource[], county: County | ""): Set<string> => {
      const countyNorm = county ? normalizeValue(county) : "";
      return new Set(
        resources
          .filter((r) => {
            if (!countyNorm) return true;
            return r.physicalCountyNorm === countyNorm;
          })
          .filter((r) => coordByIdRef.current.has(r.id))
          .map((r) => r.id)
      );
    },
    []
  );

  const flyToCountyOrCalifornia = useCallback(
    (county: County | "") => {
      const map = mapRef.current;
      if (!map) return;

      if (pendingSyncRef.current) {
        cancelAnimationFrame(pendingSyncRef.current);
        pendingSyncRef.current = null;
      }

      isFlyingRef.current = true;

      const doFly = () => {
        if (county) flyToCounty(county as County);
        else flyToCalifornia();

        map.once("moveend", () => {
          isFlyingRef.current = false;
          const wanted = getMapWantedIds(
            debouncedFilteredForMapRef.current,
            selectedCountyRef.current
          );
          syncMapVisibilityDelta(map, wanted);
        });
      };

      requestAnimationFrame(doFly);
    },
    [flyToCounty, flyToCalifornia, getMapWantedIds, syncMapVisibilityDelta]
  );

  const sortedFiltered = useMemo(() => {
    const sorted = [...filtered];
    const selectedCountyNorm = selectedCounty ? normalizeValue(selectedCounty) : "";

    const dist = (r: Resource) => {
      if (sortMode !== "proximity" || !userLocation) return Infinity;
      const ll = getLonLat(r);
      return ll ? calculateDistance(userLocation.lat, userLocation.lon, ll.lat, ll.lon) : Infinity;
    };

    sorted.sort((a, b) => {
      if (selectedCountyNorm) {
        const aMatch = a.physicalCountyNorm && a.physicalCountyNorm === selectedCountyNorm ? 1 : 0;
        const bMatch = b.physicalCountyNorm && b.physicalCountyNorm === selectedCountyNorm ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
      }

      if (sortMode === "proximity" && userLocation) {
        const da = dist(a);
        const db = dist(b);
        if (da !== db) return da - db;
        return (a.name ?? "").localeCompare(b.name ?? "");
      }

      return (a.name ?? "").localeCompare(b.name ?? "");
    });

    return sorted;
  }, [filtered, selectedCounty, sortMode, userLocation, calculateDistance]);

  const effectivePerPage = useMemo(() => {
    if (perPage === "all") return sortedFiltered.length || 1;
    return perPage;
  }, [perPage, sortedFiltered.length]);

  const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / effectivePerPage));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const pageResources = useMemo(() => {
    if (perPage === "all") return sortedFiltered;
    const start = (safePage - 1) * effectivePerPage;
    return sortedFiltered.slice(start, start + effectivePerPage);
  }, [sortedFiltered, perPage, safePage, effectivePerPage]);

  const onPageChange = (page: number) => {
    const clamped = Math.max(1, Math.min(totalPages, page));
    setCurrentPage(clamped);
  };

  useEffect(() => {
    if (viewMode !== "map") return;
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
    if (!token) {
      console.error("Missing VITE_MAPBOX_TOKEN. Add it to your .env and restart the dev server.");
      return;
    }
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [-119.4179, 36.7783],
      zoom: 5,
      // 2.5.1 Pointer Gestures: disable multi-point-only gestures.
      // cooperativeGestures requires ctrl+scroll on desktop and two fingers on touch,
      // but all zoom/pan actions remain available via single-pointer controls
      // (zoom buttons, click-drag, +/- keys).
      cooperativeGestures: true,
      // Rotate requires two-finger twist; disable it so no action requires a
      // path-based or multi-point gesture without a single-pointer alternative.
      dragRotate: false,
      touchPitch: false,
      touchZoomRotate: true, // pinch-to-zoom kept but + / - keyboard / buttons cover it
    });

    // 2.1.1 Keyboard: prevent the map canvas from being a keyboard focus trap.
    // The canvas is not keyboard-operable itself; all map interactions are
    // reachable via the side-panel list and zoom control buttons.
    const canvas = map.getCanvas();
    canvas.setAttribute("tabindex", "-1");
    canvas.setAttribute("aria-hidden", "true");

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), "top-right");
    // 2.4.3 Focus Order: Mapbox injects © attribution after the logo link in the DOM
    // but the logo link appears first visually. We remove the default attribution control
    // and add a compact one so we can then fix the tab order via tabIndex after load.
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

    const onLoad = () => {
      if (!map.getSource(MAP_SOURCE_ID)) {
        map.addSource(MAP_SOURCE_ID, {
          type: "geojson",
          data: allMapGeoJson,
          promoteId: "id",
        });
      }

      if (!map.getLayer(MAP_LAYER_ID)) {
        map.addLayer({
          id: MAP_LAYER_ID,
          type: "circle",
          source: MAP_SOURCE_ID,
          paint: {
            "circle-opacity": [
              "case",
              ["boolean", ["feature-state", "hidden"], false],
              0.0,
              0.85,
            ],
            "circle-radius": [
              "case",
              ["boolean", ["feature-state", "hidden"], false],
              0,
              6,
            ],
            "circle-color": "#b94f00",
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#fff",
          },
        });
      }

      const c = selectedCountyRef.current;
      if (c) flyToCounty(c as County, { immediate: true });
      else flyToCalifornia({ immediate: true });

      // 2.4.3: The Mapbox logo <a> and the © attribution <a> links are sibling
      // controls. The logo appears visually first (left) but the © links are first
      // in DOM order. Setting tabindex="1" on the logo and tabindex="2" on © links
      // forces keyboard focus to visit them in visual left-to-right order.
      const logoEl = map.getContainer().querySelector<HTMLElement>(".mapboxgl-ctrl-logo");
      if (logoEl) logoEl.setAttribute("tabindex", "1");

      const attrLinks = Array.from(
        map.getContainer().querySelectorAll<HTMLElement>(".mapboxgl-ctrl-attrib a")
      );
      attrLinks.forEach((a) => a.setAttribute("tabindex", "2"));

      prevWantedIdsRef.current = new Set(allIdsRef.current);

      const wanted = getMapWantedIds(
        debouncedFilteredForMapRef.current,
        selectedCountyRef.current
      );
      syncMapVisibilityDelta(map, wanted);

      const showHover = (e: mapboxgl.MapMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;

        const id = typeof f.id === "string" ? f.id : "";
        if (id) {
          const st = map.getFeatureState({ source: MAP_SOURCE_ID, id }) as { hidden?: boolean };
          if (st?.hidden) return;
        }

        const geom = f.geometry;
        if (!geom || geom.type !== "Point") return;

        const coords = geom.coordinates as [number, number];
        const props = (f.properties ?? {}) as Record<string, unknown>;
        const name = String(props.name ?? "");
        const address = String(props.address ?? "");

        const html = `
          <div translate="no" style="max-width: 280px;">
            <div style="font-weight: 700; margin-bottom: 4px;">${name}</div>
            ${address ? `<div style="margin-bottom: 6px;">${address}</div>` : ""}
          </div>
        `;

        if (!hoverPopupRef.current) {
          hoverPopupRef.current = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 10,
            className: "resource-tooltip",
          });
        }

        hoverPopupRef.current.setLngLat(coords).setHTML(html).addTo(map);
      };

      const hideHover = () => hoverPopupRef.current?.remove();

      map.on("mouseenter", MAP_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", MAP_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
        hideHover();
      });

      map.on("mousemove", MAP_LAYER_ID, showHover);

      map.on("click", MAP_LAYER_ID, (e) => {
        const f = e.features?.[0];
        if (!f) return;

        const id = typeof f.id === "string" ? f.id : "";
        if (!id) return;

        const st = map.getFeatureState({ source: MAP_SOURCE_ID, id }) as { hidden?: boolean };
        if (st?.hidden) return;

        setSelectedResourceId(id);
        flyToResourceId(id);
      });
    };

    map.on("load", onLoad);

    return () => {
      if (pendingSyncRef.current) {
        cancelAnimationFrame(pendingSyncRef.current);
        pendingSyncRef.current = null;
      }

      hoverPopupRef.current?.remove();
      hoverPopupRef.current = null;

      map.remove();
      mapRef.current = null;
    };
  }, [viewMode, allMapGeoJson, flyToCalifornia, flyToCounty, flyToResourceId, getMapWantedIds, syncMapVisibilityDelta]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const run = () => {
      const src = map.getSource(MAP_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (!src) return;

      src.setData(allMapGeoJson);
      prevWantedIdsRef.current = new Set(allIdsRef.current);

      const wanted = getMapWantedIds(
        debouncedFilteredForMapRef.current,
        selectedCountyRef.current
      );
      syncMapVisibilityDelta(map, wanted);
    };

    if (!map.isStyleLoaded()) map.once("load", run);
    else run();
  }, [allMapGeoJson, getMapWantedIds, syncMapVisibilityDelta]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const run = () => {
      if (!map.getSource(MAP_SOURCE_ID)) return;
      if (isFlyingRef.current) return;

      const wanted = getMapWantedIds(debouncedFilteredForMap, selectedCountyRef.current);

      if (pendingSyncRef.current) cancelAnimationFrame(pendingSyncRef.current);
      pendingSyncRef.current = requestAnimationFrame(() => {
        pendingSyncRef.current = null;
        syncMapVisibilityDelta(map, wanted);
      });
    };

    if (!map.isStyleLoaded()) {
      map.once("load", run);
      return;
    }

    run();
  }, [debouncedFilteredForMap, getMapWantedIds, syncMapVisibilityDelta]);

  const onAudienceChange = (next: Audience) => {
    setAudience(next);
    setSelectedResidentServices([]);
    setSelectedOrgServices([]);
    setCurrentPage(1);
    setSelectedResourceId(null);
  };

  const onSearchChange = (next: string) => {
    setSearchQuery(next);
    setCurrentPage(1);
    setSelectedResourceId(null);
  };

  const onCountyChange = (next: County | "") => {
    setSelectedCounty(next);
    setCurrentPage(1);
    setSelectedResourceId(null);
    flyToCountyOrCalifornia(next);
  };

  const toggleResidentService = (svc: Service) => {
    setSelectedResidentServices((prev) =>
      prev.includes(svc) ? prev.filter((x) => x !== svc) : [...prev, svc]
    );
    setCurrentPage(1);
    setSelectedResourceId(null);
  };

  const toggleOrgService = (svc: OrgService) => {
    setSelectedOrgServices((prev) =>
      prev.includes(svc) ? prev.filter((x) => x !== svc) : [...prev, svc]
    );
    setCurrentPage(1);
    setSelectedResourceId(null);
  };

  const selectAllResidentServices = () => {
    setSelectedResidentServices([...SERVICES]);
    setCurrentPage(1);
    setSelectedResourceId(null);
  };

  const clearResidentServices = () => {
    setSelectedResidentServices([]);
    setCurrentPage(1);
    setSelectedResourceId(null);
  };

  const selectAllOrgServices = () => {
    setSelectedOrgServices([...ORG_SERVICES]);
    setCurrentPage(1);
    setSelectedResourceId(null);
  };

  const clearOrgServices = () => {
    setSelectedOrgServices([]);
    setCurrentPage(1);
    setSelectedResourceId(null);
  };

  const countyOptions: SelectOption<County | "">[] = [
    { value: "", label: "Any county" },
    ...COUNTIES.map((c) => ({ value: c, label: `${c} County` })),
  ];

  const residentOptions = SERVICES.map((s) => ({ value: s, label: labelForService(s) }));
  const orgOptions = ORG_SERVICES.map((s) => ({ value: s, label: labelForOrgService(s) }));

  const deliveryOptions: SelectOption<ServiceDeliveryFilter>[] = SERVICE_DELIVERY_OPTIONS.map((v) => ({
    value: v,
    label:
      v === "Virtually"
        ? "Virtual"
        : v === "Either Virtually or In-Person"
        ? "Either Virtual or In-Person"
        : v,
  }));

  const sortOptions: SelectOption<SortMode>[] = [
    { value: "alphabetical", label: "A-Z" },
    { value: "proximity", label: "Proximity to Me" },
  ];

  const renderResultsSummary = () => {
    if (selectedResourceId) {
      const chosen = sortedFiltered.find((r) => r.id === selectedResourceId);
      return (
        <p className="m-0">
          Showing <strong>{chosen?.name ?? "selected resource"}</strong>
        </p>
      );
    }

    const activeServices = audience === "Resident" ? selectedResidentServices : selectedOrgServices;

    const serviceLabels = activeServices.map((s) =>
      audience === "Resident" ? labelForService(s as Service) : labelForOrgService(s as OrgService)
    );

    const renderServiceLabel = () => {
      if (serviceLabels.length === 0) return null;
      if (serviceLabels.length === 1) return <strong>{serviceLabels[0]}</strong>;
      if (serviceLabels.length === 2)
        return (
          <>
            <strong>{serviceLabels[0]}</strong> or <strong>{serviceLabels[1]}</strong>
          </>
        );
      return (
        <>
          {serviceLabels.slice(0, -1).map((l, i) => (
            <span key={l}>
              <strong>{l}</strong>
              {i < serviceLabels.length - 2 ? ", " : ""}
            </span>
          ))}{" "}
          or <strong>{serviceLabels[serviceLabels.length - 1]}</strong>
        </>
      );
    };

    return (
      <p className="m-0">
        Showing <strong>{filtered.length}</strong> result{filtered.length !== 1 ? "s" : ""}
        {selectedCounty ? (
          <> serving <strong>{selectedCounty} County</strong></>
        ) : (
          <> serving <strong>All Counties</strong></>
        )}
        {serviceLabels.length > 0 && <> that help you with {renderServiceLabel()}</>}
        {serviceDeliveryFilter !== "Either Virtually or In-Person" && (
          <>
            {" "}
            available{" "}
            <strong>{serviceDeliveryFilter === "Virtually" ? "virtually" : "in-person"}</strong>
          </>
        )}
        {deferredSearchQuery.trim() && (
          <> matching <strong>"{deferredSearchQuery.trim()}"</strong></>
        )}
      </p>
    );
  };

  const sidePanelResources = useMemo(() => {
    if (!selectedResourceId) return sortedFiltered;
    const chosen = sortedFiltered.find((r) => r.id === selectedResourceId);
    return chosen ? [chosen] : sortedFiltered;
  }, [sortedFiltered, selectedResourceId]);

  if (loading) {
    return (
      <div className="p-4" role="status" aria-live="polite">
        Loading…
      </div>
    );
  }

  if (err) {
    return (
      <div className="p-4 text-red-700" role="alert">
        Error: {err}
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <header className="iframe-styles md:mx-32 lg:mx-64" style={{ marginTop: 0 }}>
        <div
          className="text-white py-4 px-4"
          style={{
            background: "#1f2576",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            justifyContent: "space-between",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 420px" }}>
            <h1 className="h2 m-0" style={{ fontWeight: 800, lineHeight: 1.1 }}>
              <span
                className="inline-block"
                style={{
                  backgroundImage: "linear-gradient(#f97316,#f97316)",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "100% 4px",
                  backgroundPosition: "0 100%",
                  paddingBottom: "6px",
                }}
              >
                Digital Equity
              </span>{" "}
              Resource Finder
            </h1>
          </div>

          <div style={{ flex: "0 1 320px", minWidth: 220 }}>
            <TranslateDropdown />
          </div>
        </div>

        <p className="m-t-md px-4">
          Welcome to the California Digital Equity Resource Finder – a tool designed to assist
          residents and organizations to find digital inclusion programs and services in their
          communities. The Resource Finder was updated in March 2026.
        </p>
        <p className="m-t-sm px-4">
          <span style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <a
              href="https://broadbandforall.cdt.ca.gov/digital-equity-resource-survey/"
              className="btn btn-outline-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Add a Resource
            </a>
            <a
              href="https://broadbandforall.cdt.ca.gov/digital-equity-resource-finder/update-resource/"
              className="btn btn-outline-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Update a Resource
            </a>
          </span>
        </p>
      </header>

      <section
        className="m-b-md bg-gray-50 border-b border-t border-gray-300"
        aria-labelledby="filters-heading"
      >
        <h2 id="filters-heading" className="sr-only">
          Filters
        </h2>

        <div className="card md:mx-36 mb-0">
          <div className="card-body px-0 bg-gray-50">
            <div className="row">
              <div className="col-12 col-lg-6">
                {/*
                  Each radio has a unique `name` so the browser never forms a
                  group — roving tabindex never applies and both stay tabbable.
                  role="radiogroup" + aria-labelledby give screen readers the
                  group semantics without the browser's tab-management side-effect.
                */}
                <div role="radiogroup" aria-labelledby="audience-legend">
                  <label
                    id="audience-legend"
                    className="form-label d-inline-flex align-items-center"
                  >
                    <span>I am...</span>
                    <Tooltip text="Choose Resident to see services for individuals. Choose Organization to see services for organizations." />
                  </label>
                  <div className="d-flex gap-4">
                    <div className="form-check m-t-sm">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="audience-resident"
                        id="audienceResident"
                        checked={audience === "Resident"}
                        onChange={() => onAudienceChange("Resident")}
                        onKeyDown={(e) => { if (e.key === "Enter") onAudienceChange("Resident"); }}
                        style={{ border: "2px solid #595959" }}
                      />
                      <label className="form-check-label" htmlFor="audienceResident">
                        A Resident
                      </label>
                    </div>
                    <div className="form-check m-t-sm">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="audience-organization"
                        id="audienceOrganization"
                        checked={audience === "Organization"}
                        onChange={() => onAudienceChange("Organization")}
                        onKeyDown={(e) => { if (e.key === "Enter") onAudienceChange("Organization"); }}
                        style={{ border: "2px solid #595959" }}
                      />
                      <label className="form-check-label" htmlFor="audienceOrganization">
                        An Organization
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-12 col-lg-6 m-b-sm">
                <SingleSelect
                  id="county-select"
                  labelNode={
                    <>
                      <span>Location</span>
                      <Tooltip text="Select a county to filter results. Choose 'Any county' to clear." />
                    </>
                  }
                  placeholder="Any county"
                  options={countyOptions}
                  value={selectedCounty}
                  onChange={(v) => onCountyChange(v)}
                  clearable
                  onClear={() => onCountyChange("")}
                  clearAriaLabel="Clear county"
                  searchable={true}
                />
              </div>
            </div>

            <div className="row m-t-md">
              <div className="col-12 col-lg-6 m-b-sm">
                <MultiSelect
                  id="services-multiselect"
                  labelNode={
                    <>
                      <span>{audience === "Resident" ? "Service type" : "Support type"}</span>
                      <Tooltip
                        text={
                          audience === "Resident"
                            ? "Select services you need as a resident. Results match any selected service."
                            : "Select supports your organization needs. Results match any selected support."
                        }
                      />
                    </>
                  }
                  placeholder="All services"
                  options={audience === "Resident" ? residentOptions : orgOptions}
                  selected={
                    audience === "Resident" ? selectedResidentServices : selectedOrgServices
                  }
                  onToggle={(val: Service | OrgService) => {
                    if (audience === "Resident") toggleResidentService(val as Service);
                    else toggleOrgService(val as OrgService);
                  }}
                  onSelectAll={() => {
                    if (audience === "Resident") selectAllResidentServices();
                    else selectAllOrgServices();
                  }}
                  onClear={() => {
                    if (audience === "Resident") clearResidentServices();
                    else clearOrgServices();
                  }}
                />
              </div>

              <div className="col-12 col-lg-6 m-b-sm">
                <SingleSelect
                  id="delivery-select"
                  labelNode={
                    <>
                      <span>Service delivery</span>
                      <Tooltip text="Filter results by how the organization provides services (virtual, in-person, or either)." />
                    </>
                  }
                  placeholder="Service delivery"
                  options={deliveryOptions}
                  value={serviceDeliveryFilter}
                  onChange={(v) => {
                    setServiceDeliveryFilter(v);
                    setCurrentPage(1);
                    setSelectedResourceId(null);
                  }}
                />
              </div>
            </div>

            <div className="row m-t-md">
              <div className="col-12 col-lg-6 m-b-sm">
                <form
                  role="search"
                  aria-label="Search resources"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setCurrentPage(1);
                    setSelectedResourceId(null);
                    resultsHeadingRef.current?.focus();
                  }}
                >
                  <label className="form-label d-inline-flex align-items-center" htmlFor="search">
                    <span>Open Search</span>
                    <Tooltip text="Search is fuzzy and looks across organization name, services, counties served, and other key fields." />
                  </label>

                  <p id="search-help" className="sr-only">
                    Search across organization name, services, counties served, and other key fields.
                  </p>
                  <style>{`#search:focus-visible{outline:2px solid #1a6faf!important;outline-offset:0!important;box-shadow:none!important;border-color:#1a6faf!important}`}</style>

                  <div className="pos-rel text-normal">
                    <div
                      className="d-flex w-100"
                      style={{
                        alignItems: "stretch",
                        flexWrap: "nowrap",
                        minWidth: 0,
                        position: "relative",
                      }}
                      onKeyDown={(e) => {
                        const target = e.target as HTMLElement | null;
                        const isInput = target?.id === "search";
                        if (e.key === "Escape" && isInput && searchQuery) {
                          e.preventDefault();
                          onSearchChange("");
                          (document.getElementById("search") as HTMLInputElement | null)?.focus();
                        }
                      }}
                    >
                      <input
                        id="search"
                        type="search"
                        name="q"
                        aria-describedby="search-help"
                        placeholder="Search"
                        className="search-textfield font-normal"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        style={{
                          flex: "1 1 auto",
                          minWidth: 0,
                          height: "44px",
                          minHeight: "44px",
                          paddingRight: searchQuery ? "104px" : "72px",
                          border: "2px solid #595959",
                          borderRadius: "6px 0 0 6px",
                        }}
                      />

                      {searchQuery && (
                        <button
                          type="button"
                          aria-label="Clear search"
                          title="Clear search"
                          onClick={() => {
                            onSearchChange("");
                            (document.getElementById("search") as HTMLInputElement | null)?.focus();
                          }}
                          className="position-absolute bg-transparent border-0"
                          style={{
                            right: "44px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            width: "44px",
                            height: "44px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                            <path
                              d="M5 5l10 10M15 5L5 15"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                          <span className="sr-only">Clear</span>
                        </button>
                      )}

                      <button
                        type="submit"
                        className="gsc-search-button bg-gray-600"
                        aria-label="Apply search"
                        style={{
                          flex: "0 0 44px",
                          height: "44px",
                          width: "44px",
                          minWidth: "44px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span
                          className="ca-gov-icon-search"
                          aria-hidden="true"
                          style={{ color: "#ffffff" }}
                        />
                        <span className="sr-only">Apply search</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              <div className="col-12 col-lg-6 m-b-sm">
                <div className="d-flex align-items-end h-100">
                  <div className="w-100">
                    <label
                      className="form-label d-inline-flex align-items-center"
                      htmlFor="view-toggle"
                    >
                      <span>View</span>
                      <Tooltip text="Switch between map view and tabular (list) view." />
                    </label>
                    <div>
                      <ViewToggle
                        selectedView={viewMode}
                        handleNavigate={(view) => {
                          setViewMode(view);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="md:mx-36" aria-labelledby="results-heading">
        <div className="row g-3 align-items-start align-items-md-end m-b-md">
          <div className="col-12 col-lg-8">
            <h2
              id="results-heading"
              ref={resultsHeadingRef}
              tabIndex={-1}
              className="sr-only"
            >
              Results
            </h2>
            <div aria-live="polite" aria-atomic="true">
              {renderResultsSummary()}
            </div>
          </div>

          <div className="col-12 col-lg-4">
            <SingleSelect
              id="sort-select"
              labelNode={
                <>
                  <span>Sort results by</span>
                  <Tooltip text="Select how to sort results, either alphabetically or by proximity to you." />
                </>
              }
              placeholder="Sort by"
              options={sortOptions}
              value={sortMode}
              onChange={(v) => onSortModeChange(v)}
            />

            {locationError && (
              <div
                className="text-danger mt-1"
                style={{ fontSize: "0.875rem" }}
                role="status"
                aria-live="polite"
              >
                {locationError}
              </div>
            )}
          </div>
        </div>

        {viewMode === "map" ? (
          <div className="row g-3 align-items-start">
            {/*
              DOM ORDER: side panel first so keyboard/screen-reader users reach the
              results list before the map canvas (WCAG 2.4.3 Focus Order).
              Visual order is restored with CSS `order` (2.1.1 + 2.4.3).
            */}
            <div
              className="col-12 col-lg-4"
              style={{ order: 2 }}
            >
              <TranslateErrorBoundary>
                <div className="card" aria-labelledby="map-results-heading">
                  <div
                    className="card-body p-0"
                    style={{ maxHeight: "500px", overflow: "auto" }}
                  >
                    <h3 id="map-results-heading" className="sr-only">
                      Map results list
                    </h3>

                    <ul className="list-unstyled m-0 p-0">
                      {sidePanelResources.map((r) => {
                        const servicesToShow =
                          audience === "Resident" ? r.servicesLabels : r.orgServicesLabels;
                        const servicesLabel =
                          audience === "Resident"
                            ? "Services"
                            : "Supports / services for organizations";
                        const freeLowCostToShow =
                          audience === "Resident"
                            ? r.freeLowCostResidents
                            : r.freeLowCostOrganizations;

                        return (
                          <li key={r.id} className="m-b-md">
                            <ResourceCard
                              resource={r}
                              servicesToShow={servicesToShow}
                              servicesLabel={servicesLabel}
                              freeLowCostToShow={freeLowCostToShow}
                            />

                            {!selectedResourceId && (
                              <div>
                                <button
                                  type="button"
                                  className="btn btn-outline-primary w-100"
                                  aria-label={`Zoom to ${r.name} on the map`}
                                  onClick={() => {
                                    setSelectedResourceId(r.id);
                                    flyToResourceId(r.id);
                                  }}
                                >
                                  Zoom to this resource
                                </button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>

                    {selectedResourceId && (
                      <div>
                        <button
                          type="button"
                          className="btn btn-outline-primary w-100"
                          aria-label="Back to all results and zoom out on the map"
                          onClick={() => {
                            setSelectedResourceId(null);
                            flyToCountyOrCalifornia(selectedCounty);
                          }}
                        >
                          Back to all results
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </TranslateErrorBoundary>
            </div>

            <div
              className="col-12 col-lg-8"
              style={{ order: 1 }}
            >
              <div className="card">
                <div className="card-body p-0">
                  {/* Skip link: lets keyboard users bypass the map canvas (2.1.1) */}
                  <a
                    href="#map-results-heading"
                    className="sr-only sr-only-focusable"
                    style={{ position: "absolute", zIndex: 1 }}
                  >
                    Skip map, go to results list
                  </a>
                  <p id="map-help" className="sr-only">
                    Interactive map of resource locations. Use the results list to browse
                    resources without a mouse. All map points are also listed there.
                  </p>
                  <div
                    ref={mapContainerRef}
                    translate="no"
                    role="region"
                    aria-label="Map of resource locations"
                    aria-describedby="map-help"
                    style={{
                      width: "100%",
                      height: "500px",
                      minHeight: "420px",
                      borderRadius: "4px",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <TranslateErrorBoundary>
            <>
              <div className="row">
                {pageResources.map((r) => {
                  const servicesToShow =
                    audience === "Resident" ? r.servicesLabels : r.orgServicesLabels;
                  const servicesLabel =
                    audience === "Resident"
                      ? "Services"
                      : "Supports / services for organizations";
                  const freeLowCostToShow =
                    audience === "Resident"
                      ? r.freeLowCostResidents
                      : r.freeLowCostOrganizations;

                  return (
                    <div key={r.id} className="col-12 col-md-6 col-lg-4 m-b-md">
                      <ResourceCard
                        resource={r}
                        servicesToShow={servicesToShow}
                        servicesLabel={servicesLabel}
                        freeLowCostToShow={freeLowCostToShow}
                      />
                    </div>
                  );
                })}
              </div>

              <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                onPageChange={onPageChange}
                perPage={perPage}
                onPerPageChange={(val) => {
                  setPerPage(val);
                  setCurrentPage(1);
                }}
              />
            </>
          </TranslateErrorBoundary>
        )}
      </section>
    </div>
  );
}