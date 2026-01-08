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

  servicesIndividuals?: string;
  countiesServedRaw?: string;
  servicesIndividualsRaw?: string;

};
