// src/components/ResourceFinder.tsx
import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

import type { Resource } from "../types/resourceTypes";
import { fetchResourcesLocal } from "../utils/fetchResources";
import { ResourceCard } from "./ResourceCard";
import Pagination from "./Pagination";

import {
  COUNTIES,
  SERVICES,
  type County,
  type Service,
  splitCommaList,
  normalizeValue,
} from "../static/filters";

const ITEMS_PER_PAGE = 9;

type Audience = "Resident" | "Organization";

const ORG_SERVICES = [
  "Digital equity grant writing",
  "Organizational training",
  "Train-the-trainer",
  "Mutual aid (financial)",
  "Partnership opportunities",
  "Collective action",
  "Information sharing",
  "Other",
] as const;

type OrgService = (typeof ORG_SERVICES)[number];

type IndexedResource = Resource & {
  countiesSet: Set<County>;
  servicesSet: Set<Service>;

  orgServicesRaw: string;
  orgServicesSet: Set<OrgService>;
  hasOrgServices: boolean;
};

function normalizeSearch(s: string) {
  return s.trim().toLowerCase();
}

export default function ResourceFinder() {
  const [allResources, setAllResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  // Filters
  const [audience, setAudience] = useState<Audience>("Resident");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCounty, setSelectedCounty] = useState<County | "">("");
  const [selectedResidentServices, setSelectedResidentServices] = useState<Service[]>([]);
  const [selectedOrgServices, setSelectedOrgServices] = useState<OrgService[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Load CSV once
  useEffect(() => {
    fetchResourcesLocal()
      .then(setAllResources)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  // ---- Filter handlers (reset page here, not in an effect) ----
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

  const clearSearch = () => {
    setSearchQuery("");
    setCurrentPage(1);
  };

  const onCountyChange = (next: County | "") => {
    setSelectedCounty(next);
    setCurrentPage(1);
  };

  const toggleResidentService = (svc: Service) => {
    setSelectedResidentServices((prev) => {
      const next = prev.includes(svc) ? prev.filter((x) => x !== svc) : [...prev, svc];
      return next;
    });
    setCurrentPage(1);
  };

  const toggleOrgService = (svc: OrgService) => {
    setSelectedOrgServices((prev) => {
      const next = prev.includes(svc) ? prev.filter((x) => x !== svc) : [...prev, svc];
      return next;
    });
    setCurrentPage(1);
  };

  const clearAllFilters = () => {
    setAudience("Resident");
    setSearchQuery("");
    setSelectedCounty("");
    setSelectedResidentServices([]);
    setSelectedOrgServices([]);
    setCurrentPage(1);
  };

  // ---- Index once for fast filtering ----
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

      if (selectedCounty && !r.countiesSet.has(selectedCounty)) return false;

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
    selectedCounty,
    selectedResidentServices,
    selectedOrgServices,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));

  const pageResources = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  // ----- Results summary with bolded active filters -----
  const activeServices =
    audience === "Resident" ? (selectedResidentServices as readonly string[]) : (selectedOrgServices as readonly string[]);

  const renderResultsSummary = () => {
    const parts: JSX.Element[] = [];

    parts.push(
      <span key="count">
        Showing <strong>{filtered.length}</strong> results
      </span>
    );

    if (selectedCounty) {
      parts.push(
        <span key="county">
          {" "}for <strong>{selectedCounty} County</strong>
        </span>
      );
    }

    if (activeServices.length > 0) {
      const serviceText =
        activeServices.length === 1
          ? activeServices[0]
          : `${activeServices.slice(0, -1).join(", ")} or ${activeServices[activeServices.length - 1]}`;

      parts.push(
        <span key="services">
          {" "}that help you <strong>{serviceText}</strong>
        </span>
      );
    }

    return <p className="m-0">{parts}</p>;
  };

  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-700">Error: {err}</div>;

  return (
    <div className="container">
      {/* Header */}
      <header className="m-y-lg">
        <h1 className="h1">Digital Equity Resource Finder</h1>
        <p className="m-t-md">
          The California Department of Technology has expanded its statewide inventory of digital equity related
          entities, programs, and services regionally and locally. This database was compiled utilizing the Digital
          Equity Ecosystem Mapping Tool survey and stakeholder participants during the development of the
          State Digital Equity Plan.
        </p>
      </header>

      {/* Filters */}
      <section className="m-b-lg" aria-label="Filters">
        <form onSubmit={(e) => e.preventDefault()} className="card">
          <div className="card-body bg-gray-50 border-b border-t border-gray-300">
            <div className="row">
              {/* Audience */}
              <div className="col-md-4 m-b-sm">
                <label className="form-label" htmlFor="audience">
                  I am a…
                </label>
                <select
                  id="audience"
                  className="form-select"
                  value={audience}
                  onChange={(e) => onAudienceChange(e.target.value as Audience)}
                >
                  <option value="Resident">Resident</option>
                  <option value="Organization">Organization</option>
                </select>
              </div>

              {/* Search */}
              <div className="col-md-4 m-b-sm">
                <label className="form-label" htmlFor="search">
                  What are you looking for?
                </label>
                <div className="input-group">
                  <span className="input-group-text" aria-hidden="true">
                    <MagnifyingGlassIcon className="h-2 w-2" />
                  </span>
                  <input
                    id="search"
                    type="search"
                    className="form-control"
                    placeholder="Search for resources"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="btn btn-primary-outline"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      <XMarkIcon className="h-2 w-2" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              {/* County */}
              <div className="col-md-4 m-b-sm">
                <label className="form-label" htmlFor="county">
                  Where are you looking?
                </label>
                <select
                  id="county"
                  className="form-select"
                  value={selectedCounty}
                  onChange={(e) => onCountyChange((e.target.value as County) || "")}
                >
                  <option value="">Any county</option>
                  {COUNTIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Services */}
            <fieldset className="m-t-md">
              <label className="">
                {audience === "Resident"
                  ? "Type of service (select all that apply)"
                  : "Type of support for organizations (select all that apply)"}
              </label>

              <div className="d-flex justify-content-end">
                <button type="button" className="btn btn-primary-outline" onClick={clearAllFilters}>
                  Clear all
                </button>
              </div>

              <div className="row m-t-sm">
                {(audience === "Resident" ? SERVICES : ORG_SERVICES).map((svc) => {
                  const checked =
                    audience === "Resident"
                      ? selectedResidentServices.includes(svc as Service)
                      : selectedOrgServices.includes(svc as OrgService);

                  const id = `svc-${normalizeValue(String(svc))}`;

                  return (
                  <div key={String(svc)} className="col-sm-6 col-lg-3 m-b-md">
                    <label
                      htmlFor={id}
                      className="
                        !grid ![grid-template-columns:1.25rem_1fr]
                        items-start
                        gap-x-4
                        cursor-pointer select-none
                        py-3
                      "
                    >
                      <input
                        id={id}
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          if (audience === "Resident") toggleResidentService(svc as Service);
                          else toggleOrgService(svc as OrgService);
                        }}
                        className="
                          h-5 w-5 mt-0.5
                          border border-gray-300
                          accent-gray-700
                        "
                      />

                      <span className="block min-w-0 text-base leading-snug">
                        {String(svc)}
                      </span>
                    </label>
                  </div>
                  );
                })}
              </div>
            </fieldset>
          </div>
        </form>
      </section>

      {/* Results */}
      <section aria-label="Results">
        <div className="d-flex justify-content-between align-items-center m-b-md">
          {renderResultsSummary()}
          {/* removed the top "Page X / Y" line */}
        </div>

        <div className="row">
          {pageResources.map((r) => {
            const servicesToShow =
              audience === "Resident"
                ? Array.from(r.servicesSet)
                : Array.from(r.orgServicesSet);

            const servicesLabel =
              audience === "Resident"
                ? "Services"
                : "Supports / services for organizations";

            return (
              <div key={r.id} className="col-md-4 m-b-md">
                <ResourceCard
                  resource={r}
                  servicesToShow={servicesToShow}
                  servicesLabel={servicesLabel}
                />
              </div>
            );
          })}
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </section>
    </div>
  );
}
