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
    const countyMap = new Map<string, County>(
      COUNTIES.map((c) => [normalizeValue(c), c])
    );
    const serviceMap = new Map<string, Service>(
      SERVICES.map((s) => [normalizeValue(s), s])
    );
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

  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-700">Error: {err}</div>;

  return (
    <div className="w-full">
      {/* Header Section */}
      <section className="w-full">
          <div className="mx-auto max-w-7xl px-24 sm:px-8 lg:px-24 py-6">
            <h1 className="
              relative
              text-white font-semibold text-4xl
              bg-[#1f2576]
              p-10
              after:content-['']
              after:block
              after:h-1
              after:w-1/2
              after:bg-orange-500
              after:mt-4
            ">
              Digital Equity Resource Finder
            </h1>
            <p className="py-8 px-10">The California Department of Technology has expanded its statewide inventory of digital equity related
            entities, programs, and services regionally and locally. This database was compiled utilizing the Digital
            Equity Ecosystem Mapping Tool survey and stakeholder participants during the development of the
            State Digital Equity Plan.</p>
          </div>
      </section>
      {/* Full-bleed filter section */}
      <section className="w-full bg-gray-100 border-t border-b border-gray-400">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-4">
            <p>
              Lorem ipsum, dolor sit amet consectetur adipisicing elit. Autem dolor
              error molestiae suscipit sint corrupti eos eligendi aperiam sequi
              repellat?
            </p>

            {/* Top row: Audience + Search + County */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Audience */}
              <div className="w-full">
                <p className="my-2 font-semibold text-lg">I am a…</p>
                <select
                  className="w-full bg-white border border-[#3B75A9] rounded-sm px-4 py-2 text-black"
                  value={audience}
                  onChange={(e) => onAudienceChange(e.target.value as Audience)}
                >
                  <option value="Resident">Resident</option>
                  <option value="Organization">Organization</option>
                </select>
              </div>

              {/* Search */}
              <div className="w-full">
                <p className="my-2 font-semibold text-lg">What are you looking for?</p>
                <div className="relative">
                  <span className="absolute inset-y-0 left-2 flex items-center">
                    <MagnifyingGlassIcon className="h-6 w-6 text-black" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search for resources"
                    className="w-full bg-white border border-[#3B75A9] rounded-sm pl-10 pr-10 py-2 text-left text-black"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      className="absolute inset-y-0 right-2 flex items-center"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      <XMarkIcon className="h-6 w-6 text-gray-400 hover:text-gray-600" />
                    </button>
                  )}
                </div>
              </div>

              {/* County */}
              <div className="w-full">
                <p className="my-2 font-semibold text-lg">Where are you looking?</p>
                <select
                  className="w-full bg-white border border-[#3B75A9] rounded-sm px-4 py-2 text-black"
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

            {/* Services checkboxes */}
            <div className="pt-2 pb-6">
              <div className="flex items-center justify-between gap-4">
                <p className="my-2 font-semibold text-lg">
                  {audience === "Resident"
                    ? "Type of service (you can select multiple services)"
                    : "Type of support for organizations (you can select multiple)"}
                </p>
                <button
                  className="text-sm underline text-[#1E79C8] hover:text-[#0E3052]"
                  onClick={clearAllFilters}
                >
                  Clear all
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {audience === "Resident"
                  ? SERVICES.map((svc) => {
                      const checked = selectedResidentServices.includes(svc);
                      return (
                        <label key={svc} className="flex items-start gap-3 px-3 py-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleResidentService(svc)}
                            className="h-6 w-6 accent-gray-700"
                          />
                          <span className="text-md leading-snug">{svc}</span>
                        </label>
                      );
                    })
                  : ORG_SERVICES.map((svc) => {
                      const checked = selectedOrgServices.includes(svc);
                      return (
                        <label key={svc} className="flex items-start gap-3 px-3 py-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOrgService(svc)}
                            className="h-6 w-6 accent-gray-700"
                          />
                          <span className="text-md leading-snug">{svc}</span>
                        </label>
                      );
                    })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="w-full">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <p className="text-lg text-[#0E3052]">
              Showing <span className="font-semibold">{filtered.length}</span> results
            </p>
            <p className="text-sm text-gray-600">
              Page {currentPage} / {totalPages}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
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
                <div key={r.id} className="h-full">
                  <div className="h-full rounded-sm">
                    <div className="h-full bg-gray-50 p-6">
                      <ResourceCard
                        resource={r}
                        servicesToShow={servicesToShow}
                        servicesLabel={servicesLabel}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={(p) => setCurrentPage(p)}
          />
        </div>
      </section>
    </div>
  );
}
