import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

/**
 * Staging/production must receive injected env only.
 * Never silently fall back to a local .env on a deployed host.
 */
export function shouldLoadDotenvFile(environment: NodeJS.ProcessEnv = process.env): boolean {
  const appEnv = environment.APP_ENV?.trim().toLowerCase();
  if (appEnv === 'staging' || appEnv === 'production') {
    return false;
  }
  if (environment.NODE_ENV === 'production') {
    return false;
  }
  return true;
}

function resolveEnvFilePath(): string | undefined {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '../../.env'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../.env'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

export function loadEnvFiles(environment: NodeJS.ProcessEnv = process.env): void {
  if (!shouldLoadDotenvFile(environment)) {
    return;
  }

  const envFilePath = resolveEnvFilePath();
  if (envFilePath) {
    dotenv.config({ path: envFilePath, quiet: true, processEnv: environment });
  } else {
    dotenv.config({ quiet: true, processEnv: environment });
  }
}

loadEnvFiles();
