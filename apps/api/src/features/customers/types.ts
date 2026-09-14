import type { z } from 'zod';

import type { createCustomerSchema, customerContactInputSchema } from './validation.js';

export type CreateCustomerInput = z.output<typeof createCustomerSchema>;
export type CustomerContactInput = z.output<typeof customerContactInputSchema>;

export type PublicCustomerContact = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  title: string | null;
  isPrimary: boolean;
};

export type PublicCustomer = {
  id: string;
  name: string;
  rnc: string | null;
  address: string | null;
  notes: string | null;
  isDefault: boolean;
  contacts: PublicCustomerContact[];
  createdAt: string;
  updatedAt: string;
};

export type CustomerSnapshot = {
  name: string;
  rnc: string | null;
  address: string | null;
  notes: string | null;
  isDefault: boolean;
  contacts: Array<{
    name: string | null;
    phone: string | null;
    email: string | null;
    title: string | null;
    isPrimary: boolean;
  }>;
};

export type CreateCustomerRecord = {
  name: string;
  rnc?: string | null;
  address?: string | null;
  notes?: string | null;
  contacts?: Array<{
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    title?: string | null;
    isPrimary?: boolean;
  }>;
};

export type UpdateCustomerRecord = {
  name?: string;
  rnc?: string | null;
  address?: string | null;
  notes?: string | null;
  contacts?: CreateCustomerRecord['contacts'];
};
