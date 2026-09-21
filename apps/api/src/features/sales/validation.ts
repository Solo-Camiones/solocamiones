import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { DRAFT_META_REQUIRED_MESSAGE, LINE_NOTE_MAX_LENGTH } from './constants.js';
import { INVOICE_LINE_TYPES } from './money/types.js';

export const invoiceIdSchema = z.strictObject({ id: z.uuid() });
export const statementCustomerIdSchema = z.strictObject({ customerId: z.uuid() });

export const paginationSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export const invoiceCurrencySchema = z.enum(['DOP', 'USD']);
export const invoiceStatusSchema = z.enum([
  'DRAFT',
  'QUOTE_DRAFT',
  'QUOTE_ISSUED',
  'CONDUCE',
  'COMPLETED',
  'CANCELLED',
]);

const DECIMAL_5_2_PERCENT_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const DECIMAL_PERCENT_MAX = new Prisma.Decimal(100);

const discountPercentSchema = z
  .string()
  .trim()
  .superRefine((value, context) => {
    if (!DECIMAL_5_2_PERCENT_PATTERN.test(value)) {
      context.addIssue({
        code: 'custom',
        message: 'Must be a non-negative decimal with at most 2 decimal places',
      });
      return;
    }
    const parsed = new Prisma.Decimal(value);
    if (parsed.greaterThan(DECIMAL_PERCENT_MAX)) {
      context.addIssue({
        code: 'custom',
        message: 'Must not exceed 100',
      });
    }
  });

export const createDraftSchema = z.strictObject({
  customerId: z.uuid().optional(),
  currency: invoiceCurrencySchema.optional(),
  fiscal: z.boolean().optional(),
  applyItbis: z.boolean().optional(),
  discountPercent: discountPercentSchema.optional(),
});

export const emptyCommandSchema = z.strictObject({});

export const updateDraftMetaSchema = createDraftSchema.refine(
  (value) => Object.keys(value).length > 0,
  DRAFT_META_REQUIRED_MESSAGE,
);

export const listInvoicesSchema = paginationSchema
  .extend({
    status: invoiceStatusSchema.optional(),
    q: z.string().trim().optional(),
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
  })
  .refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
    message: 'dateFrom must be on or before dateTo',
    path: ['dateTo'],
  });

export const listReceivablesSchema = paginationSchema
  .extend({
    customerId: z.uuid().optional(),
    invoice: z
      .string()
      .trim()
      .regex(/^FAC-\d{6}$/i, 'Must be a FAC- number')
      .transform((value) => value.toUpperCase())
      .optional(),
  })
  .strict();

const sellerSalesReportDateFiltersSchema = z
  .strictObject({
    dateFrom: z.iso.date(),
    dateTo: z.iso.date(),
    sellerUserId: z.uuid().optional(),
  })
  .refine((value) => value.dateFrom <= value.dateTo, {
    message: 'dateFrom must be on or before dateTo',
    path: ['dateTo'],
  });

/** JSON list: same date filters as PDF, plus shared list pagination. */
export const sellerSalesReportQuerySchema = paginationSchema
  .extend({
    dateFrom: z.iso.date(),
    dateTo: z.iso.date(),
    sellerUserId: z.uuid().optional(),
  })
  .refine((value) => value.dateFrom <= value.dateTo, {
    message: 'dateFrom must be on or before dateTo',
    path: ['dateTo'],
  });

/** PDF download: full filtered range (no page slice). */
export const sellerSalesReportPdfQuerySchema = sellerSalesReportDateFiltersSchema;

export const invoiceLineIdSchema = z.strictObject({
  id: z.uuid(),
  lineId: z.uuid(),
});

export const invoiceLineTypeSchema = z.enum(INVOICE_LINE_TYPES);
const moneyStringSchema = z.string();
const DECIMAL_12_2_MAX = new Prisma.Decimal('9999999999.99');
const DECIMAL_12_2_PATTERN = /^\d+(?:\.\d{1,2})?$/;

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

const positiveDecimal12x2StringSchema = decimal12x2StringSchema.superRefine((value, context) => {
  if (DECIMAL_12_2_PATTERN.test(value) && new Prisma.Decimal(value).isZero()) {
    context.addIssue({ code: 'custom', message: 'Must be greater than 0' });
  }
});

function normalizeLineNotes(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export const lineNotesSchema = z.preprocess(
  normalizeLineNotes,
  z.string().max(LINE_NOTE_MAX_LENGTH).nullable().optional(),
);

export const addInvoiceLineSchema = z.strictObject({
  type: invoiceLineTypeSchema,
  description: z.string().trim().min(1).optional(),
  notes: lineNotesSchema,
  quantity: moneyStringSchema.optional(),
  unitPrice: moneyStringSchema.optional(),
  serviceId: z.uuid().optional(),
});

function merchandiseDraftLineSchema<T extends 'GENERIC' | 'EXTERNAL'>(type: T) {
  return z.strictObject({
    type: z.literal(type),
    description: z.string().trim().min(1),
    notes: lineNotesSchema,
    quantity: positiveDecimal12x2StringSchema.optional(),
    unitPrice: decimal12x2StringSchema,
  });
}

export const genericDraftLineSchema = merchandiseDraftLineSchema('GENERIC');
export const externalDraftLineSchema = merchandiseDraftLineSchema('EXTERNAL');

export const serviceDraftLineSchema = z.strictObject({
  type: z.literal('SERVICE'),
  serviceId: z.uuid(),
  unitPrice: decimal12x2StringSchema,
  description: z.string().trim().min(1).optional(),
  notes: lineNotesSchema,
});

export const deliveryDraftLineSchema = z.strictObject({
  type: z.literal('DELIVERY'),
  unitPrice: decimal12x2StringSchema,
  description: z.string().trim().min(1),
  notes: lineNotesSchema,
});

export const setLinePriceSchema = z
  .strictObject({
    unitPrice: decimal12x2StringSchema.optional(),
    quantity: positiveDecimal12x2StringSchema.optional(),
    description: z.string().trim().min(1).optional(),
    notes: lineNotesSchema,
  })
  .refine(
    (value) =>
      value.unitPrice !== undefined ||
      value.quantity !== undefined ||
      value.description !== undefined ||
      value.notes !== undefined,
    DRAFT_META_REQUIRED_MESSAGE,
  );

export const paymentMethodSchema = z.enum(['CASH', 'TRANSFER', 'CHECK']);
export const paymentDateSchema = z.iso.date();
export const confirmInvoiceSchema = z.strictObject({
  payment: z
    .strictObject({
      amount: positiveDecimal12x2StringSchema,
      method: paymentMethodSchema,
      reference: z.string().trim().min(1).max(100).nullable().optional(),
      idempotencyKey: z.string().trim().min(1).max(100).optional(),
    })
    .optional(),
});

/** Convert conduce → invoice: fiscal choice is made here, not at conduce emission (CON-003). */
export const convertConduceToInvoiceSchema = z.strictObject({
  fiscal: z.boolean(),
});

export const addPaymentSchema = z.strictObject({
  amount: positiveDecimal12x2StringSchema,
  method: paymentMethodSchema,
  effectiveDate: paymentDateSchema,
  reference: z.string().trim().min(1).max(100).nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(100),
});

export const cancelInvoiceSchema = z.strictObject({
  reason: z.string().trim().min(1).max(500),
  refundMethod: paymentMethodSchema.optional(),
  refundReference: z.string().trim().min(1).max(100).nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(100),
});
