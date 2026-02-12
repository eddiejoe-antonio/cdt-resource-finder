// src/components/ResourceFinder.tsx
import {
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

type Audience = "Resident" | "Organization";
type SortMode = "alphabetical" | "proximity";
type PerPageOption = 12 | 36 | 72 | "all";

// California bbox
const CA_BOUNDS: mapboxgl.LngLatBoundsLike = [
  [-124.48, 32.53],
  [-114.13, 42.01],
];

const MAP_SOURCE_ID = "resources";
const MAP_LAYER_ID = "resources-circle";

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

type IndexedResource = Resource & {
  countiesSet: Set<County>;
  servicesSet: Set<Service>;
  servicesLabels: string[];

  orgServicesRaw: string;
  orgServicesSet: Set<OrgService>;
  orgServicesLabels: string[];
  hasOrgServices: boolean;

  // derived from Q8 and address
  hasVirtual: boolean;
  hasInPerson: boolean;
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

// Chunk feature-state writes so we don't lock the main thread
function applyFeatureStateBatched(
  map: mapboxgl.Map,
  ids: string[],
  visible: boolean,
  opts?: { batchSize?: number }
) {
  const batchSize = opts?.batchSize ?? 750;
  let i = 0;

  const step = () => {
    const end = Math.min(i + batchSize, ids.length);
    for (; i < end; i++) {
      map.setFeatureState({ source: MAP_SOURCE_ID, id: ids[i] }, { visible });
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

  // Filters
  const [audience, setAudience] = useState<Audience>("Resident");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCounties, setSelectedCounties] = useState<County[]>([]);
  const [selectedResidentServices, setSelectedResidentServices] = useState<Service[]>([]);
  const [selectedOrgServices, setSelectedOrgServices] = useState<OrgService[]>([]);

  // Service delivery (Q8)
  const [serviceDeliveryFilter, setServiceDeliveryFilter] =
    useState<ServiceDeliveryFilter>("Either Virtually or In-Person");

  // Sorting
  const [sortMode, setSortMode] = useState<SortMode>("alphabetical");
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationError, setLocationError] = useState("");

  // Selection
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

  // Pagination (list view)
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState<PerPageOption>(12);
  const resultsTopRef = useRef<HTMLDivElement | null>(null);

  // Map refs (map is created when in map view)
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const hoverPopupRef = useRef<mapboxgl.Popup | null>(null);

  // Lookup for click->fly
  const coordByIdRef = useRef<Map<string, [number, number]>>(new Map());

  // Track which ids are currently visible on the map (feature-state)
  const visibleIdsRef = useRef<Set<string>>(new Set());

  // ------------------ map helpers ------------------
  const flyToCalifornia = useCallback((opts?: { immediate?: boolean }) => {
    const map = mapRef.current;
    if (!map) return;

    const run = () => {
      map.fitBounds(CA_BOUNDS, {
        padding: 40,
        maxZoom: 6.5,
        duration: opts?.immediate ? 0 : 650,
        essential: true,
      });
    };

    if (!map.isStyleLoaded()) map.once("load", run);
    else run();
  }, []);

  const flyToResourceId = useCallback((id: string, opts?: { immediate?: boolean }) => {
    const map = mapRef.current;
    if (!map) return;

    const coords = coordByIdRef.current.get(id);
    if (!coords) return;

    const run = () => {
      map.flyTo({
        center: coords,
        zoom: 12,
        duration: opts?.immediate ? 0 : 650,
        essential: true,
      });
    };

    if (!map.isStyleLoaded()) map.once("load", run);
    else run();
  }, []);

  const clearSelection = useCallback(
    (opts?: { zoomOut?: boolean }) => {
      setSelectedResourceId((prev) => {
        if (!prev) return prev;
        if (opts?.zoomOut) flyToCalifornia({ immediate: true });
        return null;
      });
    },
    [flyToCalifornia]
  );

  // ------------------ location ------------------
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
      }
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

  // ------------------ data load ------------------
  useEffect(() => {
    fetchResourcesLocal()
      .then(setAllResources)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  // ------------------ build indexed resources once ------------------
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

      // ✅ UPDATED: Pass address to normalizeServiceDeliveryFlags
      const flags = normalizeServiceDeliveryFlags(r.serviceDelivery, r.addressLine1);

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
      };
    });
  }, [allResources]);

  // ------------------ build ALL map features ------------------
  const allMapGeoJson = useMemo<ResourceFeatureCollection>(() => {
    const feats: ResourceFeature[] = [];
    const coordLookup = new Map<string, [number, number]>();

    for (const r of indexedResources) {
      const ll = getLonLat(r);
      if (!ll) continue;

      const coords: [number, number] = [ll.lon, ll.lat];
      coordLookup.set(r.id, coords);

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
    }

    coordByIdRef.current = coordLookup;
    return { type: "FeatureCollection", features: feats };
  }, [indexedResources]);

  // ------------------ fuse ------------------
  const fuse = useMemo(() => {
    return new Fuse(indexedResources, {
      includeScore: true,
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

  // ------------------ filtered results ------------------
  const filtered = useMemo(() => {
    const q = deferredSearchQuery.trim();
    const searched: IndexedResource[] = !q ? indexedResources : fuse.search(q).map((x) => x.item);

    return searched.filter((r) => {
      if (selectedCounties.length > 0) {
        if (!selectedCounties.some((c) => r.countiesSet.has(c))) return false;
      }

      if (audience === "Organization") {
        if (!r.hasOrgServices) return false;
        if (
          selectedOrgServices.length > 0 &&
          !selectedOrgServices.some((s) => r.orgServicesSet.has(s))
        ) {
          return false;
        }
      } else {
        if (
          selectedResidentServices.length > 0 &&
          !selectedResidentServices.some((s) => r.servicesSet.has(s))
        ) {
          return false;
        }
      }

      // ✅ Service delivery filter logic (unchanged, but now uses updated flags)
      if (serviceDeliveryFilter === "Virtually") {
        if (!r.hasVirtual) return false;
      } else if (serviceDeliveryFilter === "In-Person") {
        if (!r.hasInPerson) return false;
      } else {
        // "Either Virtually or In-Person" - must have at least one option
        if (!(r.hasVirtual || r.hasInPerson)) return false;
      }

      return true;
    });
  }, [
    indexedResources,
    fuse,
    deferredSearchQuery,
    selectedCounties,
    audience,
    selectedResidentServices,
    selectedOrgServices,
    serviceDeliveryFilter,
  ]);

  // Debounce what the map sees (feature-state diffs)
  const debouncedFilteredForMap = useDebouncedValue(filtered, 150);

  // ✅ FIX: helper that can run on load AND from effects
  const syncMapVisibility = useCallback(
    (map: mapboxgl.Map, wantedIds: Set<string>) => {
      // If source/layer not ready yet, bail safely.
      if (!map.getSource(MAP_SOURCE_ID)) return;

      const prevIds = visibleIdsRef.current;

      const turnOff: string[] = [];
      const turnOn: string[] = [];

      for (const id of prevIds) if (!wantedIds.has(id)) turnOff.push(id);
      for (const id of wantedIds) if (!prevIds.has(id)) turnOn.push(id);

      if (turnOff.length) applyFeatureStateBatched(map, turnOff, false, { batchSize: 750 });
      if (turnOn.length) applyFeatureStateBatched(map, turnOn, true, { batchSize: 750 });

      visibleIdsRef.current = wantedIds;
    },
    []
  );

  // ------------------ sorting + pagination ------------------
  const sortedFiltered = useMemo(() => {
    const sorted = [...filtered];

    if (sortMode === "proximity" && userLocation) {
      const withDistances = sorted.map((r) => {
        const ll = getLonLat(r);
        const d = ll
          ? calculateDistance(userLocation.lat, userLocation.lon, ll.lat, ll.lon)
          : Infinity;
        return { r, d };
      });
      withDistances.sort((a, b) => a.d - b.d);
      return withDistances.map((x) => x.r);
    }

    sorted.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return sorted;
  }, [filtered, sortMode, userLocation, calculateDistance]);

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
    resultsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ------------------ MAP INIT ------------------
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
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      flyToCalifornia({ immediate: true });

      map.addSource(MAP_SOURCE_ID, {
        type: "geojson",
        data: allMapGeoJson,
        promoteId: "id",
      });

      map.addLayer({
        id: MAP_LAYER_ID,
        type: "circle",
        source: MAP_SOURCE_ID,
        paint: {
          "circle-opacity": [
            "case",
            ["boolean", ["feature-state", "visible"], false],
            0.85,
            0.0,
          ],
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "visible"], false],
            6,
            0,
          ],
          "circle-color": "#f08024",
          "circle-stroke-width": 0.25,
          "circle-stroke-color": "#fff",
        },
      });

      // ✅ FIX: when map is created, DO NOT default to "everything visible".
      // Instead, set initial visibleIdsRef to ALL ids, then immediately sync to current filter.
      const allIds = allMapGeoJson.features.map((f) => f.properties.id);
      visibleIdsRef.current = new Set(allIds);

      // Start by marking everything visible (optional), then immediately apply current filters
      // (If you'd rather avoid a flash, you can flip these: hide all first, then show wanted)
      applyFeatureStateBatched(map, allIds, true, { batchSize: 750 });

      // ✅ Apply current filtered set immediately on load
      const wanted = new Set(debouncedFilteredForMap.map((r) => r.id));
      syncMapVisibility(map, wanted);

      // Hover tooltip
      const showHover = (e: mapboxgl.MapMouseEvent) => {
        const f = e.features?.[0] as mapboxgl.MapboxGeoJSONFeature | undefined;
        if (!f) return;

        const geom = f.geometry as GeoJSON.Point;
        const coords = geom.coordinates as [number, number];
        const props = (f.properties ?? {}) as Record<string, unknown>;

        const name = String(props.name ?? "");
        const address = String(props.address ?? "");

        const html = `
          <div style="max-width: 280px;">
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
        const f = e.features?.[0] as mapboxgl.MapboxGeoJSONFeature | undefined;
        if (!f) return;
        const props = (f.properties ?? {}) as Record<string, unknown>;
        const id = String(props.id ?? "");
        if (!id) return;

        setSelectedResourceId(id);
        flyToResourceId(id);
      });
    });

    return () => {
      hoverPopupRef.current?.remove();
      hoverPopupRef.current = null;

      map.remove();
      mapRef.current = null;
    };
  }, [viewMode, allMapGeoJson, flyToCalifornia, flyToResourceId, debouncedFilteredForMap, syncMapVisibility]);

  // ------------------ MAP FILTERING via diffs ------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const run = () => {
      if (!map.getSource(MAP_SOURCE_ID)) return;
      const wanted = new Set(debouncedFilteredForMap.map((r) => r.id));
      syncMapVisibility(map, wanted);
    };

    // ✅ FIX: if user is in table view, map might not exist (fine).
    // If map exists but isn't loaded yet, schedule once.
    if (!map.isStyleLoaded()) {
      map.once("load", run);
      return;
    }

    run();
  }, [debouncedFilteredForMap, syncMapVisibility]);

  // Zoom behavior ONLY when selection changes
  useEffect(() => {
    if (viewMode !== "map") return;

    if (selectedResourceId) flyToResourceId(selectedResourceId);
    else flyToCalifornia();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResourceId, viewMode]);

  // ------------------ handlers ------------------
  const onAudienceChange = (next: Audience) => {
    setAudience(next);
    setSelectedResidentServices([]);
    setSelectedOrgServices([]);
    setCurrentPage(1);
    clearSelection({ zoomOut: true });
  };

  const onSearchChange = (next: string) => {
    setSearchQuery(next);
    setCurrentPage(1);
    clearSelection({ zoomOut: true });
  };

  const toggleCounty = (c: County) => {
    setSelectedCounties((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
    setCurrentPage(1);
    clearSelection({ zoomOut: true });
  };

  const selectAllCounties = () => {
    setSelectedCounties([...COUNTIES]);
    setCurrentPage(1);
    clearSelection({ zoomOut: true });
  };

  const clearCounties = () => {
    setSelectedCounties([]);
    setCurrentPage(1);
    clearSelection({ zoomOut: true });
  };

  const toggleResidentService = (svc: Service) => {
    setSelectedResidentServices((prev) =>
      prev.includes(svc) ? prev.filter((x) => x !== svc) : [...prev, svc]
    );
    setCurrentPage(1);
    clearSelection({ zoomOut: true });
  };

  const toggleOrgService = (svc: OrgService) => {
    setSelectedOrgServices((prev) =>
      prev.includes(svc) ? prev.filter((x) => x !== svc) : [...prev, svc]
    );
    setCurrentPage(1);
    clearSelection({ zoomOut: true });
  };

  const selectAllResidentServices = () => {
    setSelectedResidentServices([...SERVICES]);
    setCurrentPage(1);
    clearSelection({ zoomOut: true });
  };

  const clearResidentServices = () => {
    setSelectedResidentServices([]);
    setCurrentPage(1);
    clearSelection({ zoomOut: true });
  };

  const selectAllOrgServices = () => {
    setSelectedOrgServices([...ORG_SERVICES]);
    setCurrentPage(1);
    clearSelection({ zoomOut: true });
  };

  const clearOrgServices = () => {
    setSelectedOrgServices([]);
    setCurrentPage(1);
    clearSelection({ zoomOut: true });
  };

  const onBackToAll = () => {
    setSelectedResourceId(null);
    flyToCalifornia();
  };

  // ------------------ options ------------------
  const audienceOptions: SelectOption<Audience>[] = [
    { value: "Resident", label: "Resident" },
    { value: "Organization", label: "Organization" },
  ];

  const countyOptions = COUNTIES.map((c) => ({ value: c, label: `${c} County` }));
  const residentOptions = SERVICES.map((s) => ({ value: s, label: labelForService(s) }));
  const orgOptions = ORG_SERVICES.map((s) => ({ value: s, label: labelForOrgService(s) }));

  const deliveryOptions: SelectOption<ServiceDeliveryFilter>[] = SERVICE_DELIVERY_OPTIONS.map(
    (v) => ({ value: v, label: v })
  );

  const sortOptions: SelectOption<SortMode>[] = [
    { value: "alphabetical", label: "A-Z" },
    { value: "proximity", label: "Proximity to Me" },
  ];

  // ------------------ summary ------------------
  const renderResultsSummary = () => {
    if (selectedResourceId) {
      const chosen = sortedFiltered.find((r) => r.id === selectedResourceId);
      return (
        <p className="m-0">
          Showing <strong>{chosen?.name ?? "selected resource"}</strong>
        </p>
      );
    }

    return (
      <p className="m-0">
        Showing <strong>{filtered.length}</strong> results
      </p>
    );
  };

  // ------------------ side pane resources ------------------
  const sidePanelResources = useMemo(() => {
    if (!selectedResourceId) return sortedFiltered;
    const chosen = sortedFiltered.find((r) => r.id === selectedResourceId);
    return chosen ? [chosen] : sortedFiltered;
  }, [sortedFiltered, selectedResourceId]);

  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-700">Error: {err}</div>;

  return (
    <div className="container-fluid">
      {/* Header */}
      <header className="m-y-lg md:mx-32 lg:mx-64">
        <h2 className="h2 bg-[#1f2576] text-white py-8 px-4">
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
        </h2>
        <p className="m-t-md px-4">
          Welcome to the California Digital Equity Resource Finder – a tool designed to assist
          residents and organizations to find digital inclusion programs and services in their
          communities. The Resource Finder was updated in January 2026.
        </p>
        <p className="m-t-md px-4">
          Use this tool to find resources like free/low-cost devices, public Wi-Fi, or digital skills
          training.
        </p>
      </header>

      {/* Filters */}
      <section className="m-b-md bg-gray-50 border-b border-t border-gray-300" aria-label="Filters">
        <div className="card md:mx-36 mb-0">
          <div className="card-body px-0 bg-gray-50">
            <div className="row">
              <div className="col-12 col-lg-6">
                <SingleSelect
                  id="audience-select"
                  labelNode={
                    <>
                      <span>I am a/an...</span>
                      <Tooltip text="Choose Resident to see services for individuals. Choose Organization to see services for organizations." />
                    </>
                  }
                  placeholder="Select audience"
                  options={audienceOptions}
                  value={audience}
                  onChange={(v) => onAudienceChange(v)}
                />
              </div>

              <div className="col-12 col-lg-6 m-b-sm">
                <MultiSelect
                  id="county-multiselect"
                  labelNode={
                    <>
                      <span>I am located in... (select all that apply)</span>
                      <Tooltip text="Select one or more counties to filter results. Clear to show resources across California." />
                    </>
                  }
                  placeholder="Any county"
                  options={countyOptions}
                  selected={selectedCounties}
                  onToggle={(val: County) => toggleCounty(val)}
                  onSelectAll={selectAllCounties}
                  onClear={clearCounties}
                />
              </div>
            </div>

            <div className="row m-t-md">
              <div className="col-12 col-lg-6 m-b-sm">
                <label className="form-label d-inline-flex align-items-center" htmlFor="search">
                  <span>I am seeking the following service...</span>
                  <Tooltip text="Search is fuzzy and looks across organization name, services, counties served, and other key fields." />
                </label>

                <div className="pos-rel text-normal">
                  <span className="sr-only" id="SearchInput">
                    Search
                  </span>

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
                      if (e.key === "Enter" && isInput) e.preventDefault();
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
                      aria-labelledby="SearchInput"
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
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSearchChange("");
                            (document.getElementById("search") as HTMLInputElement | null)?.focus();
                          }
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
                      type="button"
                      className="gsc-search-button bg-gray-600"
                      aria-label="Search"
                      onClick={() => {}}
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
                      <span className="sr-only">Search</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="col-12 col-lg-6 m-b-sm">
                <MultiSelect
                  id="services-multiselect"
                  labelNode={
                    <>
                      <span>
                        {audience === "Resident"
                          ? "Services that include (select all that apply)"
                          : "Support that includes (select all that apply)"}
                      </span>
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
                  selected={audience === "Resident" ? selectedResidentServices : selectedOrgServices}
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
            </div>

            <div className="row m-t-md">
              <div className="col-12 col-lg-6 m-b-sm">
                <SingleSelect
                  id="delivery-select"
                  labelNode={
                    <>
                      <span>Service delivery</span>
                      <Tooltip text="Filter results by how the organization provides services (virtually, in-person, or either)." />
                    </>
                  }
                  placeholder="Service delivery"
                  options={deliveryOptions}
                  value={serviceDeliveryFilter}
                  onChange={(v) => {
                    setServiceDeliveryFilter(v);
                    setCurrentPage(1);
                    clearSelection({ zoomOut: true });
                  }}
                />
              </div>

              <div className="col-12 col-lg-6 m-b-sm">
                <div className="d-flex align-items-end h-100">
                  <div className="w-100">
                    <label className="form-label d-inline-flex align-items-center" htmlFor="view-toggle">
                      <span>View</span>
                      <Tooltip text="Switch between map view and tabular (list) view." />
                    </label>

                    <div>
                      <ViewToggle
                        selectedView={viewMode}
                        handleNavigate={(view) => {
                          setViewMode(view);
                          if (view === "map") {
                            resultsTopRef.current?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                          }
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

      {/* Results */}
      <section className="md:mx-36" aria-label="Results">
        <div ref={resultsTopRef} />

        <div className="row g-3 align-items-start align-items-md-end m-b-md">
          <div className="col-12 col-lg-8">{renderResultsSummary()}</div>

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
              <div className="text-danger mt-1" style={{ fontSize: "0.875rem" }}>
                {locationError}
              </div>
            )}
          </div>
        </div>

        {viewMode === "map" ? (
          <div className="row g-3 align-items-start">
            <div className="col-12 col-lg-8">
              <div className="card">
                <div className="card-body p-0">
                  <div
                    ref={mapContainerRef}
                    style={{
                      width: "100%",
                      height: "70vh",
                      minHeight: "420px",
                      borderRadius: "4px",
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="col-12 col-lg-4">
              <div className="card" aria-label="Results list">
                <div className="card-body p-0" style={{ maxHeight: "70vh", overflow: "auto" }}>
                  {selectedResourceId && (
                    <div className="m-b-sm">
                      <button
                        type="button"
                        className="btn btn-outline-primary w-100"
                        onClick={onBackToAll}
                      >
                        Back to all results
                      </button>
                    </div>
                  )}

                  <div className="d-flex flex-column gap-3">
                    {sidePanelResources.map((r) => {
                      const servicesToShow =
                        audience === "Resident" ? r.servicesLabels : r.orgServicesLabels;

                      const servicesLabel =
                        audience === "Resident"
                          ? "Services"
                          : "Supports / services for organizations";

                      const freeLowCostToShow =
                        audience === "Resident" ? r.freeLowCostResidents : r.freeLowCostOrganizations;

                      return (
                        <div key={r.id}>
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
                                onClick={() => {
                                  setSelectedResourceId(r.id);
                                  flyToResourceId(r.id);
                                }}
                              >
                                Zoom to this resource
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="row">
              {pageResources.map((r) => {
                const servicesToShow =
                  audience === "Resident" ? r.servicesLabels : r.orgServicesLabels;

                const servicesLabel =
                  audience === "Resident" ? "Services" : "Supports / services for organizations";

                const freeLowCostToShow =
                  audience === "Resident" ? r.freeLowCostResidents : r.freeLowCostOrganizations;

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
                resultsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}