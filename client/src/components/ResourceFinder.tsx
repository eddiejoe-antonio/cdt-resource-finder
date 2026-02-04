// src/components/ResourceFinder.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { type LngLatBoundsLike } from "mapbox-gl";
import type { Resource } from "../types/resourceTypes";
import { fetchResourcesLocal } from "../utils/fetchResources";
import { ResourceCard } from "./ResourceCard";
import Pagination from "./Pagination";

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

type PointFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] }; // [lon, lat]
  properties: {
    id: string;
    name: string;
    address: string;
    website: string;
  };
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: PointFeature[];
};

function normalizeSearch(s: string) {
  return s.trim().toLowerCase();
}

/**
 * Canonical coordinates ONLY:
 * expects r.lat and r.long to exist in the loaded CSV.
 */
function getLonLat(r: Resource): { lon: number; lat: number } | null {
  const lat = r.lat;
  const lon = r.long;

  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (lat < -90 || lat > 90) return null;
  if (lon < -180 || lon > 180) return null;

  return { lat, lon };
}


function safeString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Scroll target
  const resultsTopRef = useRef<HTMLDivElement | null>(null);

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const mapLoadedRef = useRef(false);

  // IMPORTANT: compute token once (no setState from effects)
  const mapboxToken = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ?? "";

  useEffect(() => {
    fetchResourcesLocal()
      .then(setAllResources)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Handlers
  const onAudienceChange = (next: Audience) => {
    setAudience(next);
    setSelectedResidentServices([]);
    setSelectedOrgServices([]);
    setCurrentPage(1);
  };

  const onSearchChange = (next: string) => {
    setSearchQuery(next);
    setCurrentPage(1);
  };

  const toggleCounty = (c: County) => {
    setSelectedCounties((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
    setCurrentPage(1);
  };

  const selectAllCounties = () => {
    setSelectedCounties([...COUNTIES]);
    setCurrentPage(1);
  };

  const clearCounties = () => {
    setSelectedCounties([]);
    setCurrentPage(1);
  };

  const toggleResidentService = (svc: Service) => {
    setSelectedResidentServices((prev) =>
      prev.includes(svc) ? prev.filter((x) => x !== svc) : [...prev, svc]
    );
    setCurrentPage(1);
  };

  const toggleOrgService = (svc: OrgService) => {
    setSelectedOrgServices((prev) =>
      prev.includes(svc) ? prev.filter((x) => x !== svc) : [...prev, svc]
    );
    setCurrentPage(1);
  };

  const selectAllResidentServices = () => {
    setSelectedResidentServices([...SERVICES]);
    setCurrentPage(1);
  };

  const clearResidentServices = () => {
    setSelectedResidentServices([]);
    setCurrentPage(1);
  };

  const selectAllOrgServices = () => {
    setSelectedOrgServices([...ORG_SERVICES]);
    setCurrentPage(1);
  };

  const clearOrgServices = () => {
    setSelectedOrgServices([]);
    setCurrentPage(1);
  };

  const clearAllFilters = () => {
    setAudience("Resident");
    setSearchQuery("");
    setSelectedCounties([]);
    setSelectedResidentServices([]);
    setSelectedOrgServices([]);
    setCurrentPage(1);
    resultsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Index once
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

  const filtered = useMemo(() => {
    const q = normalizeSearch(searchQuery);

    return indexedResources.filter((r) => {
      const matchesSearch =
        !q ||
        [
          r.name,
          r.orgType,
          r.addressLine1,
          r.city,
          r.state,
          r.zip,
          r.website,
          r.contactName,
          r.contactEmail,
          r.serviceArea,
          r.countiesServedRaw,
          r.servicesIndividualsRaw,
          r.orgServicesRaw,
        ]
          .filter((v): v is string => Boolean(v))
          .some((v) => normalizeSearch(v).includes(q));

      if (!matchesSearch) return false;

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
    audience,
    searchQuery,
    selectedCounties,
    selectedResidentServices,
    selectedOrgServices,
  ]);

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

  // Map features (ALL filtered, not paginated)
  const mapPoints = useMemo<PointFeature[]>(() => {
    const out: PointFeature[] = [];
    for (const r of filtered) {
      const ll = getLonLat(r);
      if (!ll) continue;

      out.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [ll.lon, ll.lat] },
        properties: {
          id: r.id,
          name: r.name ?? "",
          address: [r.addressLine1, r.city, r.state, r.zip].filter(Boolean).join(", "),
          website: r.website ?? "",
        },
      });
    }
    return out;
  }, [filtered]);

  const mapGeoJson = useMemo<FeatureCollection>(() => {
    return { type: "FeatureCollection", features: mapPoints };
  }, [mapPoints]);

  // Map init (only when viewMode === "map" AND token exists)
  useEffect(() => {
    if (viewMode !== "map") return;
    if (!mapboxToken) return; // no setState here
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-119.4179, 36.7783],
      zoom: 5,
    });

    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      mapLoadedRef.current = true;

      map.addSource("resources", {
        type: "geojson",
        data: mapGeoJson,
      });

      map.addLayer({
        id: "resources-circle",
        type: "circle",
        source: "resources",
        paint: {
          "circle-radius": 6,
          "circle-opacity": 0.85,
          "circle-stroke-width": 1,
          // IMPORTANT: set fill so points are visible on all basemaps
          "circle-color": "#1f2576",
          "circle-stroke-color": "#ffffff",
        },
      });

      map.on("click", "resources-circle", (e) => {
        const feature = (e.features?.[0] as mapboxgl.MapboxGeoJSONFeature | undefined) ?? undefined;
        if (!feature) return;

        const geom = feature.geometry as GeoJSON.Point;
        const coords = geom.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return;

        const props = (feature.properties ?? {}) as Record<string, unknown>;

        const name = escapeHtml(safeString(props.name));
        const address = escapeHtml(safeString(props.address));
        const website = safeString(props.website);

        popupRef.current?.remove();

        const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
          .setLngLat(coords as [number, number])
          .setHTML(
            `
            <div style="max-width: 280px;">
              <div style="font-weight: 700; margin-bottom: 4px;">${name}</div>
              ${address ? `<div style="margin-bottom: 6px;">${address}</div>` : ""}
              ${
                website
                  ? `<div><a href="${escapeHtml(
                      website
                    )}" target="_blank" rel="noreferrer">Website</a></div>`
                  : ""
              }
            </div>
          `
          )
          .addTo(map);

        popupRef.current = popup;
      });

      map.on("mouseenter", "resources-circle", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "resources-circle", () => {
        map.getCanvas().style.cursor = "";
      });

      // Initial fit
      if (mapPoints.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        for (const f of mapPoints) bounds.extend(f.geometry.coordinates);
        map.fitBounds(bounds as unknown as LngLatBoundsLike, { padding: 50, maxZoom: 12 });
      }
    });

    return () => {
      mapLoadedRef.current = false;
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, mapboxToken]);

  // Map updates when filters change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!mapLoadedRef.current) return;

    const src = map.getSource("resources") as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(mapGeoJson);

    if (mapPoints.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      for (const f of mapPoints) bounds.extend(f.geometry.coordinates);
      map.fitBounds(bounds as unknown as LngLatBoundsLike, { padding: 50, maxZoom: 12 });
    }
  }, [mapGeoJson, mapPoints]);

  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-700">Error: {err}</div>;

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

  const showMissingTokenError = viewMode === "map" && !mapboxToken;

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
                    style={{ alignItems: "stretch", flexWrap: "nowrap", minWidth: 0, position: "relative" }}
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
                      <span className="ca-gov-icon-search" aria-hidden="true" style={{ color: "#ffffff" }} />
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

        <div className="d-flex align-items-start justify-content-between m-b-md gap-3">
          <div className="flex-grow-1">{renderResultsSummary()}</div>

          <div className="d-flex gap-2 flex-shrink-0">
            <div className="btn-group" role="group" aria-label="View toggle">
              <button
                type="button"
                className={`btn ${viewMode === "list" ? "btn-primary" : "btn-primary-outline"}`}
                onClick={() => setViewMode("list")}
              >
                List
              </button>
              <button
                type="button"
                className={`btn ${viewMode === "map" ? "btn-primary" : "btn-primary-outline"}`}
                onClick={() => {
                  setViewMode("map");
                  resultsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Map
              </button>
            </div>

            <button
              type="button"
              className="btn btn-primary-outline text-nowrap"
              onClick={clearAllFilters}
            >
              Clear all
            </button>
          </div>
        </div>

        {viewMode === "map" ? (
          <div className="card m-b-md">
            <div className="card-body p-0">
              {showMissingTokenError ? (
                <div className="p-4 text-red-700">
                  Missing <code>VITE_MAPBOX_TOKEN</code>. Add it to your <code>.env</code> and restart the dev server.
                </div>
              ) : (
                <div
                  ref={mapContainerRef}
                  style={{
                    width: "100%",
                    height: "70vh",
                    minHeight: "520px",
                    borderRadius: "4px",
                  }}
                />
              )}

              <div className="p-3 text-muted" style={{ fontSize: "0.9rem" }}>
                Mapped results: <strong>{mapPoints.length}</strong> (requires <code>lat</code> and{" "}
                <code>long</code> on each row).
              </div>
            </div>
          </div>
        ) : (
          <>
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
                  <div key={r.id} className="col-md-6 col-lg-4 m-b-md">
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
