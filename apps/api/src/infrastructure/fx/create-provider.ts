import { EXCHANGE_RATE_API_KEY_ENV } from './constants.js';
import { ExchangeRateApiClient } from './exchange-rate-api.js';
import type { FxRateProvider } from './types.js';
import { unavailableFxRateProvider } from './unavailable-provider.js';

export function createFxRateProvider(environment: NodeJS.ProcessEnv = process.env): FxRateProvider {
  if (environment.NODE_ENV === 'test') {
    return unavailableFxRateProvider;
  }
  return new ExchangeRateApiClient({ apiKey: environment[EXCHANGE_RATE_API_KEY_ENV] });
}
