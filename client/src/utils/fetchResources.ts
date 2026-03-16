// src/utils/fetchResources.ts
import Papa from "papaparse";
import type { Resource } from "../types/resourceTypes";

type Row = Record<string, unknown>;

const s = (v: unknown) => (v == null ? "" : String(v)).trim();

function toNumberOrUndefined(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function formatWebsite(url: string) {
  const t = url.trim();
  if (!t) return "";
  if (!t.startsWith("http://") && !t.startsWith("https://")) {
    return `https://${t}`;
  }
  return t;
}

/**
 * Helper: find the first key in the row whose trimmed text starts with a prefix.
 * This avoids brittle matching when WPForms/exports change slightly.
 */
function findKeyStartingWith(row: Row, prefix: string): string | null {
  const p = prefix.trim();
  for (const k of Object.keys(row)) {
    if (typeof k === "string" && k.trim().startsWith(p)) return k;
  }
  return null;
}

/**
 * Charge? (Yes/No...) -> Free/Low Cost (Yes/No)
 *
 * You want:
 * - starts with "No"  => DOES NOT charge => Free/Low Cost = "Yes"
 * - starts with "Yes" => charges         => Free/Low Cost = "No"
 */
function normalizeFreeLowCostFromCharge(v: unknown): "Services offered free of charge" | "Services offered for a fee" | "" {
  const txt = s(v).toLowerCase();
  if (!txt) return "";

  if (/^\s*no\b/.test(txt)) return "Services offered free of charge";
  if (/^\s*yes\b/.test(txt)) return "Services offered for a fee";

  // fallback heuristics
  if (txt.includes("free of cost") || txt.includes("free")) return "Services offered free of charge";
  if (txt.includes("charge") || txt.includes("fee") || txt.includes("$")) return "Services offered for a fee";

  return "";
}

/**
 * Parse the address_is_verified_physical column.
 *
 * The Python script writes Python booleans (True / False).
 * We accept: True, true, 1, yes  →  true
 *            False, false, 0, no, empty  →  false
 */
function parseVerifiedPhysical(v: unknown): boolean {
  if (v == null) return false;
  const t = String(v).trim().toLowerCase();
  return t === "true" || t === "1" || t === "yes";
}

// ✅ Prefer exact headers when you know them, but also handle "slightly different" exports safely.
const COL = {
  name: "Name of Organization",
  // Some of your datasets use "Name of Organization:" (with colon). We'll handle via fallback below.

  address1: "Organization Address: Address Line 1",
  city: "Organization Address: City",
  state: "Organization Address: State",
  zip: "Organization Address: Zip/Postal Code",

  phone: "Business Phone No",
  website: "Webpage",

  contactName: "Name of Point of Contact",
  contactTitle: "Position/Title",
  contactEmail: "Business Email Address",

  orgType: "Type of Organization",
  serviceArea: "5. What is your entity/organization's service area?",
  physicalCounty: "physical_county",

  servicesIndividuals:
    "4. What digital inclusion service(s) does your entity/organization provide to individuals? Please select all that apply.",

  counties: "6. Please indicate all the counties in which you provide services.",

  // NOTE: trailing space in some exports
  serviceDelivery:
    "8. How does your entity/organization provide its services? Select all that apply. ",

  // NOTE: NBSP at end in some exports
  languages:
    "languages",

  // Audience-specific "charge?" questions
  chargeResidents: "9. Does your entity/organization charge for its services?",
  chargeOrganizations: "13. Does your entity/organization charge for its services?",

  // Converted output fields
  lat: "lat",
  long: "long",
  gmaps: "google_maps_url",

  // NEW: address provenance flag written by master_to_refined.py
  addressIsVerifiedPhysical: "address_is_verified_physical",
} as const;

function getOrgName(row: Row): string {
  // Handle both "Name of Organization" and "Name of Organization:" (common in your master exports)
  const direct =
    s(row[COL.name]) ||
    s(row["Name of Organization:"]) ||
    s(row["Organization Name"]) ||
    s(row["name"]);

  return direct;
}

function getServicesIndividuals(row: Row): string {
  // Exact header first; fallback to any column that starts with "4."
  if (COL.servicesIndividuals in row) return s(row[COL.servicesIndividuals]);
  const q4Key = findKeyStartingWith(row, "4.");
  return s((q4Key ? row[q4Key] : undefined) || row["servicesIndividualsRaw"]);
}

function getServicesOrganizationsRaw(row: Row): string {
  // Find the "12." column (org services) without hardcoding the full prompt
  const q12Key = findKeyStartingWith(row, "12.");
  return s(
    (q12Key ? row[q12Key] : undefined) ||
      row["servicesOrganizationsRaw"] ||
      row["servicesOrganizations"]
  );
}

function pickMaybe(row: Row, ...keys: string[]): string {
  for (const k of keys) {
    const v = s(row[k]);
    if (v) return v;
  }
  return "";
}

/**
 * Single source of truth mapping function.
 * (Important: keep ONLY ONE mapRowToResource in this file.)
 */
export function mapRowToResource(row: Row, index: number): Resource {
  const name = getOrgName(row);
  const id = s(row["id"]) || `${index + 1}`;

  const addressLine1 = pickMaybe(row, COL.address1, "addressLine1", "address", "Address");
  const city = pickMaybe(row, COL.city, "city", "City");
  const state = pickMaybe(row, COL.state, "state", "State");
  const zip = pickMaybe(row, COL.zip, "zip", "Zip", "Zip/Postal Code");

  const phone = pickMaybe(row, COL.phone, "phone", "Phone", "Business Phone No:");
  const websiteRaw = pickMaybe(row, COL.website, "website", "Website", "Web Page");
  const website = websiteRaw ? formatWebsite(websiteRaw) : "";

  const contactName = pickMaybe(row, COL.contactName, "contactName", "Contact Name");
  const contactTitle = pickMaybe(row, COL.contactTitle, "contactTitle", "Contact Title");
  const contactEmail = pickMaybe(row, COL.contactEmail, "contactEmail", "Email");

  const orgType = pickMaybe(row, COL.orgType, "orgType", "Type of organization", "Type of Organization");
  const serviceArea = pickMaybe(row, COL.serviceArea, "serviceArea");
  const physicalCounty = pickMaybe(row, COL.physicalCounty, "physical_county");

  const servicesIndividualsRaw = getServicesIndividuals(row);
  const servicesIndividuals = servicesIndividualsRaw;

  const countiesServedRaw = pickMaybe(row, COL.counties, "countiesServedRaw");

  const serviceDelivery = pickMaybe(row, COL.serviceDelivery, "serviceDelivery");
  const languages = pickMaybe(row, COL.languages, "languages");

  const freeLowCostResidents = normalizeFreeLowCostFromCharge(
    row[COL.chargeResidents] ?? row["chargeResidents"] ?? row["freeLowCostResidents"]
  );

  const freeLowCostOrganizations = normalizeFreeLowCostFromCharge(
    row[COL.chargeOrganizations] ?? row["chargeOrganizations"] ?? row["freeLowCostOrganizations"]
  );

  const servicesOrganizationsRaw = getServicesOrganizationsRaw(row);

  const lat = toNumberOrUndefined(row[COL.lat]);
  const long = toNumberOrUndefined(row[COL.long]);

  const googleMapsUrl = pickMaybe(row, COL.gmaps, "googleMapsUrl", "Google Maps URL");

  // NEW: address provenance flag
  const addressIsVerifiedPhysical = parseVerifiedPhysical(
    row[COL.addressIsVerifiedPhysical] ?? row["addressIsVerifiedPhysical"]
  );

  return {
    id,
    name,

    addressLine1: addressLine1 || undefined,
    city: city || undefined,
    state: state || undefined,
    zip: zip || undefined,

    phone: phone || undefined,
    website: website || undefined,

    googleMapsUrl: googleMapsUrl || undefined,

    contactName: contactName || undefined,
    contactTitle: contactTitle || undefined,
    contactEmail: contactEmail || undefined,

    orgType: orgType || undefined,
    serviceArea: serviceArea || undefined,
    physicalCounty: physicalCounty || undefined,

    servicesIndividuals: servicesIndividuals || undefined,

    serviceDelivery: serviceDelivery || undefined,
    languages: languages || undefined,

    freeLowCostResidents: freeLowCostResidents || undefined,
    freeLowCostOrganizations: freeLowCostOrganizations || undefined,

    countiesServedRaw: countiesServedRaw || undefined,
    servicesIndividualsRaw: servicesIndividualsRaw || undefined,
    servicesOrganizationsRaw: servicesOrganizationsRaw || undefined,

    lat,
    long,

    // NEW
    addressIsVerifiedPhysical,
  };
}

export async function fetchResourcesLocal(): Promise<Resource[]> {
  const url = `/api/csv?t=${Date.now()}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch CSV (${res.status})`);

  const csvText = await res.text();

  const parsed = Papa.parse<Row>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors?.length) {
    console.warn("CSV parse warnings:", parsed.errors);
  }

  const rows: Row[] = (parsed.data ?? []).filter((x): x is Row => Boolean(x));

  const resources: Resource[] = rows
    .map((row, idx) => mapRowToResource(row, idx))
    .filter((r) => Boolean(r.name && r.name.trim().length > 0));

  resources.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return resources;
}