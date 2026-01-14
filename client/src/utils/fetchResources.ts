// src/utils/fetchResources.ts
import Papa from "papaparse";
import type { Resource } from "../types/resourceTypes";

type Row = Record<string, unknown>;

const s = (v: unknown) => (v == null ? "" : String(v)).trim();

function formatWebsite(url: string) {
  if (!url) return "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) return `https://${url}`;
  return url;
}

// ✅ Prefer exact headers when you know them, but also handle "slightly different" exports safely.
const COL = {
  name: "Name of Organization",
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

  // ✅ FIX #1: use the real Q4 header (no ellipsis)
  servicesIndividuals:
    "4. What digital inclusion service(s) does your entity/organization provide to individuals? Please select all that apply.",

  counties: "6. Please indicate all the counties in which you provide services.",

  // NOTE: trailing space
  serviceDelivery:
    "8. How does your entity/organization provide its services? Select all that apply. ",

  // NOTE: NBSP at end
  languages:
    "11. What language(s) does your entity/organization provide its services in? Please select all that apply.\u00A0",

  freeLowCost: "13. Does your entity/organization charge for its services?",
} as const;

/**
 * Helper: find the first key in the row whose trimmed text starts with a prefix.
 * This avoids brittle matching when WPForms/exports change slightly.
 */
function findKeyStartingWith(row: Row, prefix: string): string | null {
  for (const k of Object.keys(row)) {
    if (typeof k === "string" && k.trim().startsWith(prefix)) return k;
  }
  return null;
}

export function mapRowToResource(row: Row, index: number): Resource {
  const name = s(row[COL.name] || row["name"]);
  const id = s(row["id"]) || `${index + 1}`;

  const addressLine1 = s(row[COL.address1] || row["addressLine1"] || row["address"]);
  const city = s(row[COL.city] || row["city"]);
  const state = s(row[COL.state] || row["state"]);
  const zip = s(row[COL.zip] || row["zip"]);

  const phone = s(row[COL.phone] || row["phone"]);
  const websiteRaw = s(row[COL.website] || row["website"]);
  const website = websiteRaw ? formatWebsite(websiteRaw) : "";

  const contactName = s(row[COL.contactName] || row["contactName"]);
  const contactTitle = s(row[COL.contactTitle] || row["contactTitle"]);
  const contactEmail = s(row[COL.contactEmail] || row["contactEmail"]);

  const orgType = s(row[COL.orgType] || row["orgType"]);
  const serviceArea = s(row[COL.serviceArea] || row["serviceArea"]);

  // ✅ Q4: exact header first; fallback to "find the 4. ..." column if exports change
  const q4Key = COL.servicesIndividuals in row ? COL.servicesIndividuals : findKeyStartingWith(row, "4.");
  const servicesIndividualsRaw = s((q4Key ? row[q4Key] : undefined) || row["servicesIndividualsRaw"]);
  const servicesIndividuals = servicesIndividualsRaw;

  const countiesServedRaw = s(row[COL.counties] || row["countiesServedRaw"]);

  const serviceDelivery = s(row[COL.serviceDelivery] || row["serviceDelivery"]);
  const languages = s(row[COL.languages] || row["languages"]);
  const freeLowCost = s(row[COL.freeLowCost] || row["freeLowCost"]);

  // ✅ FIX #2: Q12: do NOT match a long prefix with ellipses. Just find the "12." column.
  const q12Key = findKeyStartingWith(row, "12.");
  const servicesOrganizationsRaw = s(
    (q12Key ? row[q12Key] : undefined) ||
      row["servicesOrganizationsRaw"] ||
      row["servicesOrganizations"]
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

    contactName: contactName || undefined,
    contactTitle: contactTitle || undefined,
    contactEmail: contactEmail || undefined,

    orgType: orgType || undefined,
    serviceArea: serviceArea || undefined,

    // cards can show this as fallback (and ResourceFinder uses servicesIndividualsRaw for filtering)
    servicesIndividuals: servicesIndividuals || undefined,

    // show-more
    serviceDelivery: serviceDelivery || undefined,
    languages: languages || undefined,
    freeLowCost: freeLowCost || undefined,

    // ResourceFinder filter inputs
    countiesServedRaw: countiesServedRaw || undefined,
    servicesIndividualsRaw: servicesIndividualsRaw || undefined,
    servicesOrganizationsRaw: servicesOrganizationsRaw || undefined,
  };
}

export async function fetchResourcesLocal(): Promise<Resource[]> {
  const url = `/converted.csv?t=${Date.now()}`;

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

  const rows: Row[] = (parsed.data ?? []).filter((x): x is Row => Boolean(x));

  const resources: Resource[] = rows
    .map((row, idx) => mapRowToResource(row, idx))
    .filter((r) => Boolean(r.name && r.name.trim().length > 0));

  resources.sort((a, b) => a.name.localeCompare(b.name));
  return resources;
}
