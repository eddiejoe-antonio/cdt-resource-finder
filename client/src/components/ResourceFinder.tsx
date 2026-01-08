// src/components/ResourceFinder.tsx
import React, { useEffect, useMemo, useState } from "react";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

import type { Resource } from "../types/resourceTypes";
import { fetchResourcesLocal } from "../utils/fetchResources"; // your CSV fetcher
import { ResourceCard } from "./ResourceCard";
import Pagination from "./Pagination";

import {
  COUNTIES,
  CSV_FIELDS,
  SERVICES,
  type County,
  type Service,
  splitCommaList,
} from "../static/filters";

const ITEMS_PER_PAGE = 9; // 3 cols × 3 rows

type IndexedResource = Resource & {
  countiesSet: Set<County>;
  servicesSet: Set<Service>;
};

function normalize(s: string) {
  return s.trim().toLowerCase();
}

export default function ResourceFinder() {
  const [allResources, setAllResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCounty, setSelectedCounty] = useState<County | "">("");
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Load CSV once
  useEffect(() => {
    fetchResourcesLocal()
      .then((data) => setAllResources(data))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCounty, selectedServices]);

  /**
   * Index counties/services once (fast filtering later)
   * NOTE: this expects your Resource objects to include:
   *  - countiesServedRaw?: string  (from CSV_FIELDS.counties)
   *  - servicesIndividualsRaw?: string (from CSV_FIELDS.services)
   */
  const indexedResources = useMemo<IndexedResource[]>(() => {
    const countyAllowed = new Set<string>(COUNTIES as unknown as string[]);
    const serviceAllowed = new Set<string>(SERVICES as unknown as string[]);

    return allResources.map((r) => {
      const counties = splitCommaList((r as any).countiesServedRaw)
        .map((x) => x.trim())
        .filter((x) => countyAllowed.has(x)) as County[];

      const services = splitCommaList((r as any).servicesIndividualsRaw)
        .map((x) => x.trim())
        .filter((x) => serviceAllowed.has(x)) as Service[];

      return {
        ...r,
        countiesSet: new Set(counties),
        servicesSet: new Set(services),
      };
    });
  }, [allResources]);

  const filtered = useMemo(() => {
    const q = normalize(searchQuery);

    return indexedResources.filter((r) => {
      // Search (simple contains across a few fields)
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
          (r as any).countiesServedRaw,
          (r as any).servicesIndividualsRaw,
        ]
          .filter(Boolean)
          .some((v) => normalize(String(v)).includes(q));

      if (!matchesSearch) return false;

      // County filter
      if (selectedCounty && !r.countiesSet.has(selectedCounty)) return false;

      // Services filter (OR logic across selected services)
      if (
        selectedServices.length > 0 &&
        !selectedServices.some((s) => r.servicesSet.has(s))
      ) {
        return false;
      }

      return true;
    });
  }, [indexedResources, searchQuery, selectedCounty, selectedServices]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));

  const pageResources = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const toggleService = (svc: Service) => {
    setSelectedServices((prev) =>
      prev.includes(svc) ? prev.filter((x) => x !== svc) : [...prev, svc]
    );
  };

  const clearSearch = () => setSearchQuery("");

  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedCounty("");
    setSelectedServices([]);
  };

  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-700">Error: {err}</div>;

  return (
    <div className="w-full py-6">
      {/* Filters */}
      <div className="flex flex-col gap-4 border-t border-[#3B75A9] pt-6">
        {/* Search */}
        <div className="w-full">
          <p className="my-2 font-semibold text-lg">Search</p>
          <div className="relative">
            <span className="absolute inset-y-0 left-2 flex items-center">
              <MagnifyingGlassIcon className="h-6 w-6 text-black" />
            </span>
            <input
              type="text"
              placeholder="Search for resources"
              className="w-full bg-white border border-[#3B75A9] rounded-full pl-10 pr-10 py-2 text-left text-black"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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

        {/* County dropdown */}
        <div className="w-full">
          <p className="my-2 font-semibold text-lg">County</p>
          <select
            className="w-full bg-white border border-[#3B75A9] rounded-full px-4 py-2 text-black"
            value={selectedCounty}
            onChange={(e) => setSelectedCounty((e.target.value as County) || "")}
          >
            <option value="">All counties</option>
            {COUNTIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-gray-600">
            (Source field: <span className="font-mono">{CSV_FIELDS.counties}</span>)
          </p>
        </div>

        {/* Services checkbox-buttons */}
        <div className="border-b border-[#3B75A9] pt-2 pb-6">
          <div className="flex items-center justify-between gap-4">
            <p className="my-2 font-semibold text-lg">Services</p>
            <button
              className="text-sm underline text-[#1E79C8] hover:text-[#0E3052]"
              onClick={clearAllFilters}
            >
              Clear all
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {SERVICES.map((svc) => {
              const selected = selectedServices.includes(svc);
              return (
                <button
                  key={svc}
                  aria-pressed={selected}
                  onClick={() => toggleService(svc)}
                  className={[
                    "px-5 py-2 rounded-full transition-colors border text-sm font-semibold",
                    selected
                      ? "bg-[#1E79C8] text-white border-white"
                      : "bg-[#EEF7FF] text-[#092940] border-[#3B75A9] hover:bg-[#3892E1] hover:text-white",
                  ].join(" ")}
                >
                  {svc}
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-xs text-gray-600">
            (Source field: <span className="font-mono">{CSV_FIELDS.services}</span>)
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-lg text-[#0E3052]">
          Showing <span className="font-semibold">{filtered.length}</span> results
        </p>
        <p className="text-sm text-gray-600">
          Page {currentPage} / {totalPages}
        </p>
      </div>

      {/* 3-col grid (3 rows max due to pagination) */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {pageResources.map((r) => (
          <ResourceCard key={r.id} resource={r} />
        ))}
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(p) => setCurrentPage(p)}
      />
    </div>
  );
}
