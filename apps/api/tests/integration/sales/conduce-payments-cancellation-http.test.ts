import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import { hashPassword } from '../../../src/features/access/password.js';
import { businessDateString } from '../../../src/features/payments/dates.js';
import {
  CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE,
  CANCELLATION_REFUND_EXCEEDS_NET_MESSAGE,
  CONDUCE_DUE_DATE_REQUIRED_MESSAGE,
  CONDUCE_RETRY_MISMATCH_MESSAGE,
  CREDIT_LIMIT_EXCEEDED_MESSAGE,
  PAYMENT_COMPLETED_ONLY_MESSAGE,
  USD_INVOICE_MUST_BE_PAID_IN_FULL_MESSAGE,
} from '../../../src/features/sales/constants.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';
import { cashSaleFullPayment, TEST_CSRF_HEADERS } from '../../helpers/sales.js';

const users = new UserRepository();
const PASSWORD = 'personal-password';
const ROOT = '/api/sales';

async function fixture(role: Role) {
  const user = await users.create({
    name: role === 'ADMINISTRATOR' ? 'Ana Administradora' : 'Sara Vendedora',
    username: randomUUID(),
    role,
    passwordHash: await hashPassword(PASSWORD),
  });
  const agent = request.agent(createTestApp());
  expect(
    (await agent.post('/api/auth/login').send({ username: user.username, password: PASSWORD }))
      .status,
  ).toBe(200);
  return { user, agent };
}

async function namedCashCustomer(name = 'Cliente contado nombrado') {
  return prisma.customer.create({
    data: {
      name,
      customerType: 'CASH',
      contacts: { create: { phone: '809-555-0404', isPrimary: true } },
    },
  });
}

async function creditCustomer(options?: {
  name?: string;
  creditLimitDop?: string;
  creditTermDays?: 30 | 45 | 60 | 90 | 120;
}) {
  return prisma.customer.create({
    data: {
      name: options?.name ?? 'Cliente crédito M4',
      rnc: '00112345679',
      customerType: 'CREDIT',
      creditLimitDop: options?.creditLimitDop ?? '10000.00',
      creditTermDays: options?.creditTermDays ?? 60,
      contacts: { create: { phone: '809-555-0505', isPrimary: true } },
    },
  });
}

async function draftWithLine(
  agent: request.Agent,
  customerId: string,
  options: { unitPrice?: string; currency?: 'DOP' | 'USD'; applyItbis?: boolean } = {},
) {
  const draft = await agent
    .post(ROOT)
    .set(TEST_CSRF_HEADERS)
    .send({
      customerId,
      currency: options.currency ?? 'DOP',
      applyItbis: options.applyItbis ?? false,
      fiscal: false,
    });
  expect(draft.status).toBe(201);
  const line = await agent
    .post(`${ROOT}/${draft.body.id}/lines`)
    .set(TEST_CSRF_HEADERS)
    .send({
      type: 'GENERIC',
      description: 'Repuesto M4',
      unitPrice: options.unitPrice ?? '1000.00',
    });
  expect(line.status).toBe(201);
  return line.body;
}

async function cleanup() {
  await resetLoginRateLimit();
  await clearTestHistory();
  await prisma.invoicePayment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.invoiceSequence.updateMany({
    where: { name: { in: ['FAC', 'COT', 'CON'] } },
    data: { nextValue: 1 },
  });
  await prisma.customerContact.deleteMany({ where: { customer: { isDefault: false } } });
  await prisma.customer.deleteMany({ where: { isDefault: false } });
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

afterEach(cleanup);
afterAll(disconnectPrisma);

describe('conduce payments, CxC, and cancellation (CON-002 / CON-005)', () => {
  it('allows Admin named-CASH partial payment with dueDate and lists the conduce in AR', async () => {
    const { agent } = await fixture('ADMINISTRATOR');
    const customer = await namedCashCustomer();
    const draft = await draftWithLine(agent, customer.id);
    const dueDate = businessDateString(new Date());

    const issued = await agent
      .post(`${ROOT}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({
        payment: { amount: '400.00', method: 'CASH' },
        dueDate,
      });
    expect(issued.status).toBe(200);
    expect(issued.body).toMatchObject({
      status: 'CONDUCE',
      conduceNumber: 'CON-000001',
      paid: '400.00',
      balance: '600.00',
      dueDate,
    });

    const byCon = await agent.get(`${ROOT}/receivables?invoice=CON-000001`);
    expect(byCon.status).toBe(200);
    expect(byCon.body.invoices).toEqual([
      expect.objectContaining({ id: draft.id, conduceNumber: 'CON-000001', balance: '600.00' }),
    ]);

    const statement = await agent
      .get(`${ROOT}/receivables/${customer.id}/statement.pdf`)
      .buffer(true);
    expect(statement.status).toBe(200);
    expect(statement.headers['content-type']).toMatch(/pdf/);
  });

  it('rejects Admin default Cliente contado conduce with partial payment', async () => {
    const { agent } = await fixture('ADMINISTRATOR');
    const draft = await agent.post(ROOT).set(TEST_CSRF_HEADERS).send({ applyItbis: false });
    expect(draft.status).toBe(201);
    await agent
      .post(`${ROOT}/${draft.body.id}/lines`)
      .set(TEST_CSRF_HEADERS)
      .send({ type: 'GENERIC', description: 'Contado', unitPrice: '100.00' });

    const issued = await agent
      .post(`${ROOT}/${draft.body.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({ payment: { amount: '50.00', method: 'CASH' } });
    expect(issued.status).toBe(409);
    expect(issued.body.error.message).toBe(CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE);
  });

  it('rejects Seller named-CASH partial conduce and Admin CREDIT USD partial', async () => {
    const seller = await fixture('SELLER');
    const admin = await fixture('ADMINISTRATOR');
    const named = await namedCashCustomer('Named Seller');
    const creditUsd = await creditCustomer({ name: 'Crédito USD' });

    const sellerDraft = await draftWithLine(seller.agent, named.id);
    const sellerDenied = await seller.agent
      .post(`${ROOT}/${sellerDraft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({ payment: { amount: '100.00', method: 'CASH' } });
    expect(sellerDenied.status).toBe(409);
    expect(sellerDenied.body.error.message).toBe(CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE);

    const usdDraft = await draftWithLine(admin.agent, creditUsd.id, {
      currency: 'USD',
      unitPrice: '100.00',
    });
    const usdDenied = await admin.agent
      .post(`${ROOT}/${usdDraft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({ payment: { amount: '50.00', method: 'CASH' } });
    expect(usdDenied.status).toBe(409);
    expect(usdDenied.body.error.message).toBe(USD_INVOICE_MUST_BE_PAID_IN_FULL_MESSAGE);
  });

  it('requires dueDate when Admin named-CASH conduce leaves balance', async () => {
    const { agent } = await fixture('ADMINISTRATOR');
    const customer = await namedCashCustomer();
    const draft = await draftWithLine(agent, customer.id);

    const missing = await agent
      .post(`${ROOT}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({ payment: { amount: '100.00', method: 'CASH' } });
    expect(missing.status).toBe(409);
    expect(missing.body.error.message).toBe(CONDUCE_DUE_DATE_REQUIRED_MESSAGE);
  });

  it('keeps direct named-CASH invoice confirmation on SALE-005 (no balance exception)', async () => {
    const { agent } = await fixture('ADMINISTRATOR');
    const customer = await namedCashCustomer();
    const draft = await draftWithLine(agent, customer.id);

    const confirmed = await agent
      .post(`${ROOT}/${draft.id}/confirm`)
      .set(TEST_CSRF_HEADERS)
      .send({ payment: { amount: '100.00', method: 'CASH' } });
    expect(confirmed.status).toBe(409);
    expect(confirmed.body.error.message).toBe(CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE);
  });

  it('allows later Admin payment on CONDUCE and denies Seller', async () => {
    const seller = await fixture('SELLER');
    const admin = await fixture('ADMINISTRATOR');
    const customer = await creditCustomer();
    const draft = await draftWithLine(seller.agent, customer.id);
    const issued = await seller.agent
      .post(`${ROOT}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(issued.status).toBe(200);

    const denied = await seller.agent
      .post(`${ROOT}/${draft.id}/payments`)
      .set(TEST_CSRF_HEADERS)
      .send({
        amount: '100.00',
        method: 'CASH',
        effectiveDate: businessDateString(new Date(issued.body.confirmedAt)),
        idempotencyKey: randomUUID(),
      });
    expect(denied.status).toBe(403);

    const paid = await admin.agent
      .post(`${ROOT}/${draft.id}/payments`)
      .set(TEST_CSRF_HEADERS)
      .send({
        amount: '250.00',
        method: 'TRANSFER',
        effectiveDate: businessDateString(new Date(issued.body.confirmedAt)),
        idempotencyKey: randomUUID(),
      });
    expect(paid.status).toBe(201);
    expect(paid.body).toMatchObject({ status: 'CONDUCE', paid: '250.00', balance: '750.00' });
  });

  it('rejects payments on draft and preserves ledger after convert and cancel', async () => {
    const { agent } = await fixture('ADMINISTRATOR');
    const customer = await namedCashCustomer();
    const draft = await draftWithLine(agent, customer.id);
    const dueDate = businessDateString(new Date());

    const onDraft = await agent
      .post(`${ROOT}/${draft.id}/payments`)
      .set(TEST_CSRF_HEADERS)
      .send({
        amount: '10.00',
        method: 'CASH',
        effectiveDate: dueDate,
        idempotencyKey: randomUUID(),
      });
    expect(onDraft.status).toBe(409);
    expect(onDraft.body.error.message).toBe(PAYMENT_COMPLETED_ONLY_MESSAGE);

    const issued = await agent
      .post(`${ROOT}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({
        payment: { amount: '300.00', method: 'CASH' },
        dueDate,
      });
    expect(issued.status).toBe(200);

    const converted = await agent
      .post(`${ROOT}/${draft.id}/convert-conduce-to-invoice`)
      .set(TEST_CSRF_HEADERS)
      .send({ fiscal: false });
    expect(converted.status).toBe(200);
    expect(converted.body).toMatchObject({
      status: 'COMPLETED',
      number: 'FAC-000001',
      conduceNumber: 'CON-000001',
      paid: '300.00',
      balance: '700.00',
      dueDate,
    });

    const byCon = await agent.get(`${ROOT}/receivables?invoice=CON-000001`);
    expect(byCon.body.invoices[0].id).toBe(draft.id);

    const cancelled = await agent
      .post(`${ROOT}/${draft.id}/cancel`)
      .set(TEST_CSRF_HEADERS)
      .send({
        reason: 'Cliente desistió',
        refundAmount: '100.00',
        refundMethod: 'CASH',
        idempotencyKey: randomUUID(),
      });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({
      status: 'CANCELLED',
      balance: '0.00',
      paid: '300.00',
      refunded: '100.00',
    });
    const movements = await prisma.invoicePayment.findMany({
      where: { invoiceId: draft.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(movements.map((row) => [row.kind, row.amount.toFixed(2)])).toEqual([
      ['PAYMENT', '300.00'],
      ['REFUND', '100.00'],
    ]);
  });

  it('cancels an unpaid conduce with refund 0 and rejects refund above net', async () => {
    const { agent } = await fixture('ADMINISTRATOR');
    const customer = await creditCustomer();
    const unpaid = await draftWithLine(agent, customer.id);
    const issued = await agent
      .post(`${ROOT}/${unpaid.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(issued.status).toBe(200);

    const cancelUnpaid = await agent
      .post(`${ROOT}/${unpaid.id}/cancel`)
      .set(TEST_CSRF_HEADERS)
      .send({
        reason: 'Sin cobro',
        refundAmount: '0.00',
        idempotencyKey: randomUUID(),
      });
    expect(cancelUnpaid.status).toBe(200);
    expect(cancelUnpaid.body.paymentState).toBe('CANCELLED');
    expect(await prisma.invoicePayment.count({ where: { invoiceId: unpaid.id } })).toBe(0);

    const named = await namedCashCustomer('Para reembolso');
    const paidDraft = await draftWithLine(agent, named.id);
    const dueDate = businessDateString(new Date());
    const paid = await agent
      .post(`${ROOT}/${paidDraft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({
        payment: { amount: '200.00', method: 'CASH' },
        dueDate,
      });
    expect(paid.status).toBe(200);

    const over = await agent
      .post(`${ROOT}/${paidDraft.id}/cancel`)
      .set(TEST_CSRF_HEADERS)
      .send({
        reason: 'Exceso',
        refundAmount: '200.01',
        refundMethod: 'CASH',
        idempotencyKey: randomUUID(),
      });
    expect(over.status).toBe(409);
    expect(over.body.error.message).toBe(CANCELLATION_REFUND_EXCEEDS_NET_MESSAGE);
  });

  it('rejects concurrent CREDIT DOP conduces that would exceed the limit', async () => {
    const { agent } = await fixture('ADMINISTRATOR');
    const customer = await creditCustomer({ creditLimitDop: '1000.00' });
    const first = await draftWithLine(agent, customer.id, { unitPrice: '800.00' });
    const second = await draftWithLine(agent, customer.id, { unitPrice: '800.00' });

    const [a, b] = await Promise.all([
      agent.post(`${ROOT}/${first.id}/issue-conduce`).set(TEST_CSRF_HEADERS).send({}),
      agent.post(`${ROOT}/${second.id}/issue-conduce`).set(TEST_CSRF_HEADERS).send({}),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const conflict = a.status === 409 ? a : b;
    expect(conflict.body.error.message).toBe(CREDIT_LIMIT_EXCEEDED_MESSAGE);
  });

  it('derives CREDIT DOP dueDate from frozen term on conduce emission', async () => {
    const { agent } = await fixture('SELLER');
    const customer = await creditCustomer({ creditTermDays: 30 });
    const draft = await draftWithLine(agent, customer.id);
    const issued = await agent
      .post(`${ROOT}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(issued.status).toBe(200);
    const expected = new Date(issued.body.confirmedAt);
    // dueDate is emission local calendar day + 30, stored as YYYY-MM-DD
    const emissionDay = businessDateString(expected);
    const [y, m, d] = emissionDay.split('-').map(Number);
    const due = new Date(Date.UTC(y!, m! - 1, d! + 30));
    expect(issued.body.dueDate).toBe(due.toISOString().slice(0, 10));
  });

  it('requires full payment when Seller issues named-CASH conduce', async () => {
    const { agent } = await fixture('SELLER');
    const customer = await namedCashCustomer();
    const draft = await draftWithLine(agent, customer.id, { unitPrice: '100.00' });
    const issued = await agent
      .post(`${ROOT}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send(cashSaleFullPayment('100.00'));
    expect(issued.status).toBe(200);
    expect(issued.body.status).toBe('CONDUCE');
    // Seller projections omit ledger fields (PAY-007); settle state is in the payment row.
    const paid = await prisma.invoicePayment.findFirst({
      where: { invoiceId: draft.id, kind: 'PAYMENT' },
    });
    expect(paid?.amount.toFixed(2)).toBe('100.00');
  });

  it('rejects conduce retries with different amount, method, or dueDate', async () => {
    const { agent } = await fixture('ADMINISTRATOR');
    const customer = await namedCashCustomer();
    const draft = await draftWithLine(agent, customer.id);
    const dueDate = businessDateString(new Date());
    const body = {
      payment: { amount: '400.00', method: 'CASH' as const },
      dueDate,
    };

    const issued = await agent
      .post(`${ROOT}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send(body);
    expect(issued.status).toBe(200);

    const same = await agent
      .post(`${ROOT}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send(body);
    expect(same.status).toBe(200);
    expect(same.body.conduceNumber).toBe('CON-000001');
    expect(await prisma.invoicePayment.count({ where: { invoiceId: draft.id } })).toBe(1);

    const amountMismatch = await agent
      .post(`${ROOT}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({ payment: { amount: '300.00', method: 'CASH' }, dueDate });
    expect(amountMismatch.status).toBe(409);
    expect(amountMismatch.body.error.message).toBe(CONDUCE_RETRY_MISMATCH_MESSAGE);

    const methodMismatch = await agent
      .post(`${ROOT}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({ payment: { amount: '400.00', method: 'TRANSFER' }, dueDate });
    expect(methodMismatch.status).toBe(409);
    expect(methodMismatch.body.error.message).toBe(CONDUCE_RETRY_MISMATCH_MESSAGE);

    const [y, m, d] = dueDate.split('-').map(Number);
    const otherDue = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
    const dueMismatch = await agent
      .post(`${ROOT}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({ payment: { amount: '400.00', method: 'CASH' }, dueDate: otherDue });
    expect(dueMismatch.status).toBe(409);
    expect(dueMismatch.body.error.message).toBe(CONDUCE_RETRY_MISMATCH_MESSAGE);
  });
});
