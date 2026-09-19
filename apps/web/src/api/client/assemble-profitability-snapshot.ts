import type {
  ProfitabilityInvoiceRow,
  ProfitabilitySnapshot,
} from '../contracts/profitability';
import {
  buildProfitabilitySeries,
  roundMoney,
  type PaymentCollectionMethod,
  type ProfitabilitySeriesInvoice,
} from './profitability-series';

export function toCollectionMethod(method: string): PaymentCollectionMethod | null {
  if (method === 'CASH' || method === 'TRANSFER' || method === 'CHECK') return method;
  return null;
}

export type AssembleProfitabilitySnapshotInput = {
  invoices: ProfitabilityInvoiceRow[];
  seriesInputs: readonly ProfitabilitySeriesInvoice[];
  outstanding: Pick<ProfitabilitySnapshot, 'outstandingDop' | 'outstandingUsd'>;
  fxAvailable?: boolean;
  fxRateDopPerUsd?: number;
};

/** Shared KPI + chart assembly for mock catalog and HTTP profitability clients. */
export function assembleProfitabilitySnapshot(
  input: AssembleProfitabilitySnapshotInput,
): ProfitabilitySnapshot {
  const invoices = [...input.invoices].sort((left, right) =>
    left.number.localeCompare(right.number, 'es'),
  );
  const series = buildProfitabilitySeries(input.seriesInputs);

  return {
    fxAvailable: input.fxAvailable ?? false,
    fxRateDopPerUsd: input.fxRateDopPerUsd ?? 0,
    profitDop: roundMoney(
      invoices
        .filter((row) => row.profit != null && !row.pendingFx)
        .reduce((sum, row) => sum + (row.profit ?? 0), 0),
    ),
    collectedDop: series.collectedDop,
    outstandingDop: input.outstanding.outstandingDop,
    outstandingUsd: input.outstanding.outstandingUsd,
    pendingFxCount: invoices.filter((row) => row.pendingFx).length,
    invoicesMissingProfitCount: series.invoicesMissingProfitCount,
    omittedUsdReceiptCount: series.omittedUsdReceiptCount,
    charts: series.charts,
    invoices,
  };
}
