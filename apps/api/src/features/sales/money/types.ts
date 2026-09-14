import type { Prisma } from '@prisma/client';

export const INVOICE_LINE_TYPES = [
  'GENERIC',
  'SERVICE',
  'DELIVERY',
  'EXTERNAL',
  'ITEM',
  'QTY',
] as const;

export type InvoiceLineType = (typeof INVOICE_LINE_TYPES)[number];

export type MoneyInput = Prisma.Decimal | string;

export type LineMoneyInput = {
  type: InvoiceLineType;
  unitPrice: MoneyInput;
  quantity?: MoneyInput;
  fiscal: boolean;
};

export type LineMoney = {
  gross: Prisma.Decimal;
  base: Prisma.Decimal;
  itbis: Prisma.Decimal;
  taxable: boolean;
};

export type RoundedLineMoney = {
  gross: Prisma.Decimal;
  base: Prisma.Decimal;
  itbis: Prisma.Decimal;
};

export type InvoiceMoneyTotals = RoundedLineMoney;

export const COST_PROVENANCES = ['ACTUAL', 'ESTIMATED', 'UNKNOWN'] as const;

export type CostProvenance = (typeof COST_PROVENANCES)[number];

/**
 * Acquisition cost in DOP. UNKNOWN is a first-class state: `amount` is null
 * and must never be treated as zero.
 */
export type AcquisitionCost = {
  amount: Prisma.Decimal | null;
  provenance: CostProvenance;
};

export const PROFITABILITY_STATUSES = ['CALCULATED', 'UNAVAILABLE', 'MANUAL'] as const;
export type ProfitabilityStatus = (typeof PROFITABILITY_STATUSES)[number];

export const PROFITABILITY_REASONS = {
  UNKNOWN_COST: 'UNKNOWN_COST',
  PENDING_FX_RATE: 'PENDING_FX_RATE',
} as const;

export type ProfitabilityReason =
  (typeof PROFITABILITY_REASONS)[keyof typeof PROFITABILITY_REASONS];

export type Profitability = {
  status: ProfitabilityStatus;
  reason: ProfitabilityReason | null;
  profitDop: Prisma.Decimal | null;
  margin: Prisma.Decimal | null;
};

export type LineProfitInput = {
  type: InvoiceLineType;
  unitPrice: MoneyInput;
  quantity: MoneyInput;
  gross: Prisma.Decimal | null;
  acquisitionCostDop: Prisma.Decimal | null;
  costProvenance: CostProvenance | null;
};
