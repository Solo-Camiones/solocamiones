import type { CustomerType } from '@prisma/client';
import type { z } from 'zod';

import type { CREDIT_TERM_DAYS } from './constants.js';
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
  customerType: CustomerType;
  creditLimitDop: string | null;
  creditTermDays: (typeof CREDIT_TERM_DAYS)[number] | null;
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
  customerType: CustomerType;
  creditLimitDop: string | null;
  creditTermDays: (typeof CREDIT_TERM_DAYS)[number] | null;
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
  customerType?: CustomerType;
  creditLimitDop?: string | null;
  creditTermDays?: number | null;
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
  customerType?: CustomerType;
  creditLimitDop?: string | null;
  creditTermDays?: number | null;
  contacts?: CreateCustomerRecord['contacts'];
};

export type CompletedInvoicePaymentSummary = {
  status: 'COMPLETED';
  gross: import('@prisma/client').Prisma.Decimal | null;
  dueDate: Date | null;
  payments: import('@prisma/client').InvoicePayment[];
};
