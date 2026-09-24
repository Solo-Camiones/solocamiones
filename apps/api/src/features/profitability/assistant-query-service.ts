import { Prisma } from '@prisma/client';

import {
  ASSISTANT_APP_PATHS,
  assistantToolSourceKey,
} from '../assistant/tools/constants.js';
import type { GetProfitabilitySummaryInput } from '../assistant/tools/schemas.js';
import type { AssistantToolMeta } from '../assistant/tools/types.js';
import { moneyString } from '../payments/receivables.js';
import { summarizePayments } from '../payments/summary.js';
import {
  calculatedCompletedProfitability,
  reportedInvoiceProfitability,
  roundMoney,
  sellingPriceOf,
  type CostProvenance,
  type InvoiceLineType,
  type LineProfitInput,
} from '../sales/money/index.js';
import { PROFITABILITY_REASONS } from '../sales/money/types.js';
import { salesTransaction, type SalesTransaction } from '../sales/transaction.js';
import { assertAdministrator } from '../users/policies.js';

export type AssistantProfitabilitySummary = AssistantToolMeta & {
  dateFrom: string;
  dateTo: string;
  currency: 'DOP' | 'USD';
  profitDop: string;
  collectedDop: string;
  outstandingDop: string;
  outstandingUsd: string;
  pendingFxCount: number;
  invoicesMissingProfitCount: number;
  omittedUsdReceiptCount: number;
  appPath: string;
};

function toLineProfitInput(line: {
  type: string;
  unitPrice: Prisma.Decimal;
  quantity: Prisma.Decimal;
  gross: Prisma.Decimal | null;
  base: Prisma.Decimal | null;
  acquisitionCostDop: Prisma.Decimal | null;
  costProvenance: string | null;
}): LineProfitInput {
  return {
    type: line.type as InvoiceLineType,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    gross: line.gross,
    base: line.base,
    acquisitionCostDop: line.acquisitionCostDop,
    costProvenance: line.costProvenance as CostProvenance | null,
  };
}

function invoiceSellingPriceDop(invoice: {
  currency: string;
  applyItbis: boolean;
  exchangeRateDopPerUsd: Prisma.Decimal | null;
  lines: Array<{
    type: string;
    unitPrice: Prisma.Decimal;
    quantity: Prisma.Decimal;
    gross: Prisma.Decimal | null;
    base: Prisma.Decimal | null;
    acquisitionCostDop: Prisma.Decimal | null;
    costProvenance: string | null;
  }>;
}): Prisma.Decimal {
  return invoice.lines.reduce((sum, line) => {
    const input = toLineProfitInput(line);
    const selling = sellingPriceOf(input, invoice.applyItbis);
    if (invoice.currency !== 'USD' || invoice.exchangeRateDopPerUsd == null) {
      return sum.plus(selling);
    }
    return sum.plus(selling.times(invoice.exchangeRateDopPerUsd));
  }, new Prisma.Decimal(0));
}

function toDopAmount(
  currency: 'DOP' | 'USD',
  amount: Prisma.Decimal,
  rate: Prisma.Decimal | null,
  pendingFx: boolean,
): { amount: Prisma.Decimal } | 'omit' {
  if (currency === 'DOP') return { amount };
  if (pendingFx || rate == null || !rate.greaterThan(0)) return 'omit';
  return { amount: amount.times(rate) };
}

export class ProfitabilityAssistantQueryService {
  constructor(private readonly transaction: SalesTransaction = salesTransaction) {}

  async getSummary(
    actorId: string,
    input: GetProfitabilitySummaryInput,
    now = new Date(),
  ): Promise<AssistantProfitabilitySummary> {
    return this.transaction(async ({ sales, users }) => {
      assertAdministrator(await users.findById(actorId));

      const invoices = await sales.listRecognizedSalesForAssistantProfitability({
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        currency: input.currency,
      });

      let profitDop = new Prisma.Decimal(0);
      let collectedDop = new Prisma.Decimal(0);
      let pendingFxCount = 0;
      let invoicesMissingProfitCount = 0;
      let omittedUsdReceiptCount = 0;

      for (const invoice of invoices) {
        const lineInputs = invoice.lines.map(toLineProfitInput);
        const calculated = calculatedCompletedProfitability({
          status: invoice.status,
          currency: invoice.currency,
          applyItbis: invoice.applyItbis,
          lines: lineInputs,
          exchangeRateDopPerUsd: invoice.exchangeRateDopPerUsd,
        });
        const reported = reportedInvoiceProfitability(
          calculated,
          invoice.manualGrossProfitDop,
          invoiceSellingPriceDop(invoice),
        );

        const pendingFx = reported?.reason === PROFITABILITY_REASONS.PENDING_FX_RATE;
        if (pendingFx) pendingFxCount += 1;
        if (reported == null || reported.status === 'UNAVAILABLE' || reported.profitDop == null) {
          if (!pendingFx) invoicesMissingProfitCount += 1;
        } else if (!pendingFx) {
          profitDop = profitDop.plus(reported.profitDop);
        }

        for (const payment of invoice.payments) {
          const signed =
            payment.kind === 'REFUND' ? payment.amount.negated() : payment.amount;
          const converted = toDopAmount(
            invoice.currency,
            signed,
            invoice.exchangeRateDopPerUsd,
            pendingFx,
          );
          if (converted === 'omit') {
            omittedUsdReceiptCount += 1;
            continue;
          }
          collectedDop = collectedDop.plus(converted.amount);
        }
      }

      const openRows = await sales.listOpenReceivableBalancesForAssistant();
      let outstandingDop = new Prisma.Decimal(0);
      let outstandingUsd = new Prisma.Decimal(0);
      for (const row of openRows) {
        const summary = summarizePayments(row, now);
        if (!summary.balance.greaterThan(0)) continue;
        if (row.currency === 'USD') {
          outstandingUsd = outstandingUsd.plus(summary.balance);
        } else {
          outstandingDop = outstandingDop.plus(summary.balance);
        }
      }

      return {
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        currency: input.currency,
        profitDop: moneyString(roundMoney(profitDop)),
        collectedDop: moneyString(roundMoney(collectedDop)),
        outstandingDop: moneyString(roundMoney(outstandingDop)),
        outstandingUsd: moneyString(roundMoney(outstandingUsd)),
        pendingFxCount,
        invoicesMissingProfitCount,
        omittedUsdReceiptCount,
        appPath: ASSISTANT_APP_PATHS.profitability,
        asOf: now.toISOString(),
        sourceKey: assistantToolSourceKey('getProfitabilitySummary'),
      };
    });
  }
}
