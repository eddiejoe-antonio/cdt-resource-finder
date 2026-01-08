import Papa from "papaparse";
import type { Resource } from "../types/resourceTypes";
import { CSV_FIELDS } from "../static/filters"; // ✅ NEW

type Row = Record<string, unknown>;

const s = (v: unknown) => (v == null ? "" : String(v)).trim();

function formatWebsite(url: string) {
  if (!url) return "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) return `https://${url}`;
  return url;
}

/**
 * Map a CSV row -> Resource
 * Update the column names here to match your CSV headers.
 */
function mapRowToResource(row: Row, index: number): Resource {
  const name = s(row["Name of Organization"] || row["name"]);
  const id = s(row["id"]) || `${index + 1}`;

  const addressLine1 = s(
    row["Organization Address: Address Line 1"] || row["addressLine1"] || row["address"]
  );
  const city = s(row["Organization Address: City"] || row["city"]);
  const state = s(row["Organization Address: State"] || row["state"]);
  const zip = s(row["Organization Address: Zip/Postal Code"] || row["zip"]);

  const phone = s(row["Business Phone No"] || row["phone"]);
  const websiteRaw = s(row["Webpage"] || row["website"]);
  const website = websiteRaw ? formatWebsite(websiteRaw) : "";

  const contactName = s(row["Name of Point of Contact"] || row["contactName"]);
  const contactTitle = s(row["Position/Title"] || row["contactTitle"]);
  const contactEmail = s(row["Business Email Address"] || row["contactEmail"]);

  const orgType = s(row["Type of Organization"] || row["orgType"]);
  const serviceArea = s(row["5. What is your entity/organization's service area?"] || row["serviceArea"]);

  // ✅ Q4 services (exact header)
  const servicesIndividualsRaw = s(row[CSV_FIELDS.services] || row["servicesIndividuals"]);
  const servicesIndividuals = servicesIndividualsRaw; // keep existing field for display

  // ✅ Q6 counties (exact header)
  const countiesServedRaw = s(row[CSV_FIELDS.counties] || row["countiesServedRaw"]);

  return {
    id,
    name,

    addressLine1: addressLine1 || undefined,
    city: city || undefined,
    state: state || undefined,
    zip: zip || undefined,

    phone: phone || undefined,
    website: website || undefined,

    contactName: contactName || undefined,
    contactTitle: contactTitle || undefined,
    contactEmail: contactEmail || undefined,

    orgType: orgType || undefined,
    serviceArea: serviceArea || undefined,

    // existing UI display field
    servicesIndividuals: servicesIndividuals || undefined,

    // ✅ NEW fields used for filtering (comma-delimited strings)
    countiesServedRaw: countiesServedRaw || undefined,
    servicesIndividualsRaw: servicesIndividualsRaw || undefined,
  };
}

export async function fetchResourcesLocal(): Promise<Resource[]> {
  const url = `/resources.csv?t=${Date.now()}`;

  const res = await fetch(url, { headers: { "Content-Type": "text/plain" } });
  if (!res.ok) throw new Error(`Failed to fetch CSV (${res.status})`);

  const csvText = await res.text();

  const parsed = Papa.parse<Row>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors?.length) {
    console.warn("CSV parse warnings:", parsed.errors);
  }

  const rows = (parsed.data ?? []).filter(Boolean);

  const resources = rows
    .map(mapRowToResource)
    .filter((r) => r.name && r.name.trim().length > 0);

  resources.sort((a, b) => a.name.localeCompare(b.name));

  return resources;
}
