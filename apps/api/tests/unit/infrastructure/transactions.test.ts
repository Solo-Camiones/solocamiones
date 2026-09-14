import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaTransaction = vi.fn();

vi.mock('../../../src/infrastructure/database/index.js', () => ({
  prisma: {
    $transaction: prismaTransaction,
  },
}));

const { catalogTransaction } = await import('../../../src/features/catalogs/transaction.js');
const { customerTransaction } = await import('../../../src/features/customers/transaction.js');
const { salesTransaction } = await import('../../../src/features/sales/transaction.js');

type TransactionRunner = <T>(work: (repositories: unknown) => Promise<T>) => Promise<T>;

const transactionCases: Array<{
  name: string;
  run: TransactionRunner;
  conflictMessage: string;
}> = [
  {
    name: 'catalog',
    run: catalogTransaction as TransactionRunner,
    conflictMessage: 'Concurrent catalog change; retry the request',
  },
  {
    name: 'customer',
    run: customerTransaction as TransactionRunner,
    conflictMessage: 'Concurrent customer change; retry the request',
  },
  {
    name: 'sales',
    run: salesTransaction as TransactionRunner,
    conflictMessage: 'Concurrent invoice change; retry the request',
  },
];

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError(`Prisma ${code}`, {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

function executeTransactionCallback() {
  prismaTransaction.mockImplementation(async (callback: (tx: object) => Promise<unknown>) =>
    callback({}),
  );
}

describe('feature transaction retry policies', () => {
  beforeEach(() => {
    prismaTransaction.mockReset();
  });

  it.each(transactionCases)('$name returns work from the first successful transaction', async ({ run }) => {
    executeTransactionCallback();
    const work = vi.fn().mockResolvedValue('committed');

    await expect(run(work)).resolves.toBe('committed');
    expect(work).toHaveBeenCalledTimes(1);
    expect(prismaTransaction).toHaveBeenCalledTimes(1);
    expect(prismaTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it.each(transactionCases)('$name retries P2034 and returns the later success', async ({ run }) => {
    prismaTransaction
      .mockRejectedValueOnce(prismaError('P2034'))
      .mockImplementationOnce(async (callback: (tx: object) => Promise<unknown>) => callback({}));
    const work = vi.fn().mockResolvedValue('committed-after-retry');

    await expect(run(work)).resolves.toBe('committed-after-retry');
    expect(prismaTransaction).toHaveBeenCalledTimes(2);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it.each(transactionCases)(
    '$name maps exhausted P2034 retries to its public conflict',
    async ({ run, conflictMessage }) => {
      prismaTransaction.mockRejectedValue(prismaError('P2034'));

      await expect(run(vi.fn())).rejects.toMatchObject({
        code: 'CONFLICT',
        message: conflictMessage,
      });
      expect(prismaTransaction).toHaveBeenCalledTimes(4);
    },
  );

  it.each(transactionCases)('$name maps P2025 to not found without retrying', async ({ run }) => {
    prismaTransaction.mockRejectedValue(prismaError('P2025'));

    await expect(run(vi.fn())).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prismaTransaction).toHaveBeenCalledTimes(1);
  });

  it.each(transactionCases)('$name preserves an unknown error without retrying', async ({ run }) => {
    const failure = new Error('unexpected transaction failure');
    prismaTransaction.mockRejectedValue(failure);

    await expect(run(vi.fn())).rejects.toBe(failure);
    expect(prismaTransaction).toHaveBeenCalledTimes(1);
  });

  it('customer maps a duplicate fiscal identifier to conflict', async () => {
    prismaTransaction.mockRejectedValue(prismaError('P2002'));

    await expect(customerTransaction(vi.fn())).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prismaTransaction).toHaveBeenCalledTimes(1);
  });

  it('sales retries a raw PostgreSQL serialization conflict', async () => {
    prismaTransaction
      .mockRejectedValueOnce(prismaError('P2010', { code: '40001' }))
      .mockImplementationOnce(async (callback: (tx: object) => Promise<unknown>) => callback({}));

    await expect(salesTransaction(async () => 'committed-after-40001')).resolves.toBe(
      'committed-after-40001',
    );
    expect(prismaTransaction).toHaveBeenCalledTimes(2);
  });

  it('sales maps an exhausted raw serialization conflict to conflict', async () => {
    prismaTransaction.mockRejectedValue(prismaError('P2010', { code: '40001' }));

    await expect(salesTransaction(vi.fn())).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Concurrent invoice change; retry the request',
    });
    expect(prismaTransaction).toHaveBeenCalledTimes(4);
  });

  it('sales maps a missing customer foreign key to not found', async () => {
    prismaTransaction.mockRejectedValue(prismaError('P2003'));

    await expect(salesTransaction(vi.fn())).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Customer not found',
    });
  });

  it.each([
    { modelName: 'Invoice', target: ['invoiceId'] },
    { modelName: 'InvoiceLine', target: ['invoiceId'] },
  ])('sales maps duplicate delivery for $modelName to conflict', async (meta) => {
    prismaTransaction.mockRejectedValue(prismaError('P2002', meta));

    await expect(salesTransaction(vi.fn())).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it.each([
    { modelName: 'Customer', target: ['invoiceId'] },
    { modelName: 'Invoice', target: ['invoiceId', 'type'] },
    { modelName: 'Invoice', target: 'invoiceId' },
  ])('sales preserves unrelated P2002 metadata %#', async (meta) => {
    const failure = prismaError('P2002', meta);
    prismaTransaction.mockRejectedValue(failure);

    await expect(salesTransaction(vi.fn())).rejects.toBe(failure);
  });
});
