import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import { hashPassword } from '../../../src/features/access/password.js';
import { ACCOUNT_STATEMENT_NO_BALANCE_MESSAGE } from '../../../src/features/payments/account-statement-service.js';
import { businessDateString } from '../../../src/features/payments/dates.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';
import { assignNamedCustomerForCredit } from '../../helpers/sales.js';

const users = new UserRepository();
const PASSWORD = 'personal-password';
const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };

async function fixture(agent: request.Agent, role: Role) {
  const user = await users.create({
    name: role === 'ADMINISTRATOR' ? 'Ana Administradora' : 'Sara Vendedora',
    username: randomUUID(),
    role,
    passwordHash: await hashPassword(PASSWORD),
  });
  expect(
    (await agent.post('/api/auth/login').send({ username: user.username, password: PASSWORD }))
      .status,
  ).toBe(200);
  return { agent, user };
}

async function confirmCreditInvoice(agent: request.Agent, customerId?: string) {
  const draft = await agent.post('/api/sales').set(CSRF).send({});
  await agent.post(`/api/sales/${draft.body.id}/lines`).set(CSRF).send({
    type: 'GENERIC',
    description: 'Filtro de aceite',
    unitPrice: '1000.00',
  });
  const assignedCustomerId = await assignNamedCustomerForCredit(agent, draft.body.id, customerId);
  const confirmed = await agent.post(`/api/sales/${draft.body.id}/confirm`).set(CSRF).send({});
  expect(confirmed.status).toBe(200);
  return { invoice: confirmed.body, customerId: assignedCustomerId };
}

async function cleanup() {
  vi.restoreAllMocks();
  await resetLoginRateLimit();
  await clearTestHistory();
  await prisma.invoicePayment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.invoiceSequence.update({ where: { name: 'FAC' }, data: { nextValue: 1 } });
  await prisma.customerContact.deleteMany({ where: { customer: { isDefault: false } } });
  await prisma.customer.deleteMany({ where: { isDefault: false } });
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

afterAll(disconnectPrisma);

describe('customer account statement HTTP (STMT-001)', () => {
  afterEach(cleanup);

  it('downloads every open DOP invoice with reconciled cumulative values', async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from('%PDF-statement'));
    const app = createTestApp({ accountStatementPdfRenderer: { render } });
    const admin = await fixture(request.agent(app), 'ADMINISTRATOR');
    const first = await confirmCreditInvoice(admin.agent);
    const second = await confirmCreditInvoice(admin.agent, first.customerId);
    const paid = await confirmCreditInvoice(admin.agent, first.customerId);
    await admin.agent
      .post(`/api/sales/${first.invoice.id}/payments`)
      .set(CSRF)
      .send({
        amount: '400.00',
        method: 'TRANSFER',
        effectiveDate: businessDateString(new Date(first.invoice.confirmedAt)),
        reference: 'DEP-1',
        idempotencyKey: randomUUID(),
      });
    await admin.agent
      .post(`/api/sales/${paid.invoice.id}/payments`)
      .set(CSRF)
      .send({
        amount: '1000.00',
        method: 'CASH',
        effectiveDate: businessDateString(new Date(paid.invoice.confirmedAt)),
        idempotencyKey: randomUUID(),
      });

    const response = await admin.agent
      .get(`/api/sales/receivables/${first.customerId}/statement.pdf`)
      .buffer(true);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/pdf/);
    expect(response.headers['content-disposition']).toContain('estado-de-cuenta-cliente-credito-');
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: expect.arrayContaining([
          expect.objectContaining({
            number: first.invoice.number,
            paid: '400.00',
            balance: '600.00',
          }),
          expect.objectContaining({
            number: second.invoice.number,
            paid: '0.00',
            balance: '1000.00',
          }),
        ]),
        totals: { invoiced: '2000.00', paid: '400.00', balance: '1600.00' },
      }),
    );
    expect(render.mock.calls[0]![0].rows).toHaveLength(2);
    expect(render.mock.calls[0]![0].rows).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ number: paid.invoice.number })]),
    );
  });

  it('denies Seller and rejects a customer without open DOP balance', async () => {
    const app = createTestApp();
    const admin = await fixture(request.agent(app), 'ADMINISTRATOR');
    const seller = await fixture(request.agent(app), 'SELLER');
    const open = await confirmCreditInvoice(admin.agent);
    const emptyCustomer = await prisma.customer.create({
      data: { name: 'Cliente sin saldo', customerType: 'CASH' },
    });

    const denied = await seller.agent.get(
      `/api/sales/receivables/${open.customerId}/statement.pdf`,
    );
    const empty = await admin.agent.get(`/api/sales/receivables/${emptyCustomer.id}/statement.pdf`);

    expect(denied.status).toBe(403);
    expect(empty.status).toBe(409);
    expect(empty.body.error.message).toBe(ACCOUNT_STATEMENT_NO_BALANCE_MESSAGE);
  });
});
