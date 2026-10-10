import { describe, expect, it, vi } from 'vitest';

import {
  isOriginJwtBypassEnabled,
  warnIfOriginJwtBypassEnabled,
} from '../../../src/infrastructure/config/origin-jwt-bypass-warning.js';

const ACCESS_ENABLED = {
  teamDomain: 'example.cloudflareaccess.com',
  audience: 'aud-1',
  requireOriginJwt: true,
} as const;

const ACCESS_BYPASS = {
  ...ACCESS_ENABLED,
  requireOriginJwt: false,
} as const;

describe('isOriginJwtBypassEnabled', () => {
  it('is true only for deployed envs with Access loaded and requireOriginJwt false', () => {
    expect(
      isOriginJwtBypassEnabled({
        appEnv: 'staging',
        appRelease: 'v2.0.0',
        cloudflareAccess: ACCESS_BYPASS,
      }),
    ).toBe(true);
    expect(
      isOriginJwtBypassEnabled({
        appEnv: 'production',
        appRelease: 'v2.0.0',
        cloudflareAccess: ACCESS_BYPASS,
      }),
    ).toBe(true);
  });

  it('is false for local/test, missing Access, or requireOriginJwt true', () => {
    expect(
      isOriginJwtBypassEnabled({
        appEnv: 'development',
        appRelease: undefined,
        cloudflareAccess: ACCESS_BYPASS,
      }),
    ).toBe(false);
    expect(
      isOriginJwtBypassEnabled({
        appEnv: 'test',
        appRelease: undefined,
        cloudflareAccess: ACCESS_BYPASS,
      }),
    ).toBe(false);
    expect(
      isOriginJwtBypassEnabled({
        appEnv: 'staging',
        appRelease: 'v2.0.0',
        cloudflareAccess: null,
      }),
    ).toBe(false);
    expect(
      isOriginJwtBypassEnabled({
        appEnv: 'staging',
        appRelease: 'v2.0.0',
        cloudflareAccess: ACCESS_ENABLED,
      }),
    ).toBe(false);
  });
});

describe('warnIfOriginJwtBypassEnabled', () => {
  it('logs a warning with appEnv and release when bypass is active', () => {
    const warn = vi.fn();

    warnIfOriginJwtBypassEnabled(
      {
        appEnv: 'staging',
        appRelease: 'v2.0.0',
        cloudflareAccess: ACCESS_BYPASS,
      },
      { warn },
    );

    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      { appEnv: 'staging', release: 'v2.0.0' },
      expect.stringContaining('CF_ACCESS_REQUIRE_ORIGIN_JWT=false'),
    );
  });

  it('does not log when bypass is not active', () => {
    const warn = vi.fn();

    warnIfOriginJwtBypassEnabled(
      {
        appEnv: 'staging',
        appRelease: 'v2.0.0',
        cloudflareAccess: ACCESS_ENABLED,
      },
      { warn },
    );
    warnIfOriginJwtBypassEnabled(
      {
        appEnv: 'development',
        appRelease: undefined,
        cloudflareAccess: null,
      },
      { warn },
    );

    expect(warn).not.toHaveBeenCalled();
  });
});
