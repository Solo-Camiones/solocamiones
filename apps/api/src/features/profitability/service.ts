import { AppError } from '../../infrastructure/errors/app-error.js';
import {
  unavailableFxRateProvider,
  type FxRateLookupResult,
  type FxRateProvider,
  type FxRateQuote,
} from '../../infrastructure/fx/index.js';
import { calculatedCompletedProfitability, roundMoney } from '../sales/money/index.js';
import { PROFITABILITY_REASONS } from '../sales/money/types.js';
import {
  toManualGrossProfitHistorySnapshot,
  toPublicInvoice,
  toUsdFxRetryHistorySnapshot,
} from '../sales/projection.js';
import { salesTransaction, type SalesTransaction } from '../sales/transaction.js';
import type { InvoiceRecord } from '../sales/types.js';
import { assertAdministrator } from '../users/policies.js';
import {
  CALCULATED_PROFIT_EXISTS_MESSAGE,
  COMPLETED_ONLY_MANUAL_PROFIT_MESSAGE,
  FX_RETRY_COMPLETED_USD_ONLY_MESSAGE,
  FX_RETRY_NOT_PENDING_MESSAGE,
  FX_RETRY_RATE_UNAVAILABLE_MESSAGE,
  PENDING_FX_MANUAL_PROFIT_MESSAGE,
} from './constants.js';
import { profitabilityInvoiceIdSchema, recordManualGrossProfitSchema } from './validation.js';

function assertPendingUsdFx(invoice: InvoiceRecord): Date {
  if (invoice.status !== 'COMPLETED' || invoice.currency !== 'USD') {
    throw AppError.conflict(FX_RETRY_COMPLETED_USD_ONLY_MESSAGE);
  }
  if (invoice.confirmedAt == null) {
    throw AppError.conflict(FX_RETRY_COMPLETED_USD_ONLY_MESSAGE);
  }
  if (invoice.exchangeRateDopPerUsd != null) {
    throw AppError.conflict(FX_RETRY_NOT_PENDING_MESSAGE);
  }
  return invoice.confirmedAt;
}

export class ProfitabilityService {
  constructor(
    private readonly transaction: SalesTransaction = salesTransaction,
    private readonly fxRateProvider: FxRateProvider = unavailableFxRateProvider,
  ) {}

  async recordManualGrossProfit(actorId: string, invoiceId: string, input: unknown) {
    profitabilityInvoiceIdSchema.parse({ invoiceId });
    const body = recordManualGrossProfitSchema.parse(input);
    const profitDop = roundMoney(body.profitDop);

    return this.transaction(async ({ sales, users, history }) => {
      const actor = await users.findById(actorId);
      assertAdministrator(actor);

      await sales.lockById(invoiceId);
      const existing = await sales.findById(invoiceId);
      if (!existing) throw AppError.notFound('Invoice not found');

      const calculated = calculatedCompletedProfitability({
        status: existing.status,
        currency: existing.currency,
        fiscal: existing.fiscal,
        lines: existing.lines.map((line) => ({
          type: line.type,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          gross: line.gross,
          acquisitionCostDop: line.acquisitionCostDop,
          costProvenance: line.costProvenance,
        })),
        exchangeRateDopPerUsd: existing.exchangeRateDopPerUsd,
      });
      if (calculated == null) throw AppError.conflict(COMPLETED_ONLY_MANUAL_PROFIT_MESSAGE);
      if (calculated.reason === PROFITABILITY_REASONS.PENDING_FX_RATE) {
        throw AppError.conflict(PENDING_FX_MANUAL_PROFIT_MESSAGE);
      }
      if (calculated.status !== 'UNAVAILABLE') {
        throw AppError.conflict(CALCULATED_PROFIT_EXISTS_MESSAGE);
      }

      const updated = await sales.recordManualGrossProfit({
        id: invoiceId,
        profitDop,
        recordedAt: new Date(),
      });
      await history.append({
        actor: { actorType: 'USER', actorUserId: actorId },
        subjectType: 'INVOICE',
        subjectId: invoiceId,
        eventType: 'INVOICE_GROSS_PROFIT_RECORDED',
        payload: toManualGrossProfitHistorySnapshot(existing.manualGrossProfitDop, profitDop),
      });
      return toPublicInvoice(updated, actor!);
    });
  }

  /**
   * Retry COST-003 for confirmedAt's UTC day. Past days use History; the same UTC day
   * uses Pair (that day's published rate). A later day's live rate is never stored.
   * FX stays outside sale mutation.
   */
  async retryUsdProfitability(actorId: string, invoiceId: string) {
    profitabilityInvoiceIdSchema.parse({ invoiceId });

    const pending = await this.transaction(async ({ sales, users }) => {
      const actor = await users.findById(actorId);
      assertAdministrator(actor);
      await sales.lockById(invoiceId);
      const existing = await sales.findById(invoiceId);
      if (!existing) throw AppError.notFound('Invoice not found');
      const confirmedAt = assertPendingUsdFx(existing);
      return { confirmedAt };
    });

    let lookup: FxRateLookupResult;
    try {
      lookup = await this.fxRateProvider.getUsdToDopRate({ asOf: pending.confirmedAt });
    } catch {
      lookup = { ok: false, reason: 'http-error' };
    }

    const committed = await this.transaction(async ({ sales, users, history }) => {
      const actor = await users.findById(actorId);
      assertAdministrator(actor);
      await sales.lockById(invoiceId);
      const existing = await sales.findById(invoiceId);
      if (!existing) throw AppError.notFound('Invoice not found');

      const appendRetry = async (outcome: 'RECORDED' | 'UNAVAILABLE', reason: string | null, quote: FxRateQuote | null) => {
        await history.append({
          actor: { actorType: 'USER', actorUserId: actorId },
          subjectType: 'INVOICE',
          subjectId: invoiceId,
          eventType: 'INVOICE_USD_FX_RETRIED',
          payload: toUsdFxRetryHistorySnapshot({
            outcome,
            reason,
            asOf: pending.confirmedAt,
            after: quote,
          }),
        });
      };

      if (existing.status !== 'COMPLETED' || existing.currency !== 'USD' || existing.confirmedAt == null) {
        await appendRetry('UNAVAILABLE', 'not-completed-usd', null);
        return { kind: 'conflict' as const, message: FX_RETRY_COMPLETED_USD_ONLY_MESSAGE };
      }
      if (existing.exchangeRateDopPerUsd != null) {
        await appendRetry('UNAVAILABLE', 'rate-already-recorded', null);
        return { kind: 'conflict' as const, message: FX_RETRY_NOT_PENDING_MESSAGE };
      }

      if (lookup.ok) {
        const persisted = await sales.recordUsdFxRate({
          id: invoiceId,
          exchangeRateDopPerUsd: lookup.quote.exchangeRateDopPerUsd,
          source: lookup.quote.source,
          rateUpdatedAt: lookup.quote.rateUpdatedAt,
          obtainedAt: lookup.quote.obtainedAt,
        });
        if (!persisted.recorded) {
          await appendRetry('UNAVAILABLE', 'rate-already-recorded', null);
          return { kind: 'conflict' as const, message: FX_RETRY_NOT_PENDING_MESSAGE };
        }
        await appendRetry('RECORDED', null, lookup.quote);
        return { kind: 'recorded' as const, invoice: persisted.invoice ?? existing, actor: actor! };
      }

      await appendRetry('UNAVAILABLE', lookup.reason, null);
      return { kind: 'conflict' as const, message: FX_RETRY_RATE_UNAVAILABLE_MESSAGE };
    });

    if (committed.kind === 'conflict') {
      throw AppError.conflict(committed.message);
    }
    return toPublicInvoice(committed.invoice, committed.actor);
  }
}
