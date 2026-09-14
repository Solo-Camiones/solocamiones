import type { Prisma } from '@prisma/client';

export type FxRateQuote = {
  exchangeRateDopPerUsd: Prisma.Decimal;
  source: string;
  rateUpdatedAt: Date;
  obtainedAt: Date;
};

export type FxRateLookupResult =
  | { ok: true; quote: FxRateQuote }
  | { ok: false; reason: string };

export type FxRateLookupQuery = {
  /** UTC instant whose calendar day selects the historical USD/DOP rate. */
  asOf?: Date;
};

export type FxRateProvider = {
  getUsdToDopRate(query?: FxRateLookupQuery): Promise<FxRateLookupResult>;
};
