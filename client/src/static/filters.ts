// src/static/filters.ts

export const CSV_FIELDS = {
  counties:
    "6. Please indicate all the counties in which you provide services.",
  services:
    "4. What digital inclusion service(s) does your entity/organization provide to individuals? Please select all that apply.",
} as const;

/**
 * Static, finite lists (control order + labeling).
 * Replace these with your exact county/service values.
 */
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


export const SERVICES = [
  "Locating Low-Cost Internet Service Programs",
  "Enrollment Assistance in Low-Cost Internet",
  "Digital Navigation (in-person or virtual/call center)",
  "Digital Literacy & Skills Training",
  "Technical Support",
  "Free/Low-Cost Devices",
  "Free/Low-Cost Hotspots",
  "Public Wi-Fi",
  "Computer Center(s)",
  "Online Educational Resources",
  "Workforce Development Resources",
] as const;


export type County = (typeof COUNTIES)[number];
export type Service = (typeof SERVICES)[number];

/**
 * CSV is comma-delimited per your note. We'll also be tolerant of semicolons/newlines.
 */
export function splitCommaList(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n|]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function normalizeValue(v: string): string {
  return v
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
