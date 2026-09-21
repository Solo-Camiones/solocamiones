import { randomUUID } from 'node:crypto';

import { expect } from 'vitest';
import type request from 'supertest';

import { prisma } from '../../src/infrastructure/database/index.js';

export const TEST_CSRF_HEADERS = { 'X-Requested-With': 'XMLHttpRequest' };

/** Valid Administrator body for a CREDIT customer (CUST-004/CUST-005). */
export function validCreditCustomerBody(name = `Crédito ${randomUUID().slice(0, 8)}`) {
  return {
    name,
    rnc: '00112345678',
    customerType: 'CREDIT' as const,
    creditLimitDop: '10000.00',
    creditTermDays: 60 as const,
  };
}

/** Named CREDIT customers may confirm unpaid DOP invoices. Cliente contado / CASH may not. */
export async function assignNamedCustomerForCredit(
  agent: request.Agent,
  draftId: string,
  customerId?: string,
): Promise<string> {
  let assignedCustomerId: string;
  if (customerId) {
    assignedCustomerId = customerId;
  } else {
    const body = {
      ...validCreditCustomerBody(`Cliente crédito ${randomUUID().slice(0, 8)}`),
      creditLimitDop: '999999.99',
      rnc: Array.from({ length: 11 }, () => String(Math.floor(Math.random() * 10))).join(''),
    };
    const created = await prisma.customer.create({
      data: {
        name: body.name,
        rnc: body.rnc,
        customerType: body.customerType,
        creditLimitDop: body.creditLimitDop,
        creditTermDays: body.creditTermDays,
      },
    });
    assignedCustomerId = created.id;
  }
  const patched = await agent
    .patch(`/api/sales/${draftId}`)
    .set(TEST_CSRF_HEADERS)
    .send({ customerId: assignedCustomerId });
  expect(patched.status).toBe(200);
  return assignedCustomerId;
}

/** Completed invoices must snapshot type/term; current customers backfill as CASH. */
export const COMPLETED_CASH_SNAPSHOT = {
  snapshotCustomerType: 'CASH' as const,
  snapshotCreditTermDays: null,
};

/** Documentary FAC- date for direct inserts; matches commercial recognition on historical rows. */
export function invoiceIssuedAtFrom(confirmedAt: Date) {
  return { confirmedAt, invoiceIssuedAt: confirmedAt };
}

export function cashSaleFullPayment(amount: string) {
  return {
    payment: {
      amount,
      method: 'CASH' as const,
    },
  };
}

/** Billing HTTP no longer accepts cost; tests that need known COST-003 seed it directly. */
export async function seedKnownLineCost(
  lineId: string,
  provenance: 'ACTUAL' | 'ESTIMATED',
  amount: string,
) {
  await prisma.invoiceLine.update({
    where: { id: lineId },
    data: { costProvenance: provenance, acquisitionCostDop: amount },
  });
}
