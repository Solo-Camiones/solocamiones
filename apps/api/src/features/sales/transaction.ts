import { Prisma } from '@prisma/client';

import { prisma } from '../../infrastructure/database/index.js';
import { AppError } from '../../infrastructure/errors/app-error.js';
import { CatalogRepository } from '../catalogs/repository.js';
import { CustomerRepository } from '../customers/repository.js';
import { HistoryRepository } from '../history/repository.js';
import { PaymentRepository } from '../payments/repository.js';
import { UserRepository } from '../users/repository.js';
import { DUPLICATE_DELIVERY_LINE_MESSAGE } from './constants.js';
import { SalesRepository } from './repository.js';

export type SalesRepositories = {
  sales: SalesRepository;
  catalogs: CatalogRepository;
  customers: CustomerRepository;
  users: UserRepository;
  history: HistoryRepository;
  payments: PaymentRepository;
};
export type SalesTransaction = <T>(
  work: (repositories: SalesRepositories) => Promise<T>,
) => Promise<T>;

function isDuplicateDeliveryConstraint(error: Prisma.PrismaClientKnownRequestError): boolean {
  const target = error.meta?.target;
  // Nested line writes report Invoice as the model; direct line writes report InvoiceLine.
  const modelName = error.meta?.modelName;
  return (
    (modelName === 'Invoice' || modelName === 'InvoiceLine') &&
    Array.isArray(target) &&
    target.length === 1 &&
    target[0] === 'invoiceId'
  );
}

function isSerializationConflict(error: Prisma.PrismaClientKnownRequestError): boolean {
  // Prisma maps ORM write conflicts to P2034, while PostgreSQL 40001 from a raw
  // SELECT ... FOR UPDATE is wrapped as P2010.
  return error.code === 'P2034' || (error.code === 'P2010' && error.meta?.code === '40001');
}

export const salesTransaction: SalesTransaction = async (work) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) =>
          work({
            sales: new SalesRepository(tx),
            catalogs: new CatalogRepository(tx),
            customers: new CustomerRepository(tx),
            users: new UserRepository(tx),
            history: new HistoryRepository(tx),
            payments: new PaymentRepository(tx),
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (isSerializationConflict(error) && attempt < 3) continue;
        if (error.code === 'P2025') throw AppError.notFound();
        if (error.code === 'P2003') throw AppError.notFound('Customer not found');
        if (error.code === 'P2002' && isDuplicateDeliveryConstraint(error)) {
          throw AppError.conflict(DUPLICATE_DELIVERY_LINE_MESSAGE);
        }
        if (isSerializationConflict(error))
          throw AppError.conflict('Concurrent invoice change; retry the request');
      }
      throw error;
    }
  }
};
