import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prisma } from '../../infrastructure/database/index.js';
import type { MigrationReadiness } from './types.js';

type AppliedMigrationRow = {
  migration_name: string;
};

function resolveMigrationsDirectory(): string {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  // src/features/health or dist/features/health → apps/api/prisma/migrations
  return path.resolve(currentDirectory, '../../../prisma/migrations');
}

function listLocalMigrationNames(): string[] {
  const migrationsDirectory = resolveMigrationsDirectory();

  if (!fs.existsSync(migrationsDirectory)) {
    return [];
  }

  return fs
    .readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(migrationsDirectory, name, 'migration.sql')))
    .sort((left, right) => left.localeCompare(right));
}

export class HealthRepository {
  async checkDatabaseConnection(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('Error checking database connection:', error);
      return false;
    }
  }

  async checkMigrationsStatus(): Promise<MigrationReadiness> {
    try {
      const localMigrations = listLocalMigrationNames();

      // Missing or empty migrations artifact cannot prove schema is current.
      if (localMigrations.length === 0) {
        return 'unavailable';
      }

      const appliedRows = await prisma.$queryRaw<AppliedMigrationRow[]>`
        SELECT migration_name
        FROM _prisma_migrations
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      `;

      const appliedNames = new Set(appliedRows.map((row) => row.migration_name));
      const hasPending = localMigrations.some((name) => !appliedNames.has(name));

      return hasPending ? 'pending' : 'up_to_date';
    } catch {
      // Missing _prisma_migrations, permission errors, etc.
      return 'unavailable';
    }
  }
}
