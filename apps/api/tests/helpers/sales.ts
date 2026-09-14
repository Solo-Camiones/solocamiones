import { randomUUID } from 'node:crypto';

import { expect } from 'vitest';
import type request from 'supertest';

export const TEST_CSRF_HEADERS = { 'X-Requested-With': 'XMLHttpRequest' };

/** Named customers may confirm unpaid (credit). Cliente contado may not. */
export async function assignNamedCustomerForCredit(
  agent: request.Agent,
  draftId: string,
  customerId?: string,
): Promise<string> {
  let assignedCustomerId: string;
  if (customerId) {
    assignedCustomerId = customerId;
  } else {
    const created = await agent
      .post('/api/customers')
      .set(TEST_CSRF_HEADERS)
      .send({
        name: `Cliente crédito ${randomUUID().slice(0, 8)}`,
      });
    expect(created.status).toBe(201);
    assignedCustomerId = created.body.id as string;
  }
  const patched = await agent
    .patch(`/api/sales/${draftId}`)
    .set(TEST_CSRF_HEADERS)
    .send({ customerId: assignedCustomerId });
  expect(patched.status).toBe(200);
  return assignedCustomerId;
}

export function cashSaleFullPayment(amount: string) {
  return {
    payment: {
      amount,
      method: 'CASH' as const,
    },
  };
}
