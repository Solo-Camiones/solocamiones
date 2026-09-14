import type { FxRateLookupResult, FxRateProvider } from './types.js';

export const UNAVAILABLE_FX_RATE_REASON = 'FX_RATE_UNAVAILABLE';

/** Test/default double: never calls the network and never invents a rate. */
export const unavailableFxRateProvider: FxRateProvider = {
  getUsdToDopRate(_query?: { asOf?: Date }): Promise<FxRateLookupResult> {
    return Promise.resolve({ ok: false, reason: UNAVAILABLE_FX_RATE_REASON });
  },
};
