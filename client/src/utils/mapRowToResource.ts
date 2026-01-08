import type { Resource } from "../types/resourceTypes";

type Row = Record<string, unknown>;

const s = (v: unknown) => (v == null ? "" : String(v)).trim();

export function mapRowToResource(row: Row, index: number): Resource {
  const name = s(row["Name of Organization"]);

  return {
    id: s(row["id"]) || `${index + 1}`,
    name,

    addressLine1: s(row["Organization Address: Address Line 1"]) || undefined,
    city: s(row["Organization Address: City"]) || undefined,
    state: s(row["Organization Address: State"]) || undefined,
    zip: s(row["Organization Address: Zip/Postal Code"]) || undefined,

    phone: s(row["Business Phone No"]) || undefined,
    website: s(row["Webpage"]) || undefined,

    contactName: s(row["Name of Point of Contact"]) || undefined,
    contactTitle: s(row["Position/Title"]) || undefined,
    contactEmail: s(row["Business Email Address"]) || undefined,

    orgType: s(row["Type of Organization"]) || undefined,
    serviceArea: s(row["5. What is your entity/organization's service area?"]) || undefined,

    servicesIndividuals:
      s(
        row[
          "4. What digital inclusion service(s) does your entity/o...nization provide to individuals? Please select all that apply."
        ]
      ) || undefined,
  };
}
