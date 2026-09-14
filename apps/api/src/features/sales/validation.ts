import { Prisma } from '@prisma/client';
import { z } from 'zod';

import {
  COST_AMOUNT_REQUIRED_MESSAGE,
  COST_PROVENANCE_REQUIRED_MESSAGE,
  DRAFT_META_REQUIRED_MESSAGE,
  LINE_NOTE_MAX_LENGTH,
  UNKNOWN_COST_AMOUNT_MESSAGE,
} from './constants.js';
import { COST_PROVENANCES, INVOICE_LINE_TYPES } from './money/types.js';

export const invoiceIdSchema = z.strictObject({ id: z.uuid() });

export const paginationSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export const invoiceCurrencySchema = z.enum(['DOP', 'USD']);
export const invoiceStatusSchema = z.enum(['DRAFT', 'COMPLETED', 'CANCELLED']);

export const createDraftSchema = z.strictObject({
  customerId: z.uuid().optional(),
  currency: invoiceCurrencySchema.optional(),
  fiscal: z.boolean().optional(),
});

export const updateDraftMetaSchema = createDraftSchema.refine(
  (value) => Object.keys(value).length > 0,
  DRAFT_META_REQUIRED_MESSAGE,
);

export const listInvoicesSchema = paginationSchema.extend({
  status: invoiceStatusSchema.optional(),
  q: z.string().trim().optional(),
});

export const listReceivablesSchema = paginationSchema.extend({
  customerId: z.uuid().optional(),
  currency: invoiceCurrencySchema.optional(),
  paymentState: z.enum(['PENDING', 'OVERDUE']).optional(),
});

export const invoiceLineIdSchema = z.strictObject({
  id: z.uuid(),
  lineId: z.uuid(),
});

export const invoiceLineTypeSchema = z.enum(INVOICE_LINE_TYPES);
export const costProvenanceSchema = z.enum(COST_PROVENANCES);
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
  costProvenance: costProvenanceSchema.optional(),
  acquisitionCostDop: moneyStringSchema.nullable().optional(),
  serviceId: z.uuid().optional(),
});

function merchandiseDraftLineSchema<T extends 'GENERIC' | 'EXTERNAL'>(type: T) {
  return z
    .strictObject({
      type: z.literal(type),
      description: z.string().trim().min(1),
      notes: lineNotesSchema,
      quantity: positiveDecimal12x2StringSchema.optional(),
      unitPrice: decimal12x2StringSchema,
      costProvenance: costProvenanceSchema,
      acquisitionCostDop: decimal12x2StringSchema.nullable().optional(),
    })
    .superRefine((value, context) => {
      if (value.costProvenance === 'UNKNOWN') {
        if (value.acquisitionCostDop != null) {
          context.addIssue({
            code: 'custom',
            message: UNKNOWN_COST_AMOUNT_MESSAGE,
            path: ['acquisitionCostDop'],
          });
        }
        return;
      }
      if (value.acquisitionCostDop == null) {
        context.addIssue({
          code: 'custom',
          message: COST_AMOUNT_REQUIRED_MESSAGE,
          path: ['acquisitionCostDop'],
        });
      }
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
    acquisitionCostDop: decimal12x2StringSchema.nullable().optional(),
    costProvenance: costProvenanceSchema.optional(),
  })
  .superRefine((value, context) => {
    const updatesCost =
      value.acquisitionCostDop !== undefined || value.costProvenance !== undefined;
    if (!updatesCost) return;

    if (value.costProvenance === undefined) {
      context.addIssue({
        code: 'custom',
        message: COST_PROVENANCE_REQUIRED_MESSAGE,
        path: ['costProvenance'],
      });
      return;
    }
    if (value.costProvenance === 'UNKNOWN') {
      if (value.acquisitionCostDop !== null) {
        context.addIssue({
          code: 'custom',
          message: UNKNOWN_COST_AMOUNT_MESSAGE,
          path: ['acquisitionCostDop'],
        });
      }
      return;
    }
    if (value.acquisitionCostDop == null) {
      context.addIssue({
        code: 'custom',
        message: COST_AMOUNT_REQUIRED_MESSAGE,
        path: ['acquisitionCostDop'],
      });
    }
  })
  .refine(
    (value) =>
      value.unitPrice !== undefined ||
      value.quantity !== undefined ||
      value.description !== undefined ||
      value.notes !== undefined ||
      value.acquisitionCostDop !== undefined ||
      value.costProvenance !== undefined,
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
