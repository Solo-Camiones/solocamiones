import { z } from 'zod';

import {
  CONTACT_PHONE_OR_EMAIL_MESSAGE,
  CONTACT_PRIMARY_LIMIT_MESSAGE,
  FISCAL_IDENTIFIER_FORMAT_MESSAGE,
} from './constants.js';
import { fiscalIdDigits, isValidFiscalId } from './fiscal.js';

function normalizeOptionalText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.trim() || null;
}

export const customerNameSchema = z.string().trim().min(1, 'Name is required');
export const optionalTextSchema = z.preprocess(
  normalizeOptionalText,
  z.string().min(1).nullable().optional(),
);
export const paginationSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
export const customerIdSchema = z.strictObject({ id: z.uuid() });

export const fiscalIdSchema = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return fiscalIdDigits(trimmed);
}, z.union([z.null(), z.string().refine(isValidFiscalId, FISCAL_IDENTIFIER_FORMAT_MESSAGE)]).optional());

export const customerContactInputSchema = z
  .strictObject({
    id: z.string().optional(),
    name: optionalTextSchema,
    phone: optionalTextSchema,
    email: z.preprocess(normalizeOptionalText, z.email().nullable().optional()),
    title: optionalTextSchema,
    isPrimary: z.boolean().optional(),
  })
  .refine((contact) => Boolean(contact.phone || contact.email), CONTACT_PHONE_OR_EMAIL_MESSAGE);

export const customerContactsSchema = z
  .array(customerContactInputSchema)
  .superRefine((contacts, context) => {
    const primaryCount = contacts.filter((contact) => contact.isPrimary === true).length;
    if (primaryCount > 1) {
      context.addIssue({ code: 'custom', message: CONTACT_PRIMARY_LIMIT_MESSAGE });
    }
  });

export const createCustomerSchema = z.strictObject({
  name: customerNameSchema,
  rnc: fiscalIdSchema,
  address: optionalTextSchema,
  notes: optionalTextSchema,
  contacts: customerContactsSchema.optional(),
});

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const searchCustomersSchema = paginationSchema.extend({
  q: z.string().trim().optional(),
});
