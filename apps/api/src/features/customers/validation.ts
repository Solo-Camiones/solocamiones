import { Prisma } from '@prisma/client';
import { z } from 'zod';

import {
  CONTACT_PHONE_OR_EMAIL_MESSAGE,
  CONTACT_PRIMARY_LIMIT_MESSAGE,
  CREDIT_TERM_DAYS,
  CUSTOMER_TYPES,
  DECIMAL_12_2_MAX,
  DECIMAL_12_2_PATTERN,
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

export const customerTypeSchema = z.enum(CUSTOMER_TYPES);
export const creditTermDaysSchema = z.union([
  z.literal(CREDIT_TERM_DAYS[0]),
  z.literal(CREDIT_TERM_DAYS[1]),
  z.literal(CREDIT_TERM_DAYS[2]),
  z.literal(CREDIT_TERM_DAYS[3]),
  z.literal(CREDIT_TERM_DAYS[4]),
]);

const decimal12x2StringSchema = z
  .string()
  .trim()
  .superRefine((value, context) => {
    if (!DECIMAL_12_2_PATTERN.test(value)) {
      context.addIssue({
        code: 'custom',
        message: 'Must be a non-negative decimal with at most 2 decimal places',
      });
      return;
    }

    if (new Prisma.Decimal(value).greaterThan(DECIMAL_12_2_MAX)) {
      context.addIssue({
        code: 'custom',
        message: 'Must not exceed 9999999999.99',
      });
    }
  });

export const creditLimitDopSchema = z.union([
  decimal12x2StringSchema.superRefine((value, context) => {
    if (DECIMAL_12_2_PATTERN.test(value) && new Prisma.Decimal(value).isZero()) {
      context.addIssue({ code: 'custom', message: 'Must be greater than 0' });
    }
  }),
  z.null(),
]);

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

const customerCreditFieldsSchema = {
  customerType: customerTypeSchema.optional(),
  creditLimitDop: creditLimitDopSchema.optional(),
  creditTermDays: z.union([creditTermDaysSchema, z.null()]).optional(),
};

export const createCustomerSchema = z.strictObject({
  name: customerNameSchema,
  rnc: fiscalIdSchema,
  address: optionalTextSchema,
  notes: optionalTextSchema,
  contacts: customerContactsSchema.optional(),
  ...customerCreditFieldsSchema,
});

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const searchCustomersSchema = paginationSchema.extend({
  q: z.string().trim().optional(),
  customerType: customerTypeSchema.optional(),
});
