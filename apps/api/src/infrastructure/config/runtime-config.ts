import { z } from 'zod';

import {
  parseAssistantConfig,
  type AssistantConfig,
} from '../openai/config.js';

export const APP_ENVIRONMENTS = ['development', 'test', 'staging', 'production'] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

const DEPLOYED_ENVIRONMENTS = new Set<AppEnvironment>(['staging', 'production']);

/** Matches release tags such as v2.0.0; avoids locking the binary to a single version string. */
export const APP_RELEASE_PATTERN = /^v\d+\.\d+\.\d+$/;

const DEFAULT_PORT = 3000;
const DEFAULT_LOG_LEVEL = 'info';

export type CloudflareAccessConfig = {
  teamDomain: string;
  audience: string;
};

export type RuntimeConfig = {
  appEnv: AppEnvironment;
  nodeEnv: string;
  port: number;
  logLevel: string;
  appRelease: string | undefined;
  databaseUrl: string;
  initialPassword: string;
  trustProxy: boolean;
  allowedHosts: string[];
  cloudflareAccess: CloudflareAccessConfig | null;
  metricsBearerToken: string | undefined;
  exchangeRateApiKey: string | undefined;
  assistant: AssistantConfig;
};

function optionalTrimmed(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function requireTrimmed(value: string | undefined, field: string): string {
  const trimmed = optionalTrimmed(value);
  if (trimmed == null) {
    throw new Error(`${field} is required`);
  }
  return trimmed;
}

function parseAppEnvironment(raw: string | undefined): AppEnvironment {
  const value = optionalTrimmed(raw);
  if (value == null) {
    throw new Error('APP_ENV is required (development | test | staging | production)');
  }

  const parsed = z.enum(APP_ENVIRONMENTS).safeParse(value);
  if (!parsed.success) {
    throw new Error('APP_ENV must be one of: development, test, staging, production');
  }
  return parsed.data;
}

function assertNodeEnvMatchesAppEnv(appEnv: AppEnvironment, nodeEnv: string | undefined): string {
  const resolved = optionalTrimmed(nodeEnv);
  if (appEnv === 'development') {
    if (resolved != null && resolved !== 'development') {
      throw new Error('NODE_ENV must be development when APP_ENV=development');
    }
    return resolved ?? 'development';
  }
  if (appEnv === 'test') {
    if (resolved !== 'test') {
      throw new Error('NODE_ENV must be test when APP_ENV=test');
    }
    return 'test';
  }
  if (resolved !== 'production') {
    throw new Error(`NODE_ENV must be production when APP_ENV=${appEnv}`);
  }
  return 'production';
}

export function isTrustProxyEnabled(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

export function parseAllowedHosts(raw: string | undefined): string[] {
  const present = optionalTrimmed(raw);
  if (present == null) return [];

  const hosts = present
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  for (const host of hosts) {
    if (host.includes('://') || host.includes('/') || host.includes(' ')) {
      throw new Error(
        'ALLOWED_HOSTS entries must be exact Host header values (no scheme, path, or spaces)',
      );
    }
  }

  return hosts;
}

function parsePort(raw: string | undefined): number {
  const present = optionalTrimmed(raw);
  if (present == null) return DEFAULT_PORT;
  const port = Number(present);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

function parseAppRelease(raw: string | undefined, deployed: boolean): string | undefined {
  const present = optionalTrimmed(raw);
  if (present == null) {
    if (deployed) {
      throw new Error('APP_RELEASE is required in staging and production (e.g. v2.0.0)');
    }
    return undefined;
  }
  if (!APP_RELEASE_PATTERN.test(present)) {
    throw new Error('APP_RELEASE must match vMAJOR.MINOR.PATCH (e.g. v2.0.0)');
  }
  return present;
}

/**
 * Central fail-closed environment contract for API boot.
 * Staging/production require perimeter and observability secrets; Assistant may stay disabled.
 */
export function parseRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const appEnv = parseAppEnvironment(environment.APP_ENV);
  const nodeEnv = assertNodeEnvMatchesAppEnv(appEnv, environment.NODE_ENV);
  const deployed = DEPLOYED_ENVIRONMENTS.has(appEnv);

  const trustProxy = isTrustProxyEnabled(environment.TRUST_PROXY);
  if (deployed && !trustProxy) {
    throw new Error('TRUST_PROXY must be 1 or true in staging and production');
  }

  const allowedHosts = parseAllowedHosts(environment.ALLOWED_HOSTS);
  if (deployed && allowedHosts.length === 0) {
    throw new Error('ALLOWED_HOSTS is required in staging and production');
  }

  let cloudflareAccess: CloudflareAccessConfig | null = null;
  if (deployed) {
    cloudflareAccess = {
      teamDomain: requireTrimmed(environment.CF_ACCESS_TEAM_DOMAIN, 'CF_ACCESS_TEAM_DOMAIN'),
      audience: requireTrimmed(environment.CF_ACCESS_AUD, 'CF_ACCESS_AUD'),
    };
  }

  const metricsBearerToken = optionalTrimmed(environment.METRICS_BEARER_TOKEN);
  if (deployed && metricsBearerToken == null) {
    throw new Error('METRICS_BEARER_TOKEN is required in staging and production');
  }

  return {
    appEnv,
    nodeEnv,
    port: parsePort(environment.PORT),
    logLevel: optionalTrimmed(environment.LOG_LEVEL) ?? DEFAULT_LOG_LEVEL,
    appRelease: parseAppRelease(environment.APP_RELEASE, deployed),
    databaseUrl: requireTrimmed(environment.DATABASE_URL, 'DATABASE_URL'),
    initialPassword: requireTrimmed(environment.INITIAL_PASSWORD, 'INITIAL_PASSWORD'),
    trustProxy,
    allowedHosts,
    cloudflareAccess,
    metricsBearerToken,
    exchangeRateApiKey: optionalTrimmed(environment.EXCHANGE_RATE_API_KEY),
    // Kill switch: ASSISTANT_ENABLED=false is valid even in staging/production.
    assistant: parseAssistantConfig(environment),
  };
}

export function isDeployedAppEnv(appEnv: AppEnvironment): boolean {
  return DEPLOYED_ENVIRONMENTS.has(appEnv);
}
