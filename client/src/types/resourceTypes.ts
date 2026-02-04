// src/types/resourceTypes.ts
export type Resource = {
  id: string;
  name: string;

  addressLine1?: string;
  city?: string;
  state?: string;
  zip?: string;

  phone?: string;
  website?: string;

  contactName?: string;
  contactTitle?: string;
  contactEmail?: string;

  orgType?: string;
  serviceArea?: string;

  // Existing display field you already use in ResourceCard
  servicesIndividuals?: string;

  // ✅ "Show more" fields (from your CSV)
  serviceDelivery?: string; // In-Person / Virtually / Virtually, In-Person
  languages?: string; // e.g., "English, Spanish"

  // ✅ Audience-specific "Free/Low Cost"
  // Residents: derived from Q9 (charge? inverted)
  freeLowCostResidents?: string; // "Yes" | "No"
  // Organizations: derived from Q13 (charge? inverted)
  freeLowCostOrganizations?: string; // "Yes" | "No"

  // Fields you already use for filtering
  countiesServedRaw?: string;
  servicesIndividualsRaw?: string;

  // Q12 org services
  servicesOrganizationsRaw?: string;
  lat?: number;
  long?: number;
};
