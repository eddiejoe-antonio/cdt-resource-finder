// src/components/ResourceFinder.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import Fuse from "fuse.js";
import type { Resource } from "../types/resourceTypes";
import { fetchResourcesLocal } from "../utils/fetchResources";
import { ResourceCard } from "./ResourceCard";
import Pagination from "./Pagination";
import ViewToggle from "./ViewToggle";

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
} from "../static/filters";

import {
  PortalMultiSelect,
  PortalSingleSelect,
  type MultiSelectOption,
  type SelectOption,
} from "./PortalSelects";

const ITEMS_PER_PAGE = 12;

type Audience = "Resident" | "Organization";
type ViewMode = "list" | "map";

type IndexedResource = Resource & {
  countiesSet: Set<County>;
  servicesSet: Set<Service>;

  orgServicesRaw: string;
  orgServicesSet: Set<OrgService>;
  hasOrgServices: boolean;
};

function getLonLat(r: Resource): { lon: number; lat: number } | null {
  const lat = r.lat;
  const lon = r.long;

  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lon < -180 || lon > 180) return null;

  return { lat, lon };
}

type ResourceFeatureProps = {
  id: string;
  name: string;
  address: string;
  website: string;
};

type ResourceFeature = {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: ResourceFeatureProps;
};

type ResourceFeatureCollection = {
  type: "FeatureCollection";
  features: ResourceFeature[];
};

// California “nice” extent (rough bbox)
const CA_BOUNDS: mapboxgl.LngLatBoundsLike = [
  [-124.48, 32.53], // SW
  [-114.13, 42.01], // NE
];

const MAP_SOURCE_ID = "resources";
const MAP_LAYER_ID = "resources-circle";

export default function ResourceFinder() {
  const [allResources, setAllResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Filters
  const [audience, setAudience] = useState<Audience>("Resident");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCounties, setSelectedCounties] = useState<County[]>([]);
  const [selectedResidentServices, setSelectedResidentServices] = useState<Service[]>([]);
  const [selectedOrgServices, setSelectedOrgServices] = useState<OrgService[]>([]);

  // Selection (map mode side-panel filtering)
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

  // Pagination (list view only)
  const [currentPage, setCurrentPage] = useState(1);

  // Scroll target for paging
  const resultsTopRef = useRef<HTMLDivElement | null>(null);

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const hoverPopupRef = useRef<mapboxgl.Popup | null>(null);

  // Keep a coordinate lookup so click -> zoom works without re-querying
  const coordByIdRef = useRef<Map<string, [number, number]>>(new Map());

  // ----- Map helper fns (kept ABOVE return; no “functions after return”) -----
  const flyToCalifornia = (opts?: { immediate?: boolean }) => {
    const map = mapRef.current;
    if (!map) return;

    // If style not loaded yet, wait
    if (!map.isStyleLoaded()) {
      map.once("load", () => flyToCalifornia(opts));
      return;
    }

    // Smooth by default
    map.fitBounds(CA_BOUNDS, {
      padding: 40,
      maxZoom: 6.5,
      duration: opts?.immediate ? 0 : 900,
    });
  };

  const flyToResourceId = (id: string) => {
    const map = mapRef.current;
    if (!map) return;

    const coords = coordByIdRef.current.get(id);
    if (!coords) return;

    if (!map.isStyleLoaded()) {
      map.once("load", () => flyToResourceId(id));
      return;
    }

    map.flyTo({
      center: coords,
      zoom: 12,
      duration: 900,
      essential: true,
    });
  };

  const clearSelectionAndZoomOut = () => {
    setSelectedResourceId(null);
    flyToCalifornia();
  };

  // -------------------------------------------------------------------------

  useEffect(() => {
    fetchResourcesLocal()
      .then(setAllResources)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Handlers (clear selection + zoom out on ANY filter change)
  const onAudienceChange = (next: Audience) => {
    setAudience(next);
    setSelectedResidentServices([]);
    setSelectedOrgServices([]);
    setCurrentPage(1);

    setSelectedResourceId(null);
    flyToCalifornia();
  };

  const onSearchChange = (next: string) => {
    setSearchQuery(next);
    setCurrentPage(1);

    setSelectedResourceId(null);
    flyToCalifornia();
  };

  const toggleCounty = (c: County) => {
    setSelectedCounties((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
    setCurrentPage(1);

    setSelectedResourceId(null);
    flyToCalifornia();
  };

  const selectAllCounties = () => {
    setSelectedCounties([...COUNTIES]);
    setCurrentPage(1);

    setSelectedResourceId(null);
    flyToCalifornia();
  };

  const clearCounties = () => {
    setSelectedCounties([]);
    setCurrentPage(1);

    setSelectedResourceId(null);
    flyToCalifornia();
  };

  const toggleResidentService = (svc: Service) => {
    setSelectedResidentServices((prev) =>
      prev.includes(svc) ? prev.filter((x) => x !== svc) : [...prev, svc]
    );
    setCurrentPage(1);

    setSelectedResourceId(null);
    flyToCalifornia();
  };

  const toggleOrgService = (svc: OrgService) => {
    setSelectedOrgServices((prev) =>
      prev.includes(svc) ? prev.filter((x) => x !== svc) : [...prev, svc]
    );
    setCurrentPage(1);

    setSelectedResourceId(null);
    flyToCalifornia();
  };

  const selectAllResidentServices = () => {
    setSelectedResidentServices([...SERVICES]);
    setCurrentPage(1);

    setSelectedResourceId(null);
    flyToCalifornia();
  };

  const clearResidentServices = () => {
    setSelectedResidentServices([]);
    setCurrentPage(1);

    setSelectedResourceId(null);
    flyToCalifornia();
  };

  const selectAllOrgServices = () => {
    setSelectedOrgServices([...ORG_SERVICES]);
    setCurrentPage(1);

    setSelectedResourceId(null);
    flyToCalifornia();
  };

  const clearOrgServices = () => {
    setSelectedOrgServices([]);
    setCurrentPage(1);

    setSelectedResourceId(null);
    flyToCalifornia();
  };

  // Index once for fast filtering
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

      return {
        ...r,
        countiesSet: new Set(counties),
        servicesSet: new Set(services),
        orgServicesRaw: orgRaw,
        orgServicesSet: new Set(orgList),
        hasOrgServices: orgList.length > 0,
      };
    });
  }, [allResources]);

  // Fuse index (fuzzy search)
  const fuse = useMemo(() => {
    return new Fuse(indexedResources, {
      includeScore: true,
      shouldSort: true,

      // Tune: lower = stricter, higher = fuzzier
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
      ],
    });
  }, [indexedResources]);

  // Filtered results: fuzzy search first, then your existing filters
  const filtered = useMemo(() => {
    const q = searchQuery.trim();

    const searched: IndexedResource[] = !q ? indexedResources : fuse.search(q).map((r) => r.item);

    return searched.filter((r) => {
      if (selectedCounties.length > 0) {
        const ok = selectedCounties.some((c) => r.countiesSet.has(c));
        if (!ok) return false;
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

      return true;
    });
  }, [
    indexedResources,
    fuse,
    searchQuery,
    audience,
    selectedCounties,
    selectedResidentServices,
    selectedOrgServices,
  ]);

  // In map mode: if a resource is selected, side panel shows ONLY that one
  const sidePanelResources = useMemo(() => {
    if (!selectedResourceId) return filtered;
    const chosen = filtered.find((r) => r.id === selectedResourceId);
    return chosen ? [chosen] : filtered;
  }, [filtered, selectedResourceId]);

  // List mode pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const pageResources = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safePage]);

  const onPageChange = (page: number) => {
    const clamped = Math.max(1, Math.min(totalPages, page));
    setCurrentPage(clamped);
    resultsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const activeServices =
    audience === "Resident"
      ? (selectedResidentServices as readonly string[])
      : (selectedOrgServices as readonly string[]);

  const activeServiceLabels = useMemo(() => {
    return activeServices.map((s) =>
      audience === "Resident" ? labelForService(s as Service) : labelForOrgService(s as OrgService)
    );
  }, [activeServices, audience]);

  const renderResultsSummary = () => {
    const parts: JSX.Element[] = [];

    parts.push(
      <span key="count">
        Showing <strong>{filtered.length}</strong> results
      </span>
    );

    if (selectedCounties.length === 1) {
      parts.push(
        <span key="county">
          {" "}
          for <strong>{selectedCounties[0]} County</strong>
        </span>
      );
    } else if (selectedCounties.length > 1) {
      parts.push(
        <span key="county">
          {" "}
          for <strong>{selectedCounties.length} counties</strong>
        </span>
      );
    }

    if (activeServiceLabels.length > 0) {
      const serviceText =
        activeServiceLabels.length === 1
          ? activeServiceLabels[0]
          : `${activeServiceLabels.slice(0, -1).join(", ")} or ${
              activeServiceLabels[activeServiceLabels.length - 1]
            }`;

      parts.push(
        <span key="services">
          {" "}
          that help you find <strong>{serviceText}</strong>
        </span>
      );
    }

    return <p className="m-0">{parts}</p>;
  };

  // -------- Map data (uses ALL filtered results, not selected subset) --------
  const mapPoints = useMemo<ResourceFeature[]>(() => {
    const feats: ResourceFeature[] = [];
    const coordLookup = new Map<string, [number, number]>();

    for (const r of filtered) {
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
    return feats;
  }, [filtered]);

  const mapGeoJson = useMemo<ResourceFeatureCollection>(() => {
    return { type: "FeatureCollection", features: mapPoints };
  }, [mapPoints]);

  // -------- Map init (one-time, when switching to map) --------
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
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-119.4179, 36.7783],
      zoom: 5,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      // Initialize to California once
      flyToCalifornia({ immediate: true });

      if (!map.getSource(MAP_SOURCE_ID)) {
        map.addSource(MAP_SOURCE_ID, {
          type: "geojson",
          data: mapGeoJson,
        });

        map.addLayer({
          id: MAP_LAYER_ID,
          type: "circle",
          source: MAP_SOURCE_ID,
          paint: {
            "circle-radius": 6,
            "circle-opacity": 0.85,
            "circle-color": "#f08024",
            "circle-stroke-width": 0.25,
            "circle-stroke-color": "#fff",
          },
        });
      }

      // Hover tooltip (Popup used as tooltip)
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

      const hideHover = () => {
        hoverPopupRef.current?.remove();
      };

      map.on("mouseenter", MAP_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", MAP_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
        hideHover();
      });

      map.on("mousemove", MAP_LAYER_ID, showHover);

      // Click: select resource, zoom to it, and filter cards in side panel
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // -------- Map updates when filters change (NO re-init, NO fitBounds) --------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const src = map.getSource(MAP_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(mapGeoJson);
  }, [mapGeoJson]);

  // Zoom behavior:
  // - If selected -> zoom to resource
  // - If cleared -> zoom back to CA
  useEffect(() => {
    if (viewMode !== "map") return;

    if (selectedResourceId) {
      flyToResourceId(selectedResourceId);
    } else {
      flyToCalifornia();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResourceId, viewMode]);

  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-700">Error: {err}</div>;

  // Options
  const audienceOptions: SelectOption<Audience>[] = [
    { value: "Resident", label: "Resident" },
    { value: "Organization", label: "Organization" },
  ];

  const countyOptions: MultiSelectOption<County>[] = COUNTIES.map((c) => ({
    value: c,
    label: `${c} County`,
  }));

  const residentOptions: MultiSelectOption<Service>[] = SERVICES.map((s) => ({
    value: s,
    label: labelForService(s),
  }));

  const orgOptions: MultiSelectOption<OrgService>[] = ORG_SERVICES.map((s) => ({
    value: s,
    label: labelForOrgService(s),
  }));

  return (
    <div className="container-fluid">
      {/* Header */}
      <header className="m-y-lg md:mx-32 lg:mx-64">
        <h2
          className="
            h2 bg-[#1f2576] text-white py-8 px-4
            relative
            after:content-['']
            after:absolute
            after:left-4
            after:bottom-0
            after:h-1
            after:w-1/2
            after:bg-orange-500
          "
        >
          Digital Equity Resource Finder
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
      <section className="m-b-lg bg-gray-50 border-b border-t border-gray-300" aria-label="Filters">
        <form onSubmit={(e) => e.preventDefault()} className="card md:mx-36">
          <div className="card-body px-0 bg-gray-50">
            <div className="row">
              <div className="col-12 col-lg-6">
                <PortalSingleSelect
                  id="audience-select"
                  label="I am a/an..."
                  placeholder="Select audience"
                  options={audienceOptions}
                  value={audience}
                  onChange={(v) => onAudienceChange(v)}
                />
              </div>

              <div className="col-12 col-lg-6 m-b-sm">
                <PortalMultiSelect
                  id="county-multiselect"
                  label="I am located in... (select all that apply)"
                  placeholder="Any county"
                  options={countyOptions}
                  selected={selectedCounties}
                  onToggle={(val) => toggleCounty(val as County)}
                  onSelectAll={selectAllCounties}
                  onClear={clearCounties}
                  closeOnClear={true}
                />
              </div>
            </div>

            {/* Row 2 */}
            <div className="row m-t-md">
              <div className="col-12 col-lg-6 m-b-sm">
                <label className="form-label" htmlFor="search">
                  I am seeking the following service...
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
                      onClick={() => {
                        // no-op
                      }}
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
                <PortalMultiSelect
                  id="services-multiselect"
                  label={
                    audience === "Resident"
                      ? "Services that include (select all that apply)"
                      : "Support that includes (select all that apply)"
                  }
                  placeholder="All services"
                  options={audience === "Resident" ? residentOptions : orgOptions}
                  selected={audience === "Resident" ? selectedResidentServices : selectedOrgServices}
                  onToggle={(val) => {
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
                  closeOnClear={true}
                />
              </div>
            </div>
          </div>
        </form>
      </section>

      {/* Results */}
      <section className="md:mx-36" aria-label="Results">
        <div ref={resultsTopRef} />

<div className="row g-3 align-items-start align-items-md-center m-b-md">
  {/* Results summary: 2/3 on desktop, full on mobile */}
  <div className="col-12 col-md-8">{renderResultsSummary()}</div>

  {/* Toggle: full-width on mobile, constrained to 3rd column on md+ */}
  <div className="col-12 col-md-4">
    {/* wrapper keeps it full width / right aligned if you want */}
    <div className="d-flex w-100 justify-content-md-end">
      <ViewToggle
        selectedView={viewMode}
        handleNavigate={(view) => {
          setViewMode(view);
          if (view === "map") {
            resultsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }}
      />
    </div>
  </div>
</div>


        {viewMode === "map" ? (
          <div className="row g-3 align-items-start">
            {/* Map: full width on mobile, 8/12 on lg */}
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

            {/* Side panel: full width on mobile, 4/12 on lg */}
            <div className="col-12 col-lg-4">
              <div className="card" aria-label="Results list">
                <div className="card-body" style={{ maxHeight: "70vh", overflow: "auto" }}>
                  {selectedResourceId && (
                    <div className="m-b-md">
                      <button
                        type="button"
                        className="btn btn-primary-outline w-100"
                        onClick={clearSelectionAndZoomOut}
                      >
                        Back to all results
                      </button>
                    </div>
                  )}

                  <div className="d-flex flex-column gap-3">
                    {sidePanelResources.map((r) => {
                      const servicesToShow =
                        audience === "Resident"
                          ? Array.from(r.servicesSet).map((s) => labelForService(s))
                          : Array.from(r.orgServicesSet).map((s) => labelForOrgService(s));

                      const servicesLabel =
                        audience === "Resident" ? "Services" : "Supports / services for organizations";

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

                          {/* Optional: allow clicking card to zoom to it */}
                          {selectedResourceId === null && (
                            <div className="m-t-sm">
                              <button
                                type="button"
                                className="btn btn-primary-outline w-100"
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
            {/* List view: responsive card grid (1 mobile, 2 md, 3 lg) */}
            <div className="row">
              {pageResources.map((r) => {
                const servicesToShow =
                  audience === "Resident"
                    ? Array.from(r.servicesSet).map((s) => labelForService(s))
                    : Array.from(r.orgServicesSet).map((s) => labelForOrgService(s));

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

            <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={onPageChange} />
          </>
        )}
      </section>
    </div>
  );
}
