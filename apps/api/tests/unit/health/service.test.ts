import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMocks = vi.hoisted(() => ({
  checkDatabaseConnection: vi.fn(),
  checkMigrationsStatus: vi.fn(),
}));

vi.mock('../../../src/features/health/repository.js', () => ({
  HealthRepository: class {
    checkDatabaseConnection = repositoryMocks.checkDatabaseConnection;
    checkMigrationsStatus = repositoryMocks.checkMigrationsStatus;
  },
}));

const { getLivenessStatus, getReadinessStatus } =
  await import('../../../src/features/health/service.js');

describe('health service', () => {
  beforeEach(() => {
    repositoryMocks.checkDatabaseConnection.mockReset();
    repositoryMocks.checkMigrationsStatus.mockReset();
  });

  describe('getLivenessStatus', () => {
    it('returns ok without touching the database', () => {
      expect(getLivenessStatus()).toEqual({ status: 'ok' });
      expect(repositoryMocks.checkDatabaseConnection).not.toHaveBeenCalled();
    });
  });

  describe('getReadinessStatus', () => {
    it('returns database down when PostgreSQL is unreachable', async () => {
      repositoryMocks.checkDatabaseConnection.mockResolvedValue(false);

      await expect(getReadinessStatus()).resolves.toEqual({
        status: 'error',
        database: 'down',
      });
      expect(repositoryMocks.checkMigrationsStatus).not.toHaveBeenCalled();
    });

    it('returns migrations unavailable when migration metadata cannot be verified', async () => {
      repositoryMocks.checkDatabaseConnection.mockResolvedValue(true);
      repositoryMocks.checkMigrationsStatus.mockResolvedValue('unavailable');

      await expect(getReadinessStatus()).resolves.toEqual({
        status: 'error',
        database: 'up',
        migrations: 'unavailable',
      });
    });

    it('returns migrations pending when local migrations are not fully applied', async () => {
      repositoryMocks.checkDatabaseConnection.mockResolvedValue(true);
      repositoryMocks.checkMigrationsStatus.mockResolvedValue('pending');

      await expect(getReadinessStatus()).resolves.toEqual({
        status: 'error',
        database: 'up',
        migrations: 'pending',
      });
    });

    it('returns ok when database and migrations are ready', async () => {
      repositoryMocks.checkDatabaseConnection.mockResolvedValue(true);
      repositoryMocks.checkMigrationsStatus.mockResolvedValue('up_to_date');

      await expect(getReadinessStatus()).resolves.toEqual({
        status: 'ok',
        database: 'up',
        migrations: 'up_to_date',
      });
    });
  });
});
