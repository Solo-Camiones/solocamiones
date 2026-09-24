import { Prisma } from '@prisma/client';

import { AppError } from '../../infrastructure/errors/app-error.js';
import {
  ASSISTANT_APP_PATHS,
  assistantToolSourceKey,
} from '../assistant/tools/constants.js';
import type {
  GetSalesDocumentDetailInput,
  SearchSalesDocumentsInput,
} from '../assistant/tools/schemas.js';
import { databaseDateString } from '../payments/dates.js';
import { moneyString } from '../payments/receivables.js';
import { summarizePayments } from '../payments/summary.js';
import { assertAdministrator } from '../users/policies.js';
import type {
  AssistantSalesDocumentDetail,
  AssistantSalesDocumentSearchResult,
} from './assistant-query-types.js';
import { MONEY_DECIMAL_PLACES } from './money/constants.js';
import { salesTransaction, type SalesTransaction } from './transaction.js';

function decimalOrZero(value: Prisma.Decimal | null | undefined): string {
  if (value == null) return (0).toFixed(MONEY_DECIMAL_PLACES);
  return moneyString(value);
}

function sellerOf(invoice: {
  status: string;
  confirmedByUserId: string | null;
  confirmedByName: string | null;
  quoteIssuedByUserId: string | null;
  quoteIssuedByName: string | null;
}): { sellerUserId: string | null; sellerName: string | null } {
  if (invoice.status === 'QUOTE_ISSUED') {
    return {
      sellerUserId: invoice.quoteIssuedByUserId,
      sellerName: invoice.quoteIssuedByName,
    };
  }
  return {
    sellerUserId: invoice.confirmedByUserId,
    sellerName: invoice.confirmedByName,
  };
}

export class SalesAssistantQueryService {
  constructor(private readonly transaction: SalesTransaction = salesTransaction) {}

  async searchDocuments(
    actorId: string,
    input: SearchSalesDocumentsInput,
    now = new Date(),
  ): Promise<AssistantSalesDocumentSearchResult> {
    return this.transaction(async ({ sales, users }) => {
      assertAdministrator(await users.findById(actorId));
      const rows = await sales.searchDocumentsForAssistant({
        q: input.query,
        status: input.status,
        customerId: input.customerId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        limit: input.limit,
      });

      return {
        items: rows.map((row) => {
          const seller = sellerOf(row);
          return {
            id: row.id,
            status: row.status,
            number: row.number,
            quoteNumber: row.quoteNumber,
            conduceNumber: row.conduceNumber,
            currency: row.currency,
            fiscal: row.fiscal,
            confirmedAt: row.confirmedAt?.toISOString() ?? null,
            quoteIssuedAt: row.quoteIssuedAt?.toISOString() ?? null,
            totals: {
              gross: decimalOrZero(row.gross),
              base: decimalOrZero(row.base),
              itbis: decimalOrZero(row.itbis),
            },
            discountPercent: moneyString(row.discountPercent),
            sellerUserId: seller.sellerUserId,
            sellerName: seller.sellerName,
            customerId: row.customerId,
            customerName: row.customer.name,
            appPath: ASSISTANT_APP_PATHS.salesDocument(row.id),
          };
        }),
        asOf: now.toISOString(),
        sourceKey: assistantToolSourceKey('searchSalesDocuments'),
      };
    });
  }

  async getDocumentDetail(
    actorId: string,
    input: GetSalesDocumentDetailInput,
    now = new Date(),
  ): Promise<AssistantSalesDocumentDetail> {
    return this.transaction(async ({ sales, users }) => {
      assertAdministrator(await users.findById(actorId));
      const row = await sales.findDocumentDetailForAssistant(input.documentId);
      if (!row) throw AppError.notFound('Document not found');

      const recognized =
        row.status === 'COMPLETED' || row.status === 'CONDUCE' || row.status === 'CANCELLED';
      const payment = recognized ? summarizePayments(row, now) : null;
      const seller = sellerOf(row);

      return {
        id: row.id,
        status: row.status,
        number: row.number,
        quoteNumber: row.quoteNumber,
        conduceNumber: row.conduceNumber,
        currency: row.currency,
        fiscal: row.fiscal,
        applyItbis: row.applyItbis,
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
        quoteIssuedAt: row.quoteIssuedAt?.toISOString() ?? null,
        quoteExpiresAt: row.quoteExpiresAt?.toISOString() ?? null,
        dueDate: row.dueDate ? databaseDateString(row.dueDate) : null,
        sellerUserId: seller.sellerUserId,
        sellerName: seller.sellerName,
        customer: { id: row.customer.id, name: row.customer.name },
        lines: row.lines.map((line) => ({
          id: line.id,
          type: line.type,
          description: line.description,
          quantity: moneyString(line.quantity),
          unitPrice: moneyString(line.unitPrice),
          gross: line.gross == null ? null : moneyString(line.gross),
          base: line.base == null ? null : moneyString(line.base),
          itbis: line.itbis == null ? null : moneyString(line.itbis),
        })),
        payments: row.payments.map((paymentRow) => ({
          kind: paymentRow.kind,
          amount: moneyString(paymentRow.amount),
          method: paymentRow.method,
          effectiveDate: databaseDateString(paymentRow.effectiveDate),
        })),
        balance: payment ? moneyString(payment.balance) : null,
        paymentState: payment?.state ?? null,
        totals: {
          gross: decimalOrZero(row.gross),
          base: decimalOrZero(row.base),
          itbis: decimalOrZero(row.itbis),
        },
        discountPercent: moneyString(row.discountPercent),
        appPath: ASSISTANT_APP_PATHS.salesDocument(row.id),
        asOf: now.toISOString(),
        sourceKey: assistantToolSourceKey('getSalesDocumentDetail'),
      };
    });
  }
}
