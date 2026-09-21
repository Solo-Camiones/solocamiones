import type { AppState, Invoice } from '../../api/contracts/entities';
import { DEMO_NOW_ISO } from '../data/demo-clock';
import { invoiceTotal, roundMoney } from './invoice-money';
import { lineCostDop } from './gross-profit';

export const DEMO_FX_SOURCE = 'DEMO_FX';

export type UsdProfitabilityOutcome =
  | 'CALCULATED'
  | 'PENDING_FX'
  | 'UNAVAILABLE_COST'
  | 'SKIPPED';

/**
 * Demo FX adapter — the live rate is never applied unless `fxAvailable` is on.
 * COST-003: missing rate must not invent a number or block the commercial sale.
 */
export function lookupDemoFxRate(
  state: AppState,
): { rate: number; source: string; at: string } | null {
  if (!state.fxAvailable) {
    return null;
  }

  return {
    rate: state.fxRateDopPerUsd,
    source: DEMO_FX_SOURCE,
    at: DEMO_NOW_ISO,
  };
}

/**
 * USD gross profit: costUsd = storedCostDop / exchangeRateDopPerUsd.
 * Returns null when any chargeable line has unknown cost.
 */
export function invoiceProfitUsd(
  invoice: Invoice,
  state: AppState,
  rateDopPerUsd: number,
): number | null {
  if (
    (invoice.status !== 'COMPLETED' && invoice.status !== 'CONDUCE') ||
    invoice.currency !== 'USD'
  ) {
    return null;
  }

  if (!(rateDopPerUsd > 0)) {
    return null;
  }

  let costUsd = 0;

  for (const line of invoice.lines) {
    const costDop = lineCostDop(line, state);
    if (costDop == null) {
      return null;
    }
    costUsd += roundMoney(costDop / rateDopPerUsd);
  }

  return roundMoney(invoiceTotal(invoice) - costUsd);
}

/**
 * Converts a USD invoice's stored gross profit into pesos using the rate captured at calculation time.
 * That DOP equivalent is what the profitability page and dashboard add to ganancia bruta.
 */
export function usdProfitToDop(profitUsd: number, rateDopPerUsd: number): number {
  return roundMoney(profitUsd * rateDopPerUsd);
}

/**
 * DOP-equivalent profit for a completed USD sale, or null when FX is pending or cost is unknown.
 */
export function completedUsdProfitDop(invoice: Invoice): number | null {
  if (
    (invoice.status !== 'COMPLETED' && invoice.status !== 'CONDUCE') ||
    invoice.currency !== 'USD'
  ) {
    return null;
  }

  if (invoice.profitabilityPendingFx === true) {
    return null;
  }

  if (invoice.profitabilityUsd == null || invoice.fxRateDopPerUsd == null) {
    return null;
  }

  return usdProfitToDop(invoice.profitabilityUsd, invoice.fxRateDopPerUsd);
}

function clearUsdProfit(invoice: Invoice): void {
  invoice.profitabilityUsd = null;
  delete invoice.fxRateDopPerUsd;
  delete invoice.fxSource;
  delete invoice.fxRateAt;
  delete invoice.fxCalculatedAt;
}

/**
 * Secondary enrichment after a valid USD sale. Never mutates payments, inventory, or FAC-.
 */
export function applyUsdProfitability(state: AppState, invoice: Invoice): UsdProfitabilityOutcome {
  if (invoice.currency !== 'USD' || (invoice.status !== 'COMPLETED' && invoice.status !== 'CONDUCE')) {
    return 'SKIPPED';
  }

  const fx = lookupDemoFxRate(state);
  if (!fx) {
    clearUsdProfit(invoice);
    invoice.profitabilityPendingFx = true;
    return 'PENDING_FX';
  }

  const profit = invoiceProfitUsd(invoice, state, fx.rate);
  if (profit == null) {
    clearUsdProfit(invoice);
    invoice.profitabilityPendingFx = false;
    return 'UNAVAILABLE_COST';
  }

  invoice.profitabilityUsd = profit;
  invoice.profitabilityPendingFx = false;
  invoice.fxRateDopPerUsd = fx.rate;
  invoice.fxSource = fx.source;
  invoice.fxRateAt = fx.at;
  invoice.fxCalculatedAt = DEMO_NOW_ISO;
  return 'CALCULATED';
}
