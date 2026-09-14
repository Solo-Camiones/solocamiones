import { Prisma } from '@prisma/client';

import { prisma } from '../../infrastructure/database/index.js';
import { AppError } from '../../infrastructure/errors/app-error.js';
import { HistoryRepository } from '../history/repository.js';
import { UserRepository } from '../users/repository.js';
import { CatalogRepository } from './repository.js';

export type CatalogRepositories = {
  catalogs: CatalogRepository;
  users: UserRepository;
  history: HistoryRepository;
};
export type CatalogTransaction = <T>(
  work: (repositories: CatalogRepositories) => Promise<T>,
) => Promise<T>;

export const catalogTransaction: CatalogTransaction = async (work) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) =>
          work({
            catalogs: new CatalogRepository(tx),
            users: new UserRepository(tx),
            history: new HistoryRepository(tx),
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2034' && attempt < 3) continue;
        if (error.code === 'P2025') throw AppError.notFound();
        if (error.code === 'P2034')
          throw AppError.conflict('Concurrent catalog change; retry the request');
      }
      throw error;
    }
  }
};
