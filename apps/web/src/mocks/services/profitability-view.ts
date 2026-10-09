import type { AppState, Invoice, User } from '../../api/contracts/entities';
import type { InvoiceProfitabilityView, ProfitabilitySource } from '../../api/contracts/sales';
import { can } from '../../shared/auth/policies';
import { invoiceProfitDop } from './gross-profit';
import { completedUsdProfitDop } from './usd-profitability';

/**
 * Gross profit the system can derive from selling price minus known/estimated cost.
 * Returns null when cost is unknown or USD FX is still pending.
 */
export function calculatedInvoiceProfitDop(invoice: Invoice, state: AppState): number | null {
  if (invoice.status !== 'COMPLETED' && invoice.status !== 'CONDUCE') {
    return null;
  }

  if (invoice.currency === 'USD') {
    return completedUsdProfitDop(invoice);
  }

  return invoiceProfitDop(invoice, state);
}

/**
 * Profit shown to the administrator: calculated value first, then a recorded judgment.
 */
export function reportedInvoiceProfitDop(invoice: Invoice, state: AppState): number | null {
  const calculated = calculatedInvoiceProfitDop(invoice, state);
  if (calculated != null) {
    return calculated;
  }

  if (
    (invoice.status !== 'COMPLETED' && invoice.status !== 'CONDUCE') ||
    invoice.profitabilityPendingFx === true
  ) {
    return null;
  }

  return invoice.manualGrossProfitDop ?? null;
}

export function canRecordManualGrossProfit(invoice: Invoice, state: AppState): boolean {
  return (
    (invoice.status === 'COMPLETED' || invoice.status === 'CONDUCE') &&
    invoice.profitabilityPendingFx !== true &&
    calculatedInvoiceProfitDop(invoice, state) == null
  );
}

function profitSource(
  calculated: number | null,
  reported: number | null,
): ProfitabilitySource | undefined {
  if (reported == null) {
    return undefined;
  }
  return calculated != null ? 'CALCULATED' : 'MANUAL';
}

/**
 * Administrator-only profitability projection shared by invoice detail and the profitability page.
 */
export function profitabilityForInvoice(
  state: AppState,
  invoice: Invoice,
  actor: User,
): InvoiceProfitabilityView | undefined {
  if (!can(actor, 'profit.view')) {
    return undefined;
  }

  if (
    invoice.status !== 'COMPLETED' &&
    invoice.status !== 'CONDUCE' &&
    invoice.status !== 'CANCELLED'
  ) {
    return undefined;
  }

  const pendingFx = invoice.currency === 'USD' && invoice.profitabilityPendingFx === true;
  const calculated = calculatedInvoiceProfitDop(invoice, state);
  const profit = reportedInvoiceProfitDop(invoice, state);
  const source = profitSource(calculated, profit);

  let reason: string | undefined;
  if (pendingFx) {
    reason = 'Tasa de cambio no disponible para convertir la ganancia en dólares a pesos.';
  } else if (profit == null) {
    reason = 'Costo de adquisición desconocido en una o más líneas.';
  } else if (source === 'MANUAL') {
    reason = 'Ganancia bruta registrada por el administrador porque el costo no era calculable.';
  }

  return {
    currency: 'DOP',
    profit,
    pendingFx,
    source,
    reason,
    rateDopPerUsd: invoice.fxRateDopPerUsd,
    rateSource: invoice.fxSource,
  };
}
