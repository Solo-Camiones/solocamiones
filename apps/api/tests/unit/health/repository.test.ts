import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaQueryRaw = vi.fn();

vi.mock('../../../src/infrastructure/database/index.js', () => ({
  prisma: {
    $queryRaw: prismaQueryRaw,
  },
  disconnectPrisma: vi.fn(),
}));

function mockMigrationDirectories(names: string[]): void {
  vi.spyOn(fs, 'readdirSync').mockImplementation(((
    _path: fs.PathLike,
    options?: { encoding?: BufferEncoding | null; withFileTypes?: boolean },
  ) => {
    if (options?.withFileTypes) {
      return names.map((name) => ({
        name,
        isDirectory: () => true,
        isFile: () => false,
      }));
    }

    return names;
  }) as typeof fs.readdirSync);
}

const { HealthRepository } = await import('../../../src/features/health/repository.js');

describe('HealthRepository', () => {
  const repository = new HealthRepository();

  beforeEach(() => {
    vi.restoreAllMocks();
    prismaQueryRaw.mockReset();
  });

  describe('checkMigrationsStatus', () => {
    it('returns unavailable when the local migrations artifact is missing or empty', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      await expect(repository.checkMigrationsStatus()).resolves.toBe('unavailable');
      expect(prismaQueryRaw).not.toHaveBeenCalled();
    });

    it('returns pending when local migrations exist but are not all applied', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((target) => {
        const normalizedPath = String(target).replace(/\\/g, '/');
        return (
          normalizedPath.endsWith('/prisma/migrations') || normalizedPath.endsWith('/migration.sql')
        );
      });
      mockMigrationDirectories(['20260826000000_init', '20260827000000_add_users']);

      prismaQueryRaw.mockResolvedValue([{ migration_name: '20260826000000_init' }]);

      await expect(repository.checkMigrationsStatus()).resolves.toBe('pending');
    });

    it('returns up_to_date when all local migrations are applied', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((target) => {
        const normalizedPath = String(target).replace(/\\/g, '/');
        return (
          normalizedPath.endsWith('/prisma/migrations') ||
          normalizedPath.endsWith('/20260826000000_init/migration.sql')
        );
      });
      mockMigrationDirectories(['20260826000000_init']);

      prismaQueryRaw.mockResolvedValue([{ migration_name: '20260826000000_init' }]);

      await expect(repository.checkMigrationsStatus()).resolves.toBe('up_to_date');
    });

    it('returns unavailable when migration metadata cannot be read from the database', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((target) => {
        const normalizedPath = String(target).replace(/\\/g, '/');
        return (
          normalizedPath.endsWith('/prisma/migrations') ||
          normalizedPath.endsWith('/20260826000000_init/migration.sql')
        );
      });
      mockMigrationDirectories(['20260826000000_init']);

      prismaQueryRaw.mockRejectedValue(new Error('_prisma_migrations does not exist'));

      await expect(repository.checkMigrationsStatus()).resolves.toBe('unavailable');
    });
  });

  describe('checkDatabaseConnection', () => {
    it('returns true when the database responds to SELECT 1', async () => {
      prismaQueryRaw.mockResolvedValue([{ '?column?': 1 }]);

      await expect(repository.checkDatabaseConnection()).resolves.toBe(true);
    });

    it('returns false when the database is unreachable', async () => {
      prismaQueryRaw.mockRejectedValue(new Error('Connection refused'));

      await expect(repository.checkDatabaseConnection()).resolves.toBe(false);
    });
  });
});
