import { describe, expect, it } from 'vitest';

import {
  APP_RELEASE_PATTERN,
  isTrustProxyEnabled,
  parseAllowedHosts,
  parseRuntimeConfig,
} from '../../../src/infrastructure/config/runtime-config.js';

const BASE_LOCAL = {
  APP_ENV: 'development',
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/solocamiones_dev',
  INITIAL_PASSWORD: 'local-initial-password',
  ASSISTANT_ENABLED: 'false',
} as const;

const BASE_DEPLOYED = {
  APP_ENV: 'staging',
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://runtime:secret@db:5432/solocamiones',
  INITIAL_PASSWORD: 'staging-initial-password',
  TRUST_PROXY: '1',
  ALLOWED_HOSTS: 'staging.solocamiones.com',
  CF_ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com',
  CF_ACCESS_AUD: 'staging-audience-uuid',
  APP_RELEASE: 'v2.0.0',
  METRICS_BEARER_TOKEN: 'metrics-token',
  ASSISTANT_ENABLED: 'false',
} as const;

describe('parseAllowedHosts', () => {
  it('parses comma-separated exact hosts and trims whitespace', () => {
    expect(parseAllowedHosts(' staging.solocamiones.com , app.solocamiones.com ')).toEqual([
      'staging.solocamiones.com',
      'app.solocamiones.com',
    ]);
  });

  it('rejects scheme or path entries', () => {
    expect(() => parseAllowedHosts('https://app.solocamiones.com')).toThrow(/exact Host/);
    expect(() => parseAllowedHosts('app.solocamiones.com/path')).toThrow(/exact Host/);
  });
});

describe('parseRuntimeConfig', () => {
  it('accepts a minimal local development configuration', () => {
    const config = parseRuntimeConfig({ ...BASE_LOCAL });
    expect(config.appEnv).toBe('development');
    expect(config.trustProxy).toBe(false);
    expect(config.allowedHosts).toEqual([]);
    expect(config.cloudflareAccess).toBeNull();
    expect(config.appRelease).toBeUndefined();
    expect(config.metricsBearerToken).toBeUndefined();
    expect(config.assistant.enabled).toBe(false);
  });

  it('requires deployed perimeter variables for staging', () => {
    const config = parseRuntimeConfig({ ...BASE_DEPLOYED });
    expect(config.appEnv).toBe('staging');
    expect(config.nodeEnv).toBe('production');
    expect(config.trustProxy).toBe(true);
    expect(config.allowedHosts).toEqual(['staging.solocamiones.com']);
    expect(config.cloudflareAccess).toEqual({
      teamDomain: 'example.cloudflareaccess.com',
      audience: 'staging-audience-uuid',
    });
    expect(config.appRelease).toBe('v2.0.0');
    expect(config.metricsBearerToken).toBe('metrics-token');
  });

  it('allows ASSISTANT_ENABLED=false as a kill switch in production', () => {
    const config = parseRuntimeConfig({
      ...BASE_DEPLOYED,
      APP_ENV: 'production',
      ALLOWED_HOSTS: 'app.solocamiones.com',
      CF_ACCESS_AUD: 'production-audience-uuid',
      ASSISTANT_ENABLED: 'false',
    });
    expect(config.assistant.enabled).toBe(false);
  });

  it('fails closed when staging omits Access, hosts, metrics, release, or trust proxy', () => {
    expect(() => parseRuntimeConfig({ ...BASE_DEPLOYED, TRUST_PROXY: '0' })).toThrow(/TRUST_PROXY/);
    expect(() => parseRuntimeConfig({ ...BASE_DEPLOYED, ALLOWED_HOSTS: '' })).toThrow(
      /ALLOWED_HOSTS/,
    );
    expect(() =>
      parseRuntimeConfig({ ...BASE_DEPLOYED, CF_ACCESS_TEAM_DOMAIN: undefined }),
    ).toThrow(/CF_ACCESS_TEAM_DOMAIN/);
    expect(() => parseRuntimeConfig({ ...BASE_DEPLOYED, CF_ACCESS_AUD: undefined })).toThrow(
      /CF_ACCESS_AUD/,
    );
    expect(() => parseRuntimeConfig({ ...BASE_DEPLOYED, APP_RELEASE: undefined })).toThrow(
      /APP_RELEASE/,
    );
    expect(() =>
      parseRuntimeConfig({ ...BASE_DEPLOYED, METRICS_BEARER_TOKEN: undefined }),
    ).toThrow(/METRICS_BEARER_TOKEN/);
  });

  it('rejects APP_ENV/NODE_ENV mismatches and invalid APP_RELEASE', () => {
    expect(() =>
      parseRuntimeConfig({ ...BASE_LOCAL, APP_ENV: 'staging', NODE_ENV: 'development' }),
    ).toThrow(/NODE_ENV must be production/);
    expect(() => parseRuntimeConfig({ ...BASE_DEPLOYED, APP_RELEASE: '2.0.0' })).toThrow(
      /APP_RELEASE/,
    );
    expect(APP_RELEASE_PATTERN.test('v2.0.0')).toBe(true);
    expect(isTrustProxyEnabled('1')).toBe(true);
    expect(isTrustProxyEnabled('0')).toBe(false);
  });

  it('still requires OpenAI credentials when the assistant is enabled', () => {
    expect(() =>
      parseRuntimeConfig({
        ...BASE_LOCAL,
        ASSISTANT_ENABLED: 'true',
      }),
    ).toThrow(/OPENAI_API_KEY/);
  });
});
