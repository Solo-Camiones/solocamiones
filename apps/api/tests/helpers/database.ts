import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

import { requireTestDatabaseUrl } from './environment.js';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prismaCli = path.join(apiRoot, 'node_modules', 'prisma', 'build', 'index.js');

export async function isDatabaseReachable(databaseUrl: string): Promise<boolean> {
  const probeClient = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    await probeClient.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probeClient.$disconnect();
  }
}

export function resetTestDatabase(
  databaseUrl: string,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (databaseUrl !== requireTestDatabaseUrl(environment)) {
    throw new Error('Test database reset must target DATABASE_URL_TEST.');
  }
  // Use the current Node binary and the local Prisma CLI so the reset does not
  // resolve `npx`/`prisma` through PATH (Sonar S4036).
  execFileSync(
    process.execPath,
    [prismaCli, 'migrate', 'reset', '--force', '--skip-generate'],
    {
      cwd: apiRoot,
      env: { ...environment, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    },
  );
}
