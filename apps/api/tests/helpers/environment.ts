import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

type TestEnvironment = Record<string, string | undefined>;

function databaseName(value: string, variable: string): string {
  try {
    const url = new URL(value);
    const name = decodeURIComponent(url.pathname.slice(1));
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !name) {
      throw new Error();
    }
    return name;
  } catch {
    // URL parsing errors may contain credentials; expose only the variable name.
    throw new Error(`${variable} must be a valid PostgreSQL URL with a database name.`);
  }
}

export function requireTestDatabaseUrl(environment: TestEnvironment = process.env): string {
  const testUrl = environment.DATABASE_URL_TEST;
  if (!testUrl?.trim()) {
    throw new Error('DATABASE_URL_TEST is required for PostgreSQL integration tests.');
  }
  databaseName(testUrl, 'DATABASE_URL_TEST');
  return testUrl;
}

export function configureTestDatabase(environment: TestEnvironment): void {
  const developmentUrl = environment.DATABASE_URL;
  // Remove the development fallback even if configuration validation fails.
  delete environment.DATABASE_URL;

  if (environment.DATABASE_URL_TEST === undefined) return;

  const testUrl = requireTestDatabaseUrl(environment);
  if (
    developmentUrl &&
    databaseName(developmentUrl, 'DATABASE_URL') === databaseName(testUrl, 'DATABASE_URL_TEST')
  ) {
    // Ignore credentials, host aliases and schemas: they do not prove isolation.
    throw new Error('DATABASE_URL_TEST must use a different database name from DATABASE_URL.');
  }
  environment.DATABASE_URL = testUrl;
}

export function loadTestEnvironment(
  monorepoRoot: string,
  environment: TestEnvironment = process.env,
): void {
  for (const candidate of [path.join(monorepoRoot, '.env'), path.join(monorepoRoot, '.env.test')]) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, quiet: true, processEnv: environment });
    }
  }
  // CI has no committed .env; user-creation tests still need a known initial credential.
  if (!environment.INITIAL_PASSWORD) {
    environment.INITIAL_PASSWORD = 'test-initial-password';
  }
  configureTestDatabase(environment);
}
