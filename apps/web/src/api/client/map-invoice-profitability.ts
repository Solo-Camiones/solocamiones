import type { InvoiceProfitabilityView, ProfitabilitySource } from '../contracts/sales';

export type ApiProfitability = {
  status: 'CALCULATED' | 'UNAVAILABLE' | 'MANUAL';
  reason: 'UNKNOWN_COST' | 'PENDING_FX_RATE' | null;
  profitDop: string | null;
  margin: string | null;
  fx?: {
    exchangeRateDopPerUsd: string;
    source: string;
    rateUpdatedAt: string;
    obtainedAt: string;
  };
};

const REASON_COPY = {
  PENDING_FX_RATE: 'Tasa de cambio no disponible para convertir la ganancia en dólares a pesos.',
  UNKNOWN_COST: 'Costo de adquisición desconocido en una o más líneas.',
  MANUAL: 'Ganancia bruta registrada por el administrador porque el costo no era calculable.',
} as const;

export function toInvoiceProfitabilityView(
  profitability: ApiProfitability,
): InvoiceProfitabilityView {
  const pendingFx = profitability.reason === 'PENDING_FX_RATE';
  const source: ProfitabilitySource | undefined =
    profitability.status === 'CALCULATED' || profitability.status === 'MANUAL'
      ? profitability.status
      : undefined;
  const profit =
    profitability.profitDop == null || profitability.profitDop === ''
      ? null
      : Number(profitability.profitDop);

  let reason: string | undefined;
  if (pendingFx) reason = REASON_COPY.PENDING_FX_RATE;
  else if (profit == null) reason = REASON_COPY.UNKNOWN_COST;
  else if (source === 'MANUAL') reason = REASON_COPY.MANUAL;

  const rate = profitability.fx?.exchangeRateDopPerUsd;
  return {
    currency: 'DOP',
    profit: profit == null || !Number.isFinite(profit) ? null : profit,
    pendingFx,
    ...(source ? { source } : {}),
    ...(reason ? { reason } : {}),
    ...(rate != null ? { rateDopPerUsd: Number(rate) } : {}),
    ...(profitability.fx?.source ? { rateSource: profitability.fx.source } : {}),
  };
}

export function canRecordManualGrossProfit(profitability: ApiProfitability): boolean {
  return (
    profitability.reason !== 'PENDING_FX_RATE' &&
    (profitability.status === 'UNAVAILABLE' || profitability.status === 'MANUAL')
  );
}
