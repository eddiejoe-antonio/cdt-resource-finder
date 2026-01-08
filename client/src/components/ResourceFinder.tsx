// src/components/ResourceFinder.tsx
import React, { useEffect, useMemo, useState } from "react";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

import type { Resource } from "../types/resourceTypes";
import { fetchResourcesLocal } from "../utils/fetchResources";
import { ResourceCard } from "./ResourceCard";
import Pagination from "./Pagination";

import {
  COUNTIES,
  CSV_FIELDS,
  SERVICES,
  type County,
  type Service,
  splitCommaList,
  normalizeValue,
} from "../static/filters";

const ITEMS_PER_PAGE = 9; // 3 cols × 3 rows

type IndexedResource = Resource & {
  countiesSet: Set<County>;
  servicesSet: Set<Service>;
};

function normalizeSearch(s: string) {
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
   * expects:
   *  - countiesServedRaw?: string
   *  - servicesIndividualsRaw?: string
   */
  const indexedResources = useMemo<IndexedResource[]>(() => {
    // Build normalized lookup maps so we can:
    // - match case-insensitively
    // - still store canonical values (County/Service) in sets
    const countyMap = new Map<string, County>(
      COUNTIES.map((c) => [normalizeValue(c), c])
    );
    const serviceMap = new Map<string, Service>(
      SERVICES.map((s) => [normalizeValue(s), s])
    );

    return allResources.map((r) => {
      const counties = splitCommaList((r as any).countiesServedRaw)
        .map(normalizeValue)
        .map((n) => countyMap.get(n))
        .filter(Boolean) as County[];

      const services = splitCommaList((r as any).servicesIndividualsRaw)
        .map(normalizeValue)
        .map((n) => serviceMap.get(n))
        .filter(Boolean) as Service[];

      return {
        ...r,
        countiesSet: new Set(counties),
        servicesSet: new Set(services),
      };
    });
  }, [allResources]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(searchQuery);

    return indexedResources.filter((r) => {
      // Search (case-insensitive contains)
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
          .some((v) => normalizeSearch(String(v)).includes(q));

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
      <div className="flex flex-col gap-4 border-t border-gray-400 pt-6 bg-gray-100">
        <p>Lorem ipsum, dolor sit amet consectetur adipisicing elit. Autem dolor error molestiae suscipit sint corrupti eos eligendi aperiam sequi repellat?</p>

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
          <p className="my-2 font-semibold text-lg">Where are you looking?</p>
          <select
            className="w-full bg-white border border-[#3B75A9] rounded-sm px-4 py-2 text-black"
            value={selectedCounty}
            onChange={(e) => setSelectedCounty((e.target.value as County) || "")}
          >
            <option value="">Any county</option>
            {COUNTIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {/* Services checkboxes */}
        <div className="border-b border-gray-400 pt-2 pb-6">
          <div className="flex items-center justify-between gap-4">
            <p className="my-2 font-semibold text-lg">Type of service (you can select multiple services)</p>
            <button
              className="text-sm underline text-[#1E79C8] hover:text-[#0E3052]"
              onClick={clearAllFilters}
            >
              Clear all
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SERVICES.map((svc) => {
              const checked = selectedServices.includes(svc);

              return (
                <label
                  key={svc}
                  className={`flex items-start gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors
                    ${
                      checked
                        ? "bg-gray-700 border-gray-700 text-white"
                        : "bg-white border-gray-300 text-gray-900 hover:bg-gray-50"
                    }
                  `}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleService(svc)}
                    className="mt-1 h-4 w-4 accent-gray-700"
                  />
                  <span className="text-sm leading-snug">{svc}</span>
                </label>
              );
            })}
          </div>
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

      {/* Grid w/ card formatting (matches your example) */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {pageResources.map((r) => (
          <div key={r.id} className="h-full">
            <div className="h-full rounded-sm">
              <div className="h-full bg-gray-50 p-6">
                <ResourceCard resource={r} />
              </div>
            </div>
          </div>
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
