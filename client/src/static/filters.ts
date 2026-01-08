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
  // Example — replace with your full list
  "Alameda",
  "Contra Costa",
  "San Francisco",
  "San Mateo",
  "Santa Clara",
] as const;

export const SERVICES = [
  // Example — replace with your full list
  "Devices",
  "Internet",
  "Digital Skills",
  "Tech Support",
  "Accessibility",
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
