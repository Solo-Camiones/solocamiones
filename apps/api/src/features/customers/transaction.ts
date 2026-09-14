import { Prisma } from '@prisma/client';

import { prisma } from '../../infrastructure/database/index.js';
import { AppError } from '../../infrastructure/errors/app-error.js';
import { HistoryRepository } from '../history/repository.js';
import { UserRepository } from '../users/repository.js';
import { FISCAL_IDENTIFIER_CONFLICT_MESSAGE } from './constants.js';
import { CustomerRepository } from './repository.js';

export type CustomerRepositories = {
  customers: CustomerRepository;
  users: UserRepository;
  history: HistoryRepository;
};
export type CustomerTransaction = <T>(
  work: (repositories: CustomerRepositories) => Promise<T>,
) => Promise<T>;

export const customerTransaction: CustomerTransaction = async (work) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) =>
          work({
            customers: new CustomerRepository(tx),
            users: new UserRepository(tx),
            history: new HistoryRepository(tx),
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2034' && attempt < 3) continue;
        if (error.code === 'P2002') throw AppError.conflict(FISCAL_IDENTIFIER_CONFLICT_MESSAGE);
        if (error.code === 'P2025') throw AppError.notFound();
        if (error.code === 'P2034')
          throw AppError.conflict('Concurrent customer change; retry the request');
      }
      throw error;
    }
  }
};
