import { Prisma } from '@prisma/client';

import {
  EXCHANGE_RATE_API_SOURCE,
  type FxRateLookupResult,
  type FxRateProvider,
} from '../../src/infrastructure/fx/index.js';

export function staticFxRateProvider(result: FxRateLookupResult): FxRateProvider {
  return {
    getUsdToDopRate: async () => result,
  };
}

export function successfulUsdDopRate(rate: string): FxRateLookupResult {
  return {
    ok: true,
    quote: {
      exchangeRateDopPerUsd: new Prisma.Decimal(rate),
      source: EXCHANGE_RATE_API_SOURCE,
      rateUpdatedAt: new Date('2026-09-08T00:00:00.000Z'),
      obtainedAt: new Date('2026-09-08T12:00:00.000Z'),
    },
  };
}
