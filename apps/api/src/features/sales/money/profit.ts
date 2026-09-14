import { Prisma } from '@prisma/client';

import { calculateLineMoney } from './line.js';
import { parseDecimal } from './parse.js';
import { roundMoney } from './round.js';
import {
  PROFITABILITY_REASONS,
  type InvoiceLineType,
  type LineProfitInput,
  type Profitability,
} from './types.js';

const NO_COGS_LINE_TYPES = new Set<InvoiceLineType>(['SERVICE', 'DELIVERY']);

const UNAVAILABLE_UNKNOWN_COST: Profitability = {
  status: 'UNAVAILABLE',
  reason: PROFITABILITY_REASONS.UNKNOWN_COST,
  profitDop: null,
  margin: null,
};

const UNAVAILABLE_PENDING_FX: Profitability = {
  status: 'UNAVAILABLE',
  reason: PROFITABILITY_REASONS.PENDING_FX_RATE,
  profitDop: null,
  margin: null,
};

function percentOf(profit: Prisma.Decimal, sellingPrice: Prisma.Decimal): Prisma.Decimal | null {
  if (sellingPrice.isZero()) return null;
  return roundMoney(profit.div(sellingPrice).times(100));
}

function calculated(profit: Prisma.Decimal, sellingPrice: Prisma.Decimal): Profitability {
  return {
    status: 'CALCULATED',
    reason: null,
    profitDop: roundMoney(profit),
    margin: percentOf(profit, sellingPrice),
  };
}

export function sellingPriceOf(line: LineProfitInput, fiscal: boolean): Prisma.Decimal {
  if (line.gross != null) return line.gross;
  return calculateLineMoney({
    type: line.type,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    fiscal,
  }).gross;
}

/**
 * Gross profit in DOP: selling price (line gross) minus known acquisition cost.
 * SERVICE/DELIVERY have no COGS, so the selling price is the profit.
 * UNKNOWN cost is never treated as zero.
 */
export function calculateLineProfitDop(line: LineProfitInput, fiscal: boolean): Profitability {
  const sellingPrice = sellingPriceOf(line, fiscal);

  if (NO_COGS_LINE_TYPES.has(line.type)) {
    return calculated(sellingPrice, sellingPrice);
  }

  if (line.costProvenance === 'UNKNOWN' || line.acquisitionCostDop == null) {
    return UNAVAILABLE_UNKNOWN_COST;
  }

  return calculated(sellingPrice.minus(line.acquisitionCostDop), sellingPrice);
}

function usdCostBasis(line: LineProfitInput, rate: Prisma.Decimal): Prisma.Decimal | null {
  if (NO_COGS_LINE_TYPES.has(line.type)) return new Prisma.Decimal(0);
  if (line.costProvenance === 'UNKNOWN' || line.acquisitionCostDop == null) return null;
  return parseDecimal(line.acquisitionCostDop, 'acquisitionCostDop').div(rate);
}

/**
 * USD invoice: convert stored DOP cost with exchangeRateDopPerUsd, then report profit in DOP.
 * costUsd = storedCostDop / rate; profitUsd = priceUsd - costUsd; profitDop = profitUsd * rate.
 */
export function calculateLineUsdProfitBreakdown(
  line: LineProfitInput,
  fiscal: boolean,
  exchangeRateDopPerUsd: Prisma.Decimal,
): { profitability: Profitability; sellingPrice: Prisma.Decimal; profitUsd: Prisma.Decimal | null } {
  const sellingPriceUsd = sellingPriceOf(line, fiscal);
  const costUsd = usdCostBasis(line, exchangeRateDopPerUsd);
  if (costUsd == null) {
    return {
      profitability: UNAVAILABLE_UNKNOWN_COST,
      sellingPrice: sellingPriceUsd,
      profitUsd: null,
    };
  }

  const profitUsd = sellingPriceUsd.minus(costUsd);
  return {
    profitability: {
      status: 'CALCULATED',
      reason: null,
      profitDop: roundMoney(profitUsd.times(exchangeRateDopPerUsd)),
      margin: percentOf(profitUsd, sellingPriceUsd),
    },
    sellingPrice: sellingPriceUsd,
    profitUsd,
  };
}

export function calculateLineProfitUsdReportingDop(
  line: LineProfitInput,
  fiscal: boolean,
  exchangeRateDopPerUsd: Prisma.Decimal,
): Profitability {
  return calculateLineUsdProfitBreakdown(line, fiscal, exchangeRateDopPerUsd).profitability;
}

function isPositiveRate(rate: Prisma.Decimal | null | undefined): rate is Prisma.Decimal {
  return rate != null && rate.isFinite() && rate.gt(0);
}

export function pendingFxProfitability(): Profitability {
  return UNAVAILABLE_PENDING_FX;
}

export function manualProfitability(
  profitDop: Prisma.Decimal,
  sellingPrice: Prisma.Decimal,
): Profitability {
  const rounded = roundMoney(profitDop);
  return {
    status: 'MANUAL',
    reason: null,
    profitDop: rounded,
    margin: percentOf(rounded, sellingPrice),
  };
}

export function calculatedCompletedProfitability(
  invoice: {
    status: string;
    currency: string;
    fiscal: boolean;
    lines: readonly LineProfitInput[];
    exchangeRateDopPerUsd?: Prisma.Decimal | null;
  },
): Profitability | null {
  if (invoice.status !== 'COMPLETED') return null;
  if (invoice.currency === 'USD') {
    if (!isPositiveRate(invoice.exchangeRateDopPerUsd)) return pendingFxProfitability();
    const rate = invoice.exchangeRateDopPerUsd;
    const lineResults = invoice.lines.map((line) =>
      calculateLineUsdProfitBreakdown(line, invoice.fiscal, rate),
    );
    return sumUsdReportedProfit(lineResults);
  }

  const lineResults = invoice.lines.map((line) => ({
    profitability: calculateLineProfitDop(line, invoice.fiscal),
    sellingPrice: sellingPriceOf(line, invoice.fiscal),
  }));
  return sumCalculatedProfit(lineResults);
}

/**
 * Calculated COST-003 wins over a recorded amount. Pending FX stays pending.
 * MANUAL is only the invoice-level fallback when cost is unknown.
 */
export function reportedInvoiceProfitability(
  calculated: Profitability | null,
  manualGrossProfitDop: Prisma.Decimal | null,
  sellingPrice: Prisma.Decimal,
): Profitability | null {
  if (calculated == null) return null;
  if (calculated.status === 'CALCULATED') return calculated;
  if (calculated.reason === PROFITABILITY_REASONS.PENDING_FX_RATE) return calculated;
  if (manualGrossProfitDop == null) return calculated;
  return manualProfitability(manualGrossProfitDop, sellingPrice);
}

export function sumCalculatedProfit(
  lines: readonly { profitability: Profitability; sellingPrice: Prisma.Decimal }[],
): Profitability {
  // A partial subtotal would misrepresent the profitability of the complete sale.
  const unavailableLine = lines.find((line) => line.profitability.status === 'UNAVAILABLE');
  if (unavailableLine) return unavailableLine.profitability;

  const calculatedLines = lines.filter(
    (line) => line.profitability.status === 'CALCULATED' && line.profitability.profitDop != null,
  );
  if (calculatedLines.length === 0) return UNAVAILABLE_UNKNOWN_COST;

  const profitDop = calculatedLines.reduce(
    (total, line) => total.plus(line.profitability.profitDop as Prisma.Decimal),
    new Prisma.Decimal(0),
  );
  const sellingPrice = calculatedLines.reduce(
    (total, line) => total.plus(line.sellingPrice),
    new Prisma.Decimal(0),
  );
  return calculated(profitDop, sellingPrice);
}

function sumUsdReportedProfit(
  lines: readonly {
    profitability: Profitability;
    sellingPrice: Prisma.Decimal;
    profitUsd: Prisma.Decimal | null;
  }[],
): Profitability {
  const unavailableLine = lines.find((line) => line.profitability.status === 'UNAVAILABLE');
  if (unavailableLine) return unavailableLine.profitability;

  const calculatedLines = lines.filter(
    (line) =>
      line.profitability.status === 'CALCULATED' &&
      line.profitability.profitDop != null &&
      line.profitUsd != null,
  );
  if (calculatedLines.length === 0) return UNAVAILABLE_UNKNOWN_COST;

  const profitDop = calculatedLines.reduce(
    (total, line) => total.plus(line.profitability.profitDop as Prisma.Decimal),
    new Prisma.Decimal(0),
  );
  const sellingPriceUsd = calculatedLines.reduce(
    (total, line) => total.plus(line.sellingPrice),
    new Prisma.Decimal(0),
  );
  const profitUsd = calculatedLines.reduce(
    (total, line) => total.plus(line.profitUsd as Prisma.Decimal),
    new Prisma.Decimal(0),
  );
  return {
    status: 'CALCULATED',
    reason: null,
    profitDop: roundMoney(profitDop),
    margin: percentOf(profitUsd, sellingPriceUsd),
  };
}
