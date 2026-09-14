import { Prisma } from '@prisma/client';

import { AppError } from '../../../infrastructure/errors/app-error.js';

import { parseNonNegativeDecimal } from './parse.js';
import { COST_PROVENANCES, type AcquisitionCost, type CostProvenance, type MoneyInput } from './types.js';

/**
 * Cost is not used in ITBIS. This helper keeps UNKNOWN distinct from zero so
 * profitability never treats a missing cost as 0.
 */
export function normalizeAcquisitionCost(input: {
  provenance: CostProvenance;
  amount?: MoneyInput | null;
}): AcquisitionCost {
  if (!(COST_PROVENANCES as readonly string[]).includes(input.provenance)) {
    throw AppError.validation('Unknown cost provenance', {
      field: 'provenance',
      value: input.provenance,
    });
  }

  if (input.provenance === 'UNKNOWN') {
    return { amount: null, provenance: 'UNKNOWN' };
  }

  if (input.amount === null || input.amount === undefined) {
    throw AppError.validation('Acquisition cost amount is required when provenance is not UNKNOWN', {
      field: 'amount',
      provenance: input.provenance,
    });
  }

  return {
    amount: parseNonNegativeDecimal(input.amount, 'amount'),
    provenance: input.provenance,
  };
}

export function isUnknownCost(cost: AcquisitionCost): boolean {
  return cost.provenance === 'UNKNOWN' || cost.amount === null;
}

export function knownCostAmount(cost: AcquisitionCost): Prisma.Decimal | null {
  if (isUnknownCost(cost)) {
    return null;
  }

  return cost.amount;
}
