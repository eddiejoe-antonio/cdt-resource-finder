// src/static/filters.ts

export const CSV_FIELDS = {
  counties: "6. Please indicate all the counties in which you provide services.",
  services:
    "4. What digital inclusion service(s) does your entity/organization provide to individuals? Please select all that apply.",
} as const;

/* ======================================================
   COUNTIES
====================================================== */

export const COUNTIES = [
  "Alameda",
  "Alpine",
  "Amador",
  "Butte",
  "Calaveras",
  "Colusa",
  "Contra Costa",
  "Del Norte",
  "El Dorado",
  "Fresno",
  "Glenn",
  "Humboldt",
  "Imperial",
  "Inyo",
  "Kern",
  "Kings",
  "Lake",
  "Lassen",
  "Los Angeles",
  "Madera",
  "Marin",
  "Mariposa",
  "Mendocino",
  "Merced",
  "Modoc",
  "Mono",
  "Monterey",
  "Napa",
  "Nevada",
  "Orange",
  "Placer",
  "Plumas",
  "Riverside",
  "Sacramento",
  "San Benito",
  "San Bernardino",
  "San Diego",
  "San Francisco",
  "San Joaquin",
  "San Luis Obispo",
  "San Mateo",
  "Santa Barbara",
  "Santa Clara",
  "Santa Cruz",
  "Shasta",
  "Sierra",
  "Siskiyou",
  "Solano",
  "Sonoma",
  "Stanislaus",
  "Sutter",
  "Tehama",
  "Trinity",
  "Tulare",
  "Tuolumne",
  "Ventura",
  "Yolo",
  "Yuba",
] as const;

export type County = (typeof COUNTIES)[number];

/* ======================================================
   RESIDENT SERVICES (canonical values)
====================================================== */

export const SERVICES = [
  "Computer Center(s)",
  "Digital Navigation (in-person or virtual/call center)",
  "Digital Literacy & Skills Training",
  "Free/Low-Cost Devices",
  "Free/Low-Cost Hotspots",
  "Enrollment assistance in low-cost internet service programs",
  "Locating Low-Cost Internet Service Programs",
  "Online Educational Resources",
  "Public Wi-Fi",
  "Technical Support",
  "Workforce Development Resources",
] as const;

export type Service = (typeof SERVICES)[number];

/* ======================================================
   ORGANIZATION SERVICES (canonical values)
====================================================== */

export const ORG_SERVICES = [
  "Collective action",
  "Digital equity grant writing",
  "Information sharing",
  "Mutual aid (financial)",
  "Organizational training",
  "Partnership opportunities",
  "Train-the-trainer",
  "Other",
] as const;

export type OrgService = (typeof ORG_SERVICES)[number];

/* ======================================================
   DISPLAY LABELS (EDIT THESE)
====================================================== */

/** Resident-facing service labels */
export const SERVICE_DISPLAY_LABELS: Record<Service, string> = {
  "Computer Center(s)": "Computer centers",
  "Digital Navigation (in-person or virtual/call center)":
    "Digital navigation (in-person or virtual/call center)",
  "Digital Literacy & Skills Training": "Digital skills training",
  "Free/Low-Cost Devices": "Free or low-cost devices",
  "Free/Low-Cost Hotspots": "Free or low-cost hotspots",
  "Locating Low-Cost Internet Service Programs": "Low-cost internet programs",
  "Enrollment assistance in low-cost internet service programs":
    "Low-cost internet enrollment assistance",
  "Online Educational Resources": "Online educational resources",
  "Public Wi-Fi": "Public Wi-Fi",
  "Technical Support": "Technical support",
  "Workforce Development Resources": "Workforce development",
};

/** Organization-facing service labels */
export const ORG_SERVICE_DISPLAY_LABELS: Record<OrgService, string> = {
  "Collective action": "Collective action",
  "Digital equity grant writing": "Digital equity grant writing",
  "Information sharing": "Information sharing",
  "Mutual aid (financial)": "Mutual aid (financial)",
  "Organizational training": "Organizational training",
  "Other": "Other",
  "Partnership opportunities": "Partnership opportunities",
  "Train-the-trainer": "Train-the-trainer programs",
};

/* ======================================================
   HELPERS
====================================================== */

export function splitCommaList(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n|]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function normalizeValue(v: string): string {
  return v.toLowerCase().replace(/\s+/g, " ").trim();
}

export function labelForService(svc: Service): string {
  return SERVICE_DISPLAY_LABELS[svc] ?? svc;
}

export function labelForOrgService(svc: OrgService): string {
  return ORG_SERVICE_DISPLAY_LABELS[svc] ?? svc;
}

/* ======================================================
   SERVICE DELIVERY (Q8 filter)
====================================================== */

export const SERVICE_DELIVERY_OPTIONS = [
  "Virtually",
  "In-Person",
  "Either Virtually or In-Person",
] as const;

export type ServiceDeliveryFilter = (typeof SERVICE_DELIVERY_OPTIONS)[number];

/**
 * ✅ FIXED AT THE SOURCE:
 * If Address Line 1 is literally "Virtual", treat the org as virtual-only
 * even if Q8 includes "In-Person" — this prevents those rows from showing
 * when the user filters to In-Person.
 */
export function normalizeServiceDeliveryFlags(
  raw?: string,
  addressLine1?: string
): {
  hasInPerson: boolean;
  hasVirtual: boolean;
} {
  const t = normalizeValue(raw ?? "");
  const addr = normalizeValue(addressLine1 ?? "");

  // If address line 1 is "Virtual", force virtual-only
  if (addr === "virtual") {
    return { hasInPerson: false, hasVirtual: true };
  }

  const hasInPerson =
    t.includes("in-person") || t.includes("in person") || t.includes("inperson");

  const hasVirtual = t.includes("virtually") || t.includes("virtual");

  return { hasInPerson, hasVirtual };
}
