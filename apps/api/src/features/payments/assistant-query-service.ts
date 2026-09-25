import { ASSISTANT_APP_PATHS, assistantToolSourceKey } from '../assistant/tools/constants.js';
import type { GetReceivablesSummaryInput } from '../assistant/tools/schemas.js';
import type { AssistantToolMeta } from '../assistant/tools/types.js';
import { salesTransaction, type SalesTransaction } from '../sales/transaction.js';
import { assertAdministrator } from '../users/policies.js';
import { businessDayRange, databaseDateString } from './dates.js';
import { moneyString } from './receivables.js';

export type AssistantReceivableDocument = {
  id: string;
  status: string;
  number: string | null;
  conduceNumber: string | null;
  currency: 'DOP' | 'USD';
  fiscal: boolean;
  confirmedAt: string | null;
  dueDate: string | null;
  paymentState: string;
  invoiced: string;
  paid: string;
  balance: string;
  customerId: string;
  customerName: string;
  sellerUserId: string | null;
  sellerName: string | null;
  appPath: string;
};

export type AssistantReceivablesSummary = AssistantToolMeta & {
  aggregates: {
    documentCount: number;
    invoicedDop: string;
    paidDop: string;
    balanceDop: string;
    invoicedUsd: string;
    paidUsd: string;
    balanceUsd: string;
  };
  documents: AssistantReceivableDocument[];
  appPath: string;
};

function cutOffInstant(cutOff: string | undefined, now: Date): Date {
  if (!cutOff) return now;
  const range = businessDayRange(cutOff, cutOff);
  return range.lte ?? now;
}

export class ReceivablesAssistantQueryService {
  constructor(private readonly transaction: SalesTransaction = salesTransaction) {}

  async getSummary(
    actorId: string,
    input: GetReceivablesSummaryInput,
    now = new Date(),
  ): Promise<AssistantReceivablesSummary> {
    return this.transaction(async ({ sales, users }) => {
      assertAdministrator(await users.findById(actorId));
      const asOf = cutOffInstant(input.cutOff, now);
      const summary = await sales.getReceivablesSummaryForAssistant({
        customerId: input.customerId,
        type: input.type,
        overdue: input.overdue,
        asOf,
        limit: input.limit,
      });
      const documents: AssistantReceivableDocument[] = summary.documents.map((row) => ({
        id: row.id,
        status: row.status,
        number: row.number,
        conduceNumber: row.conduceNumber,
        currency: row.currency,
        fiscal: row.fiscal,
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
        dueDate: row.dueDate ? databaseDateString(row.dueDate) : null,
        paymentState: row.paid.greaterThan(0)
          ? row.isOverdue
            ? 'PARTIALLY_PAID_OVERDUE'
            : 'PARTIALLY_PAID'
          : row.isOverdue
            ? 'OVERDUE'
            : 'PENDING',
        invoiced: moneyString(row.invoiced),
        paid: moneyString(row.paid),
        balance: moneyString(row.balance),
        customerId: row.customerId,
        customerName: row.customerName,
        sellerUserId: row.sellerUserId,
        sellerName: row.sellerName,
        appPath: ASSISTANT_APP_PATHS.salesDocument(row.id),
      }));

      return {
        aggregates: {
          documentCount: Number(summary.aggregates.documentCount),
          invoicedDop: moneyString(summary.aggregates.invoicedDop),
          paidDop: moneyString(summary.aggregates.paidDop),
          balanceDop: moneyString(summary.aggregates.balanceDop),
          invoicedUsd: moneyString(summary.aggregates.invoicedUsd),
          paidUsd: moneyString(summary.aggregates.paidUsd),
          balanceUsd: moneyString(summary.aggregates.balanceUsd),
        },
        documents,
        appPath: ASSISTANT_APP_PATHS.receivables,
        asOf: asOf.toISOString(),
        sourceKey: assistantToolSourceKey('getReceivablesSummary'),
      };
    });
  }
}
