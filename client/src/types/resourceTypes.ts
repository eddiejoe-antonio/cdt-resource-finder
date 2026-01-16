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

  // ✅ New "Show more" fields (from your CSV)
  serviceDelivery?: string; // In-Person / Virtually / Virtually, In-Person
  languages?: string; // e.g., "English, Spanish"
  freeLowCost?: string; // are services free

  // Existing fields you already added
  countiesServedRaw?: string;
  servicesIndividualsRaw?: string;

  // Q12 org services
  servicesOrganizationsRaw?: string;
};
