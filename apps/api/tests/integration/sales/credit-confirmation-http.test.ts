import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { hashPassword } from '../../../src/features/access/password.js';
import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import { databaseDateString, invoiceDueDate } from '../../../src/features/payments/dates.js';
import {
  CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE,
  CREDIT_LIMIT_EXCEEDED_MESSAGE,
  SELLER_CREDIT_CONFIRM_PAYMENT_FORBIDDEN_MESSAGE,
  USD_INVOICE_MUST_BE_PAID_IN_FULL_MESSAGE,
} from '../../../src/features/sales/constants.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';
import { cashSaleFullPayment, validCreditCustomerBody } from '../../helpers/sales.js';

const app = createTestApp();
const users = new UserRepository();
const PASSWORD = 'personal-password';
const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };
const SALES = '/api/sales';

function uniqueCedula() {
  return Array.from({ length: 11 }, () => String(Math.floor(Math.random() * 10))).join('');
}

async function fixture(role: Role = 'ADMINISTRATOR') {
  const user = await users.create({
    name: role === 'ADMINISTRATOR' ? 'Ana Administradora' : 'Sara Vendedora',
    username: randomUUID(),
    role,
    passwordHash: await hashPassword(PASSWORD),
  });
  const agent = request.agent(app);
  expect(
    (await agent.post('/api/auth/login').send({ username: user.username, password: PASSWORD }))
      .status,
  ).toBe(200);
  return { user, agent };
}

async function createCreditCustomer(agent: request.Agent, overrides: Record<string, unknown> = {}) {
  const created = await agent
    .post('/api/customers')
    .set(CSRF)
    .send({
      ...validCreditCustomerBody(`Crédito ${randomUUID().slice(0, 8)}`),
      rnc: uniqueCedula(),
      ...overrides,
    });
  expect(created.status).toBe(201);
  return created.body as {
    id: string;
    creditTermDays: number;
    creditLimitDop: string;
    customerType: string;
  };
}

async function createPricedDraft(
  agent: request.Agent,
  input: { customerId: string; unitPrice: string; currency?: 'DOP' | 'USD'; fiscal?: boolean },
) {
  const draft = await agent
    .post(SALES)
    .set(CSRF)
    .send({
      customerId: input.customerId,
      currency: input.currency ?? 'DOP',
      fiscal: input.fiscal ?? true,
    });
  expect(draft.status).toBe(201);
  const lined = await agent.post(`${SALES}/${draft.body.id}/lines`).set(CSRF).send({
    type: 'GENERIC',
    description: 'Filtro',
    unitPrice: input.unitPrice,
  });
  expect(lined.status).toBe(201);
  return { id: draft.body.id as string, gross: lined.body.totals.gross as string };
}

async function cleanup() {
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

describe('credit confirmation HTTP (CUST-004/005, SALE-005, PAY-001/002/007)', () => {
  afterEach(cleanup);

  it('rejects a named CASH customer without payment and does not allocate FAC-', async () => {
    const admin = await fixture();
    const named = await admin.agent
      .post('/api/customers')
      .set(CSRF)
      .send({
        name: `Contado ${randomUUID().slice(0, 8)}`,
      });
    expect(named.status).toBe(201);
    const draft = await createPricedDraft(admin.agent, {
      customerId: named.body.id,
      unitPrice: '1000.00',
      fiscal: false,
    });

    const unpaid = await admin.agent.post(`${SALES}/${draft.id}/confirm`).set(CSRF).send({});

    expect(unpaid.status).toBe(409);
    expect(unpaid.body.error.message).toBe(CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE);
    expect(await prisma.invoice.findUnique({ where: { id: draft.id } })).toMatchObject({
      status: 'DRAFT',
      number: null,
    });
    expect(await prisma.invoiceSequence.findUnique({ where: { name: 'FAC' } })).toMatchObject({
      nextValue: 1,
    });
  });

  it('lets a Seller confirm CREDIT DOP without payment using the customer term', async () => {
    const seller = await fixture('SELLER');
    const admin = await fixture();
    const customer = await createCreditCustomer(admin.agent, { creditTermDays: 60 });
    const draft = await createPricedDraft(seller.agent, {
      customerId: customer.id,
      unitPrice: '5000.00',
    });

    const confirmed = await seller.agent.post(`${SALES}/${draft.id}/confirm`).set(CSRF).send({});

    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({
      status: 'COMPLETED',
      number: 'FAC-000001',
    });
    expect(confirmed.body.balance).toBeUndefined();
    expect(confirmed.body.paid).toBeUndefined();
    expect(confirmed.body.paymentState).toBeUndefined();
    expect(confirmed.body.dueDate).toBe(
      databaseDateString(invoiceDueDate(new Date(confirmed.body.confirmedAt), 60)),
    );
    expect(confirmed.body.dueDate).not.toBe(
      databaseDateString(invoiceDueDate(new Date(confirmed.body.confirmedAt), 30)),
    );
    expect(confirmed.body.payments).toBeUndefined();
    expect(confirmed.body.customer).toMatchObject({
      customerType: 'CREDIT',
      creditTermDays: 60,
      creditLimitDop: null,
    });
  });

  it('forbids a Seller from sending an initial payment on CREDIT DOP', async () => {
    const seller = await fixture('SELLER');
    const admin = await fixture();
    const customer = await createCreditCustomer(admin.agent);
    const draft = await createPricedDraft(seller.agent, {
      customerId: customer.id,
      unitPrice: '5000.00',
    });

    const denied = await seller.agent
      .post(`${SALES}/${draft.id}/confirm`)
      .set(CSRF)
      .send(cashSaleFullPayment('5000.00'));

    expect(denied.status).toBe(403);
    expect(denied.body.error.message).toBe(SELLER_CREDIT_CONFIRM_PAYMENT_FORBIDDEN_MESSAGE);
    expect(await prisma.invoice.findUnique({ where: { id: draft.id } })).toMatchObject({
      status: 'DRAFT',
      number: null,
    });
  });

  it('lets an Administrator record a partial CREDIT DOP payment within the limit', async () => {
    const admin = await fixture();
    const customer = await createCreditCustomer(admin.agent, { creditLimitDop: '10000.00' });
    const draft = await createPricedDraft(admin.agent, {
      customerId: customer.id,
      unitPrice: '5000.00',
    });

    const confirmed = await admin.agent
      .post(`${SALES}/${draft.id}/confirm`)
      .set(CSRF)
      .send(cashSaleFullPayment('2000.00'));

    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({
      balance: '3000.00',
      paid: '2000.00',
      paymentState: 'PARTIALLY_PAID',
    });
    expect(confirmed.body.payments).toEqual([
      expect.objectContaining({ amount: '2000.00', method: 'CASH' }),
    ]);
  });

  it('lets an Administrator pay a CREDIT DOP invoice in full or omit the payment', async () => {
    const admin = await fixture();
    const customer = await createCreditCustomer(admin.agent, { creditLimitDop: '20000.00' });
    const fullDraft = await createPricedDraft(admin.agent, {
      customerId: customer.id,
      unitPrice: '5000.00',
    });
    const omittedDraft = await createPricedDraft(admin.agent, {
      customerId: customer.id,
      unitPrice: '5000.00',
    });

    const paid = await admin.agent
      .post(`${SALES}/${fullDraft.id}/confirm`)
      .set(CSRF)
      .send(cashSaleFullPayment('5000.00'));
    const omitted = await admin.agent
      .post(`${SALES}/${omittedDraft.id}/confirm`)
      .set(CSRF)
      .send({});

    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({ balance: '0.00', paid: '5000.00', paymentState: 'PAID' });
    expect(omitted.status).toBe(200);
    expect(omitted.body).toMatchObject({ balance: '5000.00', paid: '0.00' });
  });

  it('rejects an Administrator CREDIT DOP confirmation that would exceed the limit', async () => {
    const admin = await fixture();
    const customer = await createCreditCustomer(admin.agent, { creditLimitDop: '4000.00' });
    const draft = await createPricedDraft(admin.agent, {
      customerId: customer.id,
      unitPrice: '5000.00',
    });

    const denied = await admin.agent.post(`${SALES}/${draft.id}/confirm`).set(CSRF).send({});

    expect(denied.status).toBe(409);
    expect(denied.body.error.message).toBe(CREDIT_LIMIT_EXCEEDED_MESSAGE);
    expect(await prisma.invoice.findUnique({ where: { id: draft.id } })).toMatchObject({
      status: 'DRAFT',
      number: null,
    });
  });

  it('requires CREDIT USD invoices to be paid in full and accepts a matching payment', async () => {
    const admin = await fixture();
    const customer = await createCreditCustomer(admin.agent);
    const draft = await createPricedDraft(admin.agent, {
      customerId: customer.id,
      unitPrice: '5000.00',
      currency: 'USD',
    });

    const unpaid = await admin.agent.post(`${SALES}/${draft.id}/confirm`).set(CSRF).send({});
    expect(unpaid.status).toBe(409);
    expect(unpaid.body.error.message).toBe(USD_INVOICE_MUST_BE_PAID_IN_FULL_MESSAGE);

    const paid = await admin.agent
      .post(`${SALES}/${draft.id}/confirm`)
      .set(CSRF)
      .send(cashSaleFullPayment('5000.00'));
    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({ balance: '0.00', currency: 'USD', number: 'FAC-000001' });
    expect(paid.body.dueDate).toBe(
      databaseDateString(invoiceDueDate(new Date(paid.body.confirmedAt), 0)),
    );
  });

  it('keeps the confirmed credit term snapshot after a later customer edit', async () => {
    const admin = await fixture();
    const customer = await createCreditCustomer(admin.agent, { creditTermDays: 60 });
    const draft = await createPricedDraft(admin.agent, {
      customerId: customer.id,
      unitPrice: '1000.00',
    });
    const confirmed = await admin.agent.post(`${SALES}/${draft.id}/confirm`).set(CSRF).send({});
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.customer.creditTermDays).toBe(60);

    const updated = await admin.agent
      .patch(`/api/customers/${customer.id}`)
      .set(CSRF)
      .send({ creditTermDays: 90 });
    expect(updated.status).toBe(200);
    expect(updated.body.creditTermDays).toBe(90);

    const loaded = await admin.agent.get(`${SALES}/${draft.id}`);
    expect(loaded.status).toBe(200);
    expect(loaded.body.customer).toMatchObject({
      customerType: 'CREDIT',
      creditTermDays: 60,
      creditLimitDop: null,
    });
    expect(loaded.body.dueDate).toBe(
      databaseDateString(invoiceDueDate(new Date(confirmed.body.confirmedAt), 60)),
    );
  });

  it('omits payment movements from Seller invoice reads and forbids payments and receivables', async () => {
    const seller = await fixture('SELLER');
    const admin = await fixture();
    const customer = await createCreditCustomer(admin.agent);
    const draft = await createPricedDraft(admin.agent, {
      customerId: customer.id,
      unitPrice: '5000.00',
    });
    const confirmed = await admin.agent
      .post(`${SALES}/${draft.id}/confirm`)
      .set(CSRF)
      .send(cashSaleFullPayment('2000.00'));
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.payments).toHaveLength(1);

    const detail = await seller.agent.get(`${SALES}/${draft.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.payments).toBeUndefined();
    expect(detail.body.paymentState).toBeUndefined();
    expect(detail.body.paid).toBeUndefined();
    expect(detail.body.refunded).toBeUndefined();
    expect(detail.body.balance).toBeUndefined();

    const listed = await seller.agent.get(`${SALES}?status=COMPLETED`);
    expect(listed.status).toBe(200);
    expect(listed.body.items[0].payments).toBeUndefined();
    expect(listed.body.items[0].paymentState).toBeUndefined();
    expect(listed.body.items[0].balance).toBeUndefined();

    const payment = await seller.agent
      .post(`${SALES}/${draft.id}/payments`)
      .set(CSRF)
      .send({
        amount: '100.00',
        method: 'CASH',
        effectiveDate: confirmed.body.confirmedAt.slice(0, 10),
        idempotencyKey: randomUUID(),
      });
    expect(payment.status).toBe(403);

    const receivables = await seller.agent.get(`${SALES}/receivables`);
    expect(receivables.status).toBe(403);
  });

  it('serializes concurrent CREDIT confirms against the same limit', async () => {
    const admin = await fixture();
    const customer = await createCreditCustomer(admin.agent, { creditLimitDop: '10000.00' });
    const first = await createPricedDraft(admin.agent, {
      customerId: customer.id,
      unitPrice: '6000.00',
    });
    const second = await createPricedDraft(admin.agent, {
      customerId: customer.id,
      unitPrice: '6000.00',
    });

    const [left, right] = await Promise.all([
      admin.agent.post(`${SALES}/${first.id}/confirm`).set(CSRF).send({}),
      admin.agent.post(`${SALES}/${second.id}/confirm`).set(CSRF).send({}),
    ]);

    const statuses = [left.status, right.status].sort();
    expect(statuses).toEqual([200, 409]);
    const winner = left.status === 200 ? left : right;
    const loser = left.status === 409 ? left : right;
    expect(winner.body.number).toBe('FAC-000001');
    expect(loser.body.error.message).toBe(CREDIT_LIMIT_EXCEEDED_MESSAGE);
    expect(await prisma.invoice.count({ where: { status: 'COMPLETED' } })).toBe(1);
    expect(await prisma.invoiceSequence.findUnique({ where: { name: 'FAC' } })).toMatchObject({
      nextValue: 2,
    });
  });
});
