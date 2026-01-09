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

  // ✅ Add these (so ResourceFinder can be strict-typed, no any)
  countiesServedRaw?: string;
  servicesIndividualsRaw?: string;

  // ✅ Q12 (org-mode)
  servicesOrganizationsRaw?: string;
};
