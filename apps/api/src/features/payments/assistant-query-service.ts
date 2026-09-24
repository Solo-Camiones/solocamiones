import { Prisma } from '@prisma/client';

import {
  ASSISTANT_APP_PATHS,
  assistantToolSourceKey,
} from '../assistant/tools/constants.js';
import type { GetReceivablesSummaryInput } from '../assistant/tools/schemas.js';
import type { AssistantToolMeta } from '../assistant/tools/types.js';
import { salesTransaction, type SalesTransaction } from '../sales/transaction.js';
import { assertAdministrator } from '../users/policies.js';
import { businessDayRange, databaseDateString } from './dates.js';
import { moneyString } from './receivables.js';
import { summarizePayments } from './summary.js';

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
      const rows = await sales.listReceivablesForAssistant({
        customerId: input.customerId,
        type: input.type,
        limit: input.limit,
      });

      const openDocuments: AssistantReceivableDocument[] = [];
      let matchedCount = 0;
      let invoicedDop = new Prisma.Decimal(0);
      let paidDop = new Prisma.Decimal(0);
      let balanceDop = new Prisma.Decimal(0);
      let invoicedUsd = new Prisma.Decimal(0);
      let paidUsd = new Prisma.Decimal(0);
      let balanceUsd = new Prisma.Decimal(0);

      for (const row of rows) {
        const payments = row.payments.filter(
          (payment) => payment.effectiveDate.getTime() <= asOf.getTime(),
        );
        const summary = summarizePayments(
          {
            status: row.status,
            gross: row.gross,
            dueDate: row.dueDate,
            payments,
          },
          asOf,
        );
        if (!summary.balance.greaterThan(0)) continue;
        if (
          summary.state !== 'PENDING' &&
          summary.state !== 'PARTIALLY_PAID' &&
          summary.state !== 'OVERDUE' &&
          summary.state !== 'PARTIALLY_PAID_OVERDUE'
        ) {
          continue;
        }
        if (
          input.overdue === true &&
          summary.state !== 'OVERDUE' &&
          summary.state !== 'PARTIALLY_PAID_OVERDUE'
        ) {
          continue;
        }

        matchedCount += 1;
        const invoiced = row.gross ?? new Prisma.Decimal(0);
        if (row.currency === 'USD') {
          invoicedUsd = invoicedUsd.plus(invoiced);
          paidUsd = paidUsd.plus(summary.paid);
          balanceUsd = balanceUsd.plus(summary.balance);
        } else {
          invoicedDop = invoicedDop.plus(invoiced);
          paidDop = paidDop.plus(summary.paid);
          balanceDop = balanceDop.plus(summary.balance);
        }

        if (openDocuments.length < input.limit) {
          openDocuments.push({
            id: row.id,
            status: row.status,
            number: row.number,
            conduceNumber: row.conduceNumber,
            currency: row.currency,
            fiscal: row.fiscal,
            confirmedAt: row.confirmedAt?.toISOString() ?? null,
            dueDate: row.dueDate ? databaseDateString(row.dueDate) : null,
            paymentState: summary.state,
            invoiced: moneyString(invoiced),
            paid: moneyString(summary.paid),
            balance: moneyString(summary.balance),
            customerId: row.customerId,
            customerName: row.customer.name,
            sellerUserId: row.confirmedByUserId,
            sellerName: row.confirmedByName,
            appPath: ASSISTANT_APP_PATHS.salesDocument(row.id),
          });
        }
      }

      return {
        aggregates: {
          documentCount: matchedCount,
          invoicedDop: moneyString(invoicedDop),
          paidDop: moneyString(paidDop),
          balanceDop: moneyString(balanceDop),
          invoicedUsd: moneyString(invoicedUsd),
          paidUsd: moneyString(paidUsd),
          balanceUsd: moneyString(balanceUsd),
        },
        documents: openDocuments,
        appPath: ASSISTANT_APP_PATHS.receivables,
        asOf: asOf.toISOString(),
        sourceKey: assistantToolSourceKey('getReceivablesSummary'),
      };
    });
  }
}
