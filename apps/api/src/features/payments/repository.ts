import type { InvoiceCurrency, PaymentMethod, Prisma } from '@prisma/client';

import { prisma } from '../../infrastructure/database/index.js';

type PaymentDatabase = Pick<Prisma.TransactionClient, 'invoicePayment'>;

export type CreatePaymentRecord = {
  invoiceId: string;
  amount: Prisma.Decimal | string;
  currency: InvoiceCurrency;
  method: PaymentMethod;
  effectiveDate: Date;
  reference: string | null;
  actorUserId: string;
  idempotencyKey: string | null;
};

export class PaymentRepository {
  constructor(private readonly database: PaymentDatabase = prisma) {}

  findByIdempotencyKey(invoiceId: string, idempotencyKey: string) {
    return this.database.invoicePayment.findUnique({
      where: { invoiceId_idempotencyKey: { invoiceId, idempotencyKey } },
    });
  }

  createPayment(input: CreatePaymentRecord) {
    return this.database.invoicePayment.create({ data: { ...input, kind: 'PAYMENT' } });
  }

  createRefund(input: CreatePaymentRecord) {
    return this.database.invoicePayment.create({
      data: { ...input, kind: 'REFUND' },
    });
  }
}
