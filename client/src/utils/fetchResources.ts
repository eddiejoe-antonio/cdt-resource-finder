// src/utils/fetchResources.ts
import Papa from "papaparse";
import type { Resource } from "../types/resourceTypes";
import { CSV_FIELDS } from "../static/filters";

type Row = Record<string, unknown>;

const s = (v: unknown) => (v == null ? "" : String(v)).trim();

function formatWebsite(url: string) {
  if (!url) return "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) return `https://${url}`;
  return url;
}

const Q12_PREFIX =
  "12. Does your entity/organization provide any of the following supports or services to other organizations";

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
  const serviceArea = s(
    row["5. What is your entity/organization's service area?"] || row["serviceArea"]
  );

  // Q4
  const servicesIndividualsRaw = s(row[CSV_FIELDS.services] || row["servicesIndividualsRaw"]);
  const servicesIndividuals = servicesIndividualsRaw;

  // Q6
  const countiesServedRaw = s(row[CSV_FIELDS.counties] || row["countiesServedRaw"]);

  // Q12 -> mapped fields for org-mode
  const q12Key =
    Object.keys(row).find((k) => typeof k === "string" && k.startsWith(Q12_PREFIX)) ?? null;

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

    servicesIndividuals: servicesIndividuals || undefined,

    countiesServedRaw: countiesServedRaw || undefined,
    servicesIndividualsRaw: servicesIndividualsRaw || undefined,

    // IMPORTANT: ensure your Resource type includes this field
    servicesOrganizationsRaw: servicesOrganizationsRaw || undefined,
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
