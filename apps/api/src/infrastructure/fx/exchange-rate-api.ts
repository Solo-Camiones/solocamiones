import { Prisma } from '@prisma/client';

import { logger } from '../logging/index.js';
import {
  EXCHANGE_RATE_API_BASE_URL,
  EXCHANGE_RATE_API_PAIR_PATH,
  EXCHANGE_RATE_API_SOURCE,
  EXCHANGE_RATE_API_TIMEOUT_MS,
  exchangeRateApiHistoryPath,
  isSameUtcCalendarDay,
} from './constants.js';
import type { FxRateLookupQuery, FxRateLookupResult, FxRateProvider, FxRateQuote } from './types.js';

type ExchangeRateApiClientOptions = {
  apiKey: string | undefined;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

type ExchangeRateApiPayload = {
  result?: unknown;
  'error-type'?: unknown;
  conversion_rate?: unknown;
  conversion_rates?: unknown;
  year?: unknown;
  month?: unknown;
  day?: unknown;
  time_last_update_unix?: unknown;
  time_last_update_utc?: unknown;
};

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

function redactSecret(text: string, secret: string): string {
  return text.split(secret).join('[Redacted]');
}

function asRecord(value: unknown): ExchangeRateApiPayload | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as ExchangeRateApiPayload;
}

function parsePositiveRate(value: unknown): Prisma.Decimal | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return new Prisma.Decimal(String(value));
  }
  if (typeof value === 'string') {
    try {
      const parsed = new Prisma.Decimal(value.trim());
      if (!parsed.isFinite() || parsed.lte(0)) return null;
      return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

function conversionRatesRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseHistoricalRateDate(payload: ExchangeRateApiPayload): Date | null {
  if (
    typeof payload.year !== 'number' ||
    typeof payload.month !== 'number' ||
    typeof payload.day !== 'number' ||
    !Number.isInteger(payload.year) ||
    !Number.isInteger(payload.month) ||
    !Number.isInteger(payload.day)
  ) {
    return null;
  }
  const parsed = new Date(Date.UTC(payload.year, payload.month - 1, payload.day));
  if (
    parsed.getUTCFullYear() !== payload.year ||
    parsed.getUTCMonth() + 1 !== payload.month ||
    parsed.getUTCDate() !== payload.day
  ) {
    return null;
  }
  return parsed;
}

function parseRateUpdatedAt(payload: ExchangeRateApiPayload): Date | null {
  if (typeof payload.time_last_update_unix === 'number' && Number.isFinite(payload.time_last_update_unix)) {
    return new Date(payload.time_last_update_unix * 1000);
  }
  if (typeof payload.time_last_update_utc === 'string') {
    const parsed = new Date(payload.time_last_update_utc);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export class ExchangeRateApiClient implements FxRateProvider {
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(options: ExchangeRateApiClientOptions) {
    this.apiKey = options.apiKey?.trim() || undefined;
    this.timeoutMs = options.timeoutMs ?? EXCHANGE_RATE_API_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async getUsdToDopRate(query?: FxRateLookupQuery): Promise<FxRateLookupResult> {
    if (!this.apiKey) {
      return { ok: false, reason: 'missing-api-key' };
    }

    // History is paid-plan-only and is for past calendar days. Same UTC day uses Pair:
    // that is today's published USD/DOP rate, not a later day's live rate.
    const asOf = query?.asOf;
    const historical = asOf != null && !isSameUtcCalendarDay(asOf, this.now());
    const path = historical ? exchangeRateApiHistoryPath(asOf) : EXCHANGE_RATE_API_PAIR_PATH;
    const url = `${EXCHANGE_RATE_API_BASE_URL}/${this.apiKey}/${path}`;
    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const payload = asRecord(await response.json());
      return this.parsePayload(payload, historical);
    } catch (error) {
      if (isTimeoutError(error)) {
        return { ok: false, reason: 'timeout' };
      }
      const message = error instanceof Error ? redactSecret(error.message, this.apiKey) : 'http-error';
      logger.warn({ reason: message }, 'ExchangeRate-API lookup failed');
      return { ok: false, reason: 'http-error' };
    }
  }

  private parsePayload(payload: ExchangeRateApiPayload | null, historical: boolean): FxRateLookupResult {
    if (payload == null) {
      return { ok: false, reason: 'invalid-payload' };
    }
    if (payload.result !== 'success') {
      const errorType = typeof payload['error-type'] === 'string' ? payload['error-type'] : 'error';
      return { ok: false, reason: errorType };
    }

    const rate = historical
      ? parsePositiveRate(conversionRatesRecord(payload.conversion_rates)?.DOP)
      : parsePositiveRate(payload.conversion_rate);
    const rateUpdatedAt = historical ? parseHistoricalRateDate(payload) : parseRateUpdatedAt(payload);
    if (rate == null || rateUpdatedAt == null) {
      return { ok: false, reason: 'invalid-payload' };
    }

    const quote: FxRateQuote = {
      exchangeRateDopPerUsd: rate,
      source: EXCHANGE_RATE_API_SOURCE,
      rateUpdatedAt,
      obtainedAt: this.now(),
    };
    return { ok: true, quote };
  }
}
