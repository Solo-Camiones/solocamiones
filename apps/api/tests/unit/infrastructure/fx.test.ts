import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EXCHANGE_RATE_API_SOURCE,
  ExchangeRateApiClient,
} from '../../../src/infrastructure/fx/index.js';
import { logger } from '../../../src/infrastructure/logging/index.js';

const API_KEY = 'test-key-do-not-log';

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe('ExchangeRateApiClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads conversion_rate as DOP per 1 USD and does not persist the API key', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain(API_KEY);
      expect(String(url)).toContain('pair/USD/DOP');
      const rateUpdatedAt = new Date('2026-09-08T00:00:00.000Z');
      return jsonResponse({
        result: 'success',
        conversion_rate: 61.5,
        time_last_update_unix: Math.floor(rateUpdatedAt.getTime() / 1000),
        time_last_update_utc: 'Tue, 08 Sep 2026 00:00:00 +0000',
      });
    });
    const obtainedAt = new Date('2026-09-08T12:00:00.000Z');
    const client = new ExchangeRateApiClient({
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => obtainedAt,
    });

    const result = await client.getUsdToDopRate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.source).toBe(EXCHANGE_RATE_API_SOURCE);
    expect(result.quote.exchangeRateDopPerUsd.equals(new Prisma.Decimal('61.5'))).toBe(true);
    expect(result.quote.rateUpdatedAt.toISOString()).toBe('2026-09-08T00:00:00.000Z');
    expect(result.quote.obtainedAt).toBe(obtainedAt);
    expect(JSON.stringify(result.quote)).not.toContain(API_KEY);
  });

  it('returns unavailable for missing key, quota-reached, invalid-key, and invalid payload', async () => {
    const missing = await new ExchangeRateApiClient({ apiKey: undefined }).getUsdToDopRate();
    expect(missing).toEqual({ ok: false, reason: 'missing-api-key' });

    const quota = await new ExchangeRateApiClient({
      apiKey: API_KEY,
      fetchImpl: async () => jsonResponse({ result: 'error', 'error-type': 'quota-reached' }, false),
    }).getUsdToDopRate();
    expect(quota).toEqual({ ok: false, reason: 'quota-reached' });

    const invalidKey = await new ExchangeRateApiClient({
      apiKey: API_KEY,
      fetchImpl: async () => jsonResponse({ result: 'error', 'error-type': 'invalid-key' }, false),
    }).getUsdToDopRate();
    expect(invalidKey).toEqual({ ok: false, reason: 'invalid-key' });

    const invertedWouldBeWrong = await new ExchangeRateApiClient({
      apiKey: API_KEY,
      fetchImpl: async () =>
        jsonResponse({
          result: 'success',
          conversion_rate: 0,
          time_last_update_unix: 1_757_289_600,
        }),
    }).getUsdToDopRate();
    expect(invertedWouldBeWrong.ok).toBe(false);
  });

  it('maps a hung request to timeout without inventing a rate', async () => {
    const client = new ExchangeRateApiClient({
      apiKey: API_KEY,
      timeoutMs: 20,
      fetchImpl: async (_url, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('timeout');
            error.name = 'TimeoutError';
            reject(error);
          });
        }),
    });
    const result = await client.getUsdToDopRate();
    expect(result).toEqual({ ok: false, reason: 'timeout' });
  });

  it('reads historical conversion_rates.DOP for the UTC day and does not use pair/live', async () => {
    const asOf = new Date('2026-09-08T18:30:00.000Z');
    const fetchImpl = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain('history/USD/2026/9/8');
      expect(String(url)).not.toContain('pair/USD/DOP');
      return jsonResponse({
        result: 'success',
        year: 2026,
        month: 9,
        day: 8,
        base_code: 'USD',
        conversion_rates: { DOP: 61.5, EUR: 0.85 },
      });
    });
    const obtainedAt = new Date('2026-09-09T12:00:00.000Z');
    const client = new ExchangeRateApiClient({
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => obtainedAt,
    });

    const result = await client.getUsdToDopRate({ asOf });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.exchangeRateDopPerUsd.equals(new Prisma.Decimal('61.5'))).toBe(true);
    expect(result.quote.rateUpdatedAt.toISOString()).toBe('2026-09-08T00:00:00.000Z');
    expect(result.quote.obtainedAt).toBe(obtainedAt);
    expect(JSON.stringify(result.quote)).not.toContain(API_KEY);
  });

  it('uses Pair for the same UTC confirmation day instead of History', async () => {
    const asOf = new Date('2026-09-11T18:30:00.000Z');
    const fetchImpl = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain('pair/USD/DOP');
      expect(String(url)).not.toContain('/history/');
      return jsonResponse({
        result: 'success',
        conversion_rate: 61.5,
        time_last_update_unix: Math.floor(asOf.getTime() / 1000),
      });
    });
    const client = new ExchangeRateApiClient({
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => new Date('2026-09-11T20:00:00.000Z'),
    });

    const result = await client.getUsdToDopRate({ asOf });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.exchangeRateDopPerUsd.equals(new Prisma.Decimal('61.5'))).toBe(true);
  });

  it('does not persist a live conversion_rate when historical lookup is required', async () => {
    const client = new ExchangeRateApiClient({
      apiKey: API_KEY,
      now: () => new Date('2026-09-11T12:00:00.000Z'),
      fetchImpl: async () =>
        jsonResponse({
          result: 'success',
          conversion_rate: 99.99,
          time_last_update_unix: 1_757_289_600,
        }),
    });
    const result = await client.getUsdToDopRate({ asOf: new Date('2026-09-08T18:00:00.000Z') });
    expect(result).toEqual({ ok: false, reason: 'invalid-payload' });
  });

  it('maps plan-upgrade-required to unavailable without inventing a rate', async () => {
    const client = new ExchangeRateApiClient({
      apiKey: API_KEY,
      now: () => new Date('2026-09-11T12:00:00.000Z'),
      fetchImpl: async () =>
        jsonResponse({ result: 'error', 'error-type': 'plan-upgrade-required' }, false),
    });
    const result = await client.getUsdToDopRate({ asOf: new Date('2026-09-08T18:00:00.000Z') });
    expect(result).toEqual({ ok: false, reason: 'plan-upgrade-required' });
  });

  it.each([
    ['a numeric rate', 61.5],
    ['a trimmed decimal string', ' 61.5000 '],
  ])('accepts %s from the Pair response', async (_label, conversionRate) => {
    const client = new ExchangeRateApiClient({
      apiKey: API_KEY,
      now: () => new Date('2026-09-13T12:00:00.000Z'),
      fetchImpl: async () =>
        jsonResponse({
          result: 'success',
          conversion_rate: conversionRate,
          time_last_update_utc: 'Sun, 13 Sep 2026 00:00:00 +0000',
        }),
    });

    const result = await client.getUsdToDopRate();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.exchangeRateDopPerUsd.equals(new Prisma.Decimal('61.5'))).toBe(true);
    expect(result.quote.rateUpdatedAt.toISOString()).toBe('2026-09-13T00:00:00.000Z');
  });

  it.each([
    ['zero number', 0],
    ['negative number', -1],
    ['NaN number', Number.NaN],
    ['infinite number', Number.POSITIVE_INFINITY],
    ['zero string', '0'],
    ['negative string', '-1'],
    ['infinite string', 'Infinity'],
    ['blank string', '   '],
    ['non-decimal string', 'not-a-rate'],
    ['null', null],
  ])('rejects %s as a Pair conversion rate', async (_label, conversionRate) => {
    const client = new ExchangeRateApiClient({
      apiKey: API_KEY,
      fetchImpl: async () =>
        jsonResponse({
          result: 'success',
          conversion_rate: conversionRate,
          time_last_update_unix: 1_757_289_600,
        }),
    });

    await expect(client.getUsdToDopRate()).resolves.toEqual({
      ok: false,
      reason: 'invalid-payload',
    });
  });

  it.each([
    ['missing conversion_rates', undefined],
    ['null conversion_rates', null],
    ['array conversion_rates', []],
    ['missing DOP rate', { EUR: 0.85 }],
  ])('rejects historical payload with %s', async (_label, conversionRates) => {
    const client = new ExchangeRateApiClient({
      apiKey: API_KEY,
      now: () => new Date('2026-09-13T12:00:00.000Z'),
      fetchImpl: async () =>
        jsonResponse({
          result: 'success',
          year: 2026,
          month: 9,
          day: 8,
          conversion_rates: conversionRates,
        }),
    });

    await expect(
      client.getUsdToDopRate({ asOf: new Date('2026-09-08T12:00:00.000Z') }),
    ).resolves.toEqual({ ok: false, reason: 'invalid-payload' });
  });

  it.each([
    ['non-numeric year', { year: '2026', month: 9, day: 8 }],
    ['fractional month', { year: 2026, month: 9.5, day: 8 }],
    ['invalid calendar day', { year: 2026, month: 2, day: 31 }],
  ])('rejects a historical response with %s', async (_label, dateFields) => {
    const client = new ExchangeRateApiClient({
      apiKey: API_KEY,
      now: () => new Date('2026-09-13T12:00:00.000Z'),
      fetchImpl: async () =>
        jsonResponse({
          result: 'success',
          ...dateFields,
          conversion_rates: { DOP: '61.5' },
        }),
    });

    await expect(
      client.getUsdToDopRate({ asOf: new Date('2026-09-08T12:00:00.000Z') }),
    ).resolves.toEqual({ ok: false, reason: 'invalid-payload' });
  });

  it.each([
    ['infinite Unix timestamp', { time_last_update_unix: Number.POSITIVE_INFINITY }],
    ['invalid UTC timestamp', { time_last_update_utc: 'not-a-date' }],
    ['missing timestamps', {}],
  ])('rejects a Pair response with %s', async (_label, timestampFields) => {
    const client = new ExchangeRateApiClient({
      apiKey: API_KEY,
      fetchImpl: async () =>
        jsonResponse({ result: 'success', conversion_rate: 61.5, ...timestampFields }),
    });

    await expect(client.getUsdToDopRate()).resolves.toEqual({
      ok: false,
      reason: 'invalid-payload',
    });
  });

  it.each([
    ['null', null],
    ['array', []],
    ['primitive', 'success'],
  ])('rejects a %s top-level payload', async (_label, payload) => {
    const client = new ExchangeRateApiClient({
      apiKey: API_KEY,
      fetchImpl: async () => jsonResponse(payload),
    });

    await expect(client.getUsdToDopRate()).resolves.toEqual({
      ok: false,
      reason: 'invalid-payload',
    });
  });

  it('uses the generic provider error when error-type is not a string', async () => {
    const client = new ExchangeRateApiClient({
      apiKey: API_KEY,
      fetchImpl: async () => jsonResponse({ result: 'error', 'error-type': 429 }, false),
    });

    await expect(client.getUsdToDopRate()).resolves.toEqual({ ok: false, reason: 'error' });
  });

  it('redacts the API key from logged transport errors', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const client = new ExchangeRateApiClient({
      apiKey: API_KEY,
      fetchImpl: async () => {
        throw new Error(`request failed for ${API_KEY}`);
      },
    });

    await expect(client.getUsdToDopRate()).resolves.toEqual({
      ok: false,
      reason: 'http-error',
    });
    expect(warn).toHaveBeenCalledWith(
      { reason: 'request failed for [Redacted]' },
      'ExchangeRate-API lookup failed',
    );
  });

  it('maps a non-Error transport rejection without leaking its value', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const client = new ExchangeRateApiClient({
      apiKey: API_KEY,
      fetchImpl: async () => Promise.reject(API_KEY),
    });

    await expect(client.getUsdToDopRate()).resolves.toEqual({
      ok: false,
      reason: 'http-error',
    });
    expect(warn).toHaveBeenCalledWith(
      { reason: 'http-error' },
      'ExchangeRate-API lookup failed',
    );
  });
});
