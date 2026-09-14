import type { Currency } from './entities';
import type { InvoiceProfitabilityView, ProfitabilitySource } from './sales';

export type ProfitabilityChartPoint = {
  key: string;
  label: string;
  amount: number;
};

export type ProfitabilityCharts = {
  fromDay: string;
  toDay: string;
  profitByDay: ProfitabilityChartPoint[];
  profitByMonth: ProfitabilityChartPoint[];
  collectedByDay: ProfitabilityChartPoint[];
  collectedByMonth: ProfitabilityChartPoint[];
};

export type ProfitabilityInvoiceRow = {
  id: string;
  number: string;
  customerName: string;
  currency: Currency;
  total: number;
  /** Gross profit in pesos; USD invoices use stored FX. Null when unavailable or pending FX. */
  profit: number | null;
  pendingFx: boolean;
  source?: ProfitabilitySource;
  /** True when cost is unknown (or otherwise uncalculated) and FX is not pending. */
  canRecordManual: boolean;
  reason?: string;
  rateDopPerUsd?: number;
  href: string;
  confirmedAt: string | null;
};

export type ProfitabilitySnapshot = {
  fxAvailable: boolean;
  fxRateDopPerUsd: number;
  /** Gross profit in pesos, including USD invoices converted with their stored FX rate. */
  profitDop: number;
  /** Net receipts in pesos (USD uses the invoice's stored profitability rate). */
  collectedDop: number;
  pendingFxCount: number;
  invoicesMissingProfitCount: number;
  omittedUsdReceiptCount: number;
  charts: ProfitabilityCharts | null;
  invoices: ProfitabilityInvoiceRow[];
};

export type SetFxAvailableInput = {
  available: boolean;
};

export type RetryUsdProfitabilityInput = {
  invoiceId: string;
};

export type RetryUsdProfitabilityResult = {
  invoiceId: string;
  profitability: InvoiceProfitabilityView;
};

export type RecordManualGrossProfitInput = {
  invoiceId: string;
  /** Gross profit in pesos as judged by the administrator. */
  profitDop: number;
};
