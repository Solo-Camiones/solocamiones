import { z } from 'zod';

import {
  ASSISTANT_PROFITABILITY_MAX_RANGE_DAYS,
  ASSISTANT_TOOL_MAX_ROWS,
} from './constants.js';

const limitSchema = z.coerce.number().int().min(1).max(ASSISTANT_TOOL_MAX_ROWS).default(ASSISTANT_TOOL_MAX_ROWS);

function inclusiveCalendarDays(dateFrom: string, dateTo: string): number {
  const from = Date.UTC(
    Number(dateFrom.slice(0, 4)),
    Number(dateFrom.slice(5, 7)) - 1,
    Number(dateFrom.slice(8, 10)),
  );
  const to = Date.UTC(
    Number(dateTo.slice(0, 4)),
    Number(dateTo.slice(5, 7)) - 1,
    Number(dateTo.slice(8, 10)),
  );
  return Math.floor((to - from) / 86_400_000) + 1;
}

export const searchCustomersInputSchema = z.strictObject({
  query: z.string().trim().min(1).max(200).optional(),
  customerType: z.enum(['CASH', 'CREDIT']).optional(),
  limit: limitSchema,
});

export const getCustomerCommercialSummaryInputSchema = z.strictObject({
  customerId: z.uuid(),
});

export const searchSalesDocumentsInputSchema = z
  .strictObject({
    query: z.string().trim().min(1).max(200).optional(),
    status: z
      .enum([
        'DRAFT',
        'QUOTE_DRAFT',
        'QUOTE_ISSUED',
        'CONDUCE',
        'COMPLETED',
        'CANCELLED',
      ])
      .optional(),
    customerId: z.uuid().optional(),
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
    limit: limitSchema,
  })
  .refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
    message: 'dateFrom must be on or before dateTo',
    path: ['dateTo'],
  });

export const getSalesDocumentDetailInputSchema = z.strictObject({
  documentId: z.uuid(),
});

export const getReceivablesSummaryInputSchema = z.strictObject({
  customerId: z.uuid().optional(),
  /** Only documents whose payment state is overdue as of cutOff/now. */
  overdue: z.boolean().optional(),
  /** Primary document type: FAC- number present, or CON- without FAC-. */
  type: z.enum(['FAC', 'CON']).optional(),
  /** Business calendar day used as as-of for balances and overdue. */
  cutOff: z.iso.date().optional(),
  limit: limitSchema,
});

export const getProfitabilitySummaryInputSchema = z
  .strictObject({
    dateFrom: z.iso.date(),
    dateTo: z.iso.date(),
    currency: z.enum(['DOP', 'USD']),
  })
  .refine((value) => value.dateFrom <= value.dateTo, {
    message: 'dateFrom must be on or before dateTo',
    path: ['dateTo'],
  })
  .refine(
    (value) =>
      inclusiveCalendarDays(value.dateFrom, value.dateTo) <= ASSISTANT_PROFITABILITY_MAX_RANGE_DAYS,
    {
      message: `Date range must not exceed ${ASSISTANT_PROFITABILITY_MAX_RANGE_DAYS} days`,
      path: ['dateTo'],
    },
  );

export type SearchCustomersInput = z.output<typeof searchCustomersInputSchema>;
export type GetCustomerCommercialSummaryInput = z.output<
  typeof getCustomerCommercialSummaryInputSchema
>;
export type SearchSalesDocumentsInput = z.output<typeof searchSalesDocumentsInputSchema>;
export type GetSalesDocumentDetailInput = z.output<typeof getSalesDocumentDetailInputSchema>;
export type GetReceivablesSummaryInput = z.output<typeof getReceivablesSummaryInputSchema>;
export type GetProfitabilitySummaryInput = z.output<typeof getProfitabilitySummaryInputSchema>;
