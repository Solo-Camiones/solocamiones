import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import { hashPassword } from '../../../src/features/access/password.js';
import {
  businessDateString,
  databaseDate,
  databaseDateString,
  invoiceDueDate,
} from '../../../src/features/payments/dates.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import {
  CANCELLATION_COMPLETED_ONLY_MESSAGE,
  CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE,
  PAYMENT_COMPLETED_ONLY_MESSAGE,
  PAYMENT_DATE_RANGE_MESSAGE,
  PAYMENT_EXCEEDS_BALANCE_MESSAGE,
  PAYMENT_IDEMPOTENCY_MISMATCH_MESSAGE,
} from '../../../src/features/sales/constants.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';
import { assignNamedCustomerForCredit } from '../../helpers/sales.js';

const users = new UserRepository();
const PASSWORD = 'personal-password';
const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };
const SALES = '/api/sales';

function concatenatedPdfHexOperands(pdf: Buffer): string {
  return [...pdf.toString('latin1').matchAll(/\[(.*?)\]\s*TJ/gs)]
    .flatMap((textOperation) => [...textOperation[1].matchAll(/<([0-9a-f]+)>/gi)])
    .map((hexOperand) => hexOperand[1])
    .join('');
}

async function fixture(agent: request.Agent, role: Role) {
  const user = await users.create({
    name: role === 'ADMINISTRATOR' ? 'Ana Administradora' : 'Sara Vendedora',
    username: randomUUID(),
    role,
    passwordHash: await hashPassword(PASSWORD),
  });
  const login = await agent
    .post('/api/auth/login')
    .send({ username: user.username, password: PASSWORD });
  expect(login.status).toBe(200);
  return { agent, user };
}

async function confirmInvoice(
  agent: request.Agent,
  body: Record<string, unknown> = {},
  creditCustomerId?: string,
) {
  const draft = await agent.post(SALES).set(CSRF).send({});
  await agent.post(`${SALES}/${draft.body.id}/lines`).set(CSRF).send({
    type: 'GENERIC',
    description: 'Filtro de aceite',
    unitPrice: '1000.00',
  });
  if (!body.payment) {
    await assignNamedCustomerForCredit(agent, draft.body.id, creditCustomerId);
  }
  const confirmed = await agent.post(`${SALES}/${draft.body.id}/confirm`).set(CSRF).send(body);
  expect(confirmed.status).toBe(200);
  return confirmed.body;
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

describe('payments, due date, and cancellation HTTP', () => {
  afterEach(cleanup);

  it('records a full initial payment atomically with confirmation', async () => {
    const seller = await fixture(request.agent(createTestApp()), 'ADMINISTRATOR');
    const payment = {
      amount: '1000.00',
      method: 'CASH',
      reference: null,
      idempotencyKey: randomUUID(),
    };
    const invoice = await confirmInvoice(seller.agent, { payment });
    const retry = await seller.agent
      .post(`${SALES}/${invoice.id}/confirm`)
      .set(CSRF)
      .send({ payment });

    expect(invoice).toMatchObject({ paymentState: 'PAID', paid: '1000.00', balance: '0.00' });
    expect(retry.status).toBe(200);
    expect(await prisma.invoicePayment.count({ where: { invoiceId: invoice.id } })).toBe(1);
  });

  it.each(['1000.01', '9999999999.99'])(
    'rejects an initial payment of %s when it exceeds the invoice total',
    async (amount) => {
      const seller = await fixture(request.agent(createTestApp()), 'ADMINISTRATOR');
      const draft = await seller.agent.post(SALES).set(CSRF).send({});
      await seller.agent.post(`${SALES}/${draft.body.id}/lines`).set(CSRF).send({
        type: 'GENERIC',
        description: 'Filtro de aceite',
        unitPrice: '1000.00',
      });

      const response = await seller.agent
        .post(`${SALES}/${draft.body.id}/confirm`)
        .set(CSRF)
        .send({ payment: { amount, method: 'CASH', idempotencyKey: randomUUID() } });

      expect(response.status).toBe(409);
      expect(response.body.error.message).toBe(PAYMENT_EXCEEDS_BALANCE_MESSAGE);
      await expect(
        prisma.invoice.findUnique({ where: { id: draft.body.id } }),
      ).resolves.toMatchObject({ status: 'DRAFT', number: null });
      await expect(
        prisma.invoicePayment.count({ where: { invoiceId: draft.body.id } }),
      ).resolves.toBe(0);
    },
  );

  it('rejects confirming Cliente contado without a full initial payment', async () => {
    const seller = await fixture(request.agent(createTestApp()), 'ADMINISTRATOR');
    const draft = await seller.agent.post(SALES).set(CSRF).send({});
    await seller.agent.post(`${SALES}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'GENERIC',
      description: 'Filtro de aceite',
      unitPrice: '1000.00',
    });

    const unpaid = await seller.agent.post(`${SALES}/${draft.body.id}/confirm`).set(CSRF).send({});
    expect(unpaid.status).toBe(409);
    expect(unpaid.body.error.message).toBe(CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE);

    const partial = await seller.agent
      .post(`${SALES}/${draft.body.id}/confirm`)
      .set(CSRF)
      .send({
        payment: { amount: '250.00', method: 'CASH' },
      });
    expect(partial.status).toBe(409);
    expect(partial.body.error.message).toBe(CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE);

    expect(await prisma.invoice.findUnique({ where: { id: draft.body.id } })).toMatchObject({
      status: 'DRAFT',
      number: null,
    });
  });

  it('snapshots seller and customer term due date, then records an idempotent partial payment', async () => {
    const app = createTestApp();
    const seller = await fixture(request.agent(app), 'SELLER');
    const admin = await fixture(request.agent(app), 'ADMINISTRATOR');
    const invoice = await confirmInvoice(seller.agent);
    const confirmedAt = new Date(invoice.confirmedAt);

    expect(invoice).toMatchObject({
      sellerName: 'Sara Vendedora',
    });
    expect(invoice.paymentState).toBeUndefined();
    expect(invoice.balance).toBeUndefined();

    const administratorView = await admin.agent.get(`${SALES}/${invoice.id}`);
    expect(administratorView.status).toBe(200);
    expect(administratorView.body).toMatchObject({
      paymentState: 'PENDING',
      balance: '1000.00',
    });
    expect(invoice.dueDate).toBe(databaseDateString(invoiceDueDate(confirmedAt, 60)));

    const body = {
      amount: '250.00',
      method: 'TRANSFER',
      effectiveDate: businessDateString(confirmedAt),
      reference: null,
      idempotencyKey: randomUUID(),
    };
    const first = await admin.agent.post(`${SALES}/${invoice.id}/payments`).set(CSRF).send(body);
    const retry = await admin.agent.post(`${SALES}/${invoice.id}/payments`).set(CSRF).send(body);

    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      paymentState: 'PARTIALLY_PAID',
      paid: '250.00',
      balance: '750.00',
    });
    expect(retry.status).toBe(201);
    expect(await prisma.invoicePayment.count({ where: { invoiceId: invoice.id } })).toBe(1);

    const sellerDetail = await seller.agent.get(`${SALES}/${invoice.id}`);
    expect(sellerDetail.status).toBe(200);
    expect(sellerDetail.body.history.map((event: { type: string }) => event.type)).not.toContain(
      'PAYMENT_RECORDED',
    );

    const adminDetail = await admin.agent.get(`${SALES}/${invoice.id}`);
    expect(adminDetail.status).toBe(200);
    expect(adminDetail.body.history.map((event: { type: string }) => event.type)).toContain(
      'PAYMENT_RECORDED',
    );

    const mismatchedRetry = await admin.agent
      .post(`${SALES}/${invoice.id}/payments`)
      .set(CSRF)
      .send({ ...body, amount: '300.00' });
    expect(mismatchedRetry.status).toBe(409);
    expect(await prisma.invoicePayment.count({ where: { invoiceId: invoice.id } })).toBe(1);
  });

  it.each([
    ['amount', { amount: '251.00' }],
    ['method', { method: 'CHECK' }],
    ['effective date', { effectiveDate: '2026-09-01' }],
    ['reference', { reference: 'REF-DIFFERENT' }],
  ])('rejects reuse of a payment idempotency key with a different %s', async (_field, change) => {
    const seller = await fixture(request.agent(createTestApp()), 'ADMINISTRATOR');
    const invoice = await confirmInvoice(seller.agent);
    const body = {
      amount: '250.00',
      method: 'TRANSFER',
      effectiveDate: businessDateString(new Date(invoice.confirmedAt)),
      reference: 'REF-ORIGINAL',
      idempotencyKey: randomUUID(),
    };
    const first = await seller.agent.post(`${SALES}/${invoice.id}/payments`).set(CSRF).send(body);

    const mismatch = await seller.agent
      .post(`${SALES}/${invoice.id}/payments`)
      .set(CSRF)
      .send({ ...body, ...change });

    expect(first.status).toBe(201);
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.message).toBe(PAYMENT_IDEMPOTENCY_MISMATCH_MESSAGE);
    await expect(prisma.invoicePayment.count({ where: { invoiceId: invoice.id } })).resolves.toBe(
      1,
    );
  });

  it('accepts a payment exactly equal to the outstanding balance', async () => {
    const seller = await fixture(request.agent(createTestApp()), 'ADMINISTRATOR');
    const invoice = await confirmInvoice(seller.agent);

    const payment = await seller.agent
      .post(`${SALES}/${invoice.id}/payments`)
      .set(CSRF)
      .send({
        amount: '1000.00',
        method: 'CHECK',
        effectiveDate: businessDateString(new Date(invoice.confirmedAt)),
        reference: 'CHK-100',
        idempotencyKey: randomUUID(),
      });

    expect(payment.status).toBe(201);
    expect(payment.body).toMatchObject({ paymentState: 'PAID', paid: '1000.00', balance: '0.00' });
  });

  it('rejects a payment that exceeds the remaining balance without adding a movement', async () => {
    const seller = await fixture(request.agent(createTestApp()), 'ADMINISTRATOR');
    const invoice = await confirmInvoice(seller.agent);
    const effectiveDate = businessDateString(new Date(invoice.confirmedAt));
    await seller.agent.post(`${SALES}/${invoice.id}/payments`).set(CSRF).send({
      amount: '900.00',
      method: 'CASH',
      effectiveDate,
      idempotencyKey: randomUUID(),
    });

    const overpayment = await seller.agent.post(`${SALES}/${invoice.id}/payments`).set(CSRF).send({
      amount: '100.01',
      method: 'TRANSFER',
      effectiveDate,
      idempotencyKey: randomUUID(),
    });

    expect(overpayment.status).toBe(409);
    expect(overpayment.body.error.message).toBe(PAYMENT_EXCEEDS_BALANCE_MESSAGE);
    await expect(prisma.invoicePayment.count({ where: { invoiceId: invoice.id } })).resolves.toBe(
      1,
    );
  });

  it('rejects payments while the invoice is still a draft', async () => {
    const seller = await fixture(request.agent(createTestApp()), 'ADMINISTRATOR');
    const draft = await seller.agent.post(SALES).set(CSRF).send({});

    const payment = await seller.agent
      .post(`${SALES}/${draft.body.id}/payments`)
      .set(CSRF)
      .send({
        amount: '1.00',
        method: 'CASH',
        effectiveDate: businessDateString(new Date()),
        idempotencyKey: randomUUID(),
      });

    expect(payment.status).toBe(409);
    expect(payment.body.error.message).toBe(PAYMENT_COMPLETED_ONLY_MESSAGE);
  });

  it('derives paid late from the effective settlement date and rejects invalid dates', async () => {
    const seller = await fixture(request.agent(createTestApp()), 'ADMINISTRATOR');
    const invoice = await confirmInvoice(seller.agent);
    const today = businessDateString(new Date());
    const yesterday = databaseDate(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await prisma.invoice.update({ where: { id: invoice.id }, data: { dueDate: yesterday } });

    const paid = await seller.agent.post(`${SALES}/${invoice.id}/payments`).set(CSRF).send({
      amount: '1000.00',
      method: 'CASH',
      effectiveDate: today,
      idempotencyKey: randomUUID(),
    });
    expect(paid.status).toBe(201);
    expect(paid.body).toMatchObject({ paymentState: 'PAID_LATE', balance: '0.00' });

    const future = databaseDate(today);
    future.setUTCDate(future.getUTCDate() + 1);
    const invalid = await seller.agent
      .post(`${SALES}/${invoice.id}/payments`)
      .set(CSRF)
      .send({
        amount: '1.00',
        method: 'CASH',
        effectiveDate: businessDateString(future),
        idempotencyKey: randomUUID(),
      });
    expect(invalid.status).toBe(409);
  });

  it.each(['before confirmation', 'after today'])(
    'rejects an effective date %s',
    async (position) => {
      const seller = await fixture(request.agent(createTestApp()), 'ADMINISTRATOR');
      const invoice = await confirmInvoice(seller.agent);
      const boundary =
        position === 'before confirmation' ? new Date(invoice.confirmedAt) : new Date();
      const date = databaseDate(businessDateString(boundary));
      date.setUTCDate(date.getUTCDate() + (position === 'before confirmation' ? -1 : 1));

      const payment = await seller.agent
        .post(`${SALES}/${invoice.id}/payments`)
        .set(CSRF)
        .send({
          amount: '1.00',
          method: 'CASH',
          effectiveDate: databaseDateString(date),
          idempotencyKey: randomUUID(),
        });

      expect(payment.status).toBe(409);
      expect(payment.body.error.message).toBe(PAYMENT_DATE_RANGE_MESSAGE);
      await expect(prisma.invoicePayment.count({ where: { invoiceId: invoice.id } })).resolves.toBe(
        0,
      );
    },
  );

  it('allows only Administrator cancellation and refunds the full net received atomically', async () => {
    const app = createTestApp();
    const seller = await fixture(request.agent(app), 'SELLER');
    const admin = await fixture(request.agent(app), 'ADMINISTRATOR');
    const invoice = await confirmInvoice(seller.agent);
    await admin.agent
      .post(`${SALES}/${invoice.id}/payments`)
      .set(CSRF)
      .send({
        amount: '400.00',
        method: 'CHECK',
        effectiveDate: businessDateString(new Date(invoice.confirmedAt)),
        idempotencyKey: randomUUID(),
      });

    const denied = await seller.agent.post(`${SALES}/${invoice.id}/cancel`).set(CSRF).send({
      reason: 'Solicitud del cliente',
      refundAmount: '400.00',
      refundMethod: 'CASH',
      idempotencyKey: randomUUID(),
    });
    expect(denied.status).toBe(403);

    const cancellation = {
      reason: 'Solicitud del cliente',
      refundAmount: '400.00',
      refundMethod: 'TRANSFER',
      idempotencyKey: randomUUID(),
    };
    const cancelled = await admin.agent
      .post(`${SALES}/${invoice.id}/cancel`)
      .set(CSRF)
      .send(cancellation);
    const retry = await admin.agent
      .post(`${SALES}/${invoice.id}/cancel`)
      .set(CSRF)
      .send(cancellation);
    expect(cancelled.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(cancelled.body).toMatchObject({
      status: 'CANCELLED',
      paymentState: 'CANCELLED',
      balance: '0.00',
      cancelledByName: 'Ana Administradora',
    });
    const movements = await prisma.invoicePayment.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(movements.map((movement) => [movement.kind, movement.amount.toFixed(2)])).toEqual([
      ['PAYMENT', '400.00'],
      ['REFUND', '400.00'],
    ]);

    const pdf = await admin.agent.get(`${SALES}/${invoice.id}/pdf`).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/pdf/);
    const cancelledPdfText = concatenatedPdfHexOperands(Buffer.from(pdf.body));
    expect(cancelledPdfText).toContain(Buffer.from('CANCELADA').toString('hex'));
    expect(cancelledPdfText).toContain(Buffer.from('Solicitud del cliente').toString('hex'));
  });

  it('cancels a completed invoice whose PDF fields are still unset', async () => {
    const admin = await fixture(request.agent(createTestApp()), 'ADMINISTRATOR');
    const invoice = await confirmInvoice(admin.agent);
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        pdfStatus: null,
        pdfErrorId: null,
        pdfGeneratedAt: null,
        pdfTemplateVersion: null,
      },
    });

    const cancelled = await admin.agent.post(`${SALES}/${invoice.id}/cancel`).set(CSRF).send({
      reason: 'Cliente desistió antes del documento',
      idempotencyKey: randomUUID(),
    });

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    await expect(prisma.invoice.findUnique({ where: { id: invoice.id } })).resolves.toMatchObject({
      status: 'CANCELLED',
      pdfStatus: null,
      pdfTemplateVersion: null,
    });
  });

  it('requires a refund amount and method when cancelling an invoice with net money received', async () => {
    const app = createTestApp();
    const seller = await fixture(request.agent(app), 'SELLER');
    const admin = await fixture(request.agent(app), 'ADMINISTRATOR');
    const invoice = await confirmInvoice(seller.agent);
    await admin.agent
      .post(`${SALES}/${invoice.id}/payments`)
      .set(CSRF)
      .send({
        amount: '300.00',
        method: 'CASH',
        effectiveDate: businessDateString(new Date(invoice.confirmedAt)),
        idempotencyKey: randomUUID(),
      });

    const missingAmount = await admin.agent.post(`${SALES}/${invoice.id}/cancel`).set(CSRF).send({
      reason: 'Venta anulada',
      idempotencyKey: randomUUID(),
    });
    expect(missingAmount.status).toBe(409);
    expect(missingAmount.body.error.message).toBe(
      'La cancelación requiere el monto de reembolso cuando hay neto cobrado',
    );

    const missingMethod = await admin.agent.post(`${SALES}/${invoice.id}/cancel`).set(CSRF).send({
      reason: 'Venta anulada',
      refundAmount: '300.00',
      idempotencyKey: randomUUID(),
    });
    expect(missingMethod.status).toBe(409);
    expect(missingMethod.body.error.message).toBe(
      'La cancelación requiere el método del reembolso cuando el monto es mayor que cero',
    );

    await expect(prisma.invoice.findUnique({ where: { id: invoice.id } })).resolves.toMatchObject({
      status: 'COMPLETED',
    });
    await expect(prisma.invoicePayment.count({ where: { invoiceId: invoice.id } })).resolves.toBe(
      1,
    );
  });

  it('cancels an unpaid invoice without inventing a refund movement', async () => {
    const app = createTestApp();
    const seller = await fixture(request.agent(app), 'SELLER');
    const admin = await fixture(request.agent(app), 'ADMINISTRATOR');
    const invoice = await confirmInvoice(seller.agent);

    const cancellation = await admin.agent.post(`${SALES}/${invoice.id}/cancel`).set(CSRF).send({
      reason: 'Cliente desistió',
      idempotencyKey: randomUUID(),
    });

    expect(cancellation.status).toBe(200);
    expect(cancellation.body).toMatchObject({
      status: 'CANCELLED',
      paymentState: 'CANCELLED',
      paid: '0.00',
      refunded: '0.00',
      balance: '0.00',
    });
    await expect(prisma.invoicePayment.count({ where: { invoiceId: invoice.id } })).resolves.toBe(
      0,
    );
  });

  it('rejects cancellation retry with a different idempotency key', async () => {
    const admin = await fixture(request.agent(createTestApp()), 'ADMINISTRATOR');
    const invoice = await confirmInvoice(admin.agent);
    const first = await admin.agent.post(`${SALES}/${invoice.id}/cancel`).set(CSRF).send({
      reason: 'Venta anulada',
      idempotencyKey: randomUUID(),
    });

    const retry = await admin.agent.post(`${SALES}/${invoice.id}/cancel`).set(CSRF).send({
      reason: 'Venta anulada',
      idempotencyKey: randomUUID(),
    });

    expect(first.status).toBe(200);
    expect(retry.status).toBe(409);
    expect(retry.body.error.message).toBe(CANCELLATION_COMPLETED_ONLY_MESSAGE);
  });

  it('rejects cancellation while the invoice is still a draft', async () => {
    const admin = await fixture(request.agent(createTestApp()), 'ADMINISTRATOR');
    const draft = await admin.agent.post(SALES).set(CSRF).send({});

    const cancellation = await admin.agent.post(`${SALES}/${draft.body.id}/cancel`).set(CSRF).send({
      reason: 'Venta anulada',
      idempotencyKey: randomUUID(),
    });

    expect(cancellation.status).toBe(409);
    expect(cancellation.body.error.message).toBe(CANCELLATION_COMPLETED_ONLY_MESSAGE);
  });

  it('lists open receivables by customer and currency and hides settled invoices', async () => {
    const seller = await fixture(request.agent(createTestApp()), 'ADMINISTRATOR');
    const open = await confirmInvoice(seller.agent);
    const paid = await confirmInvoice(seller.agent, {
      payment: { amount: '1000.00', method: 'CASH', idempotencyKey: randomUUID() },
    });

    const receivables = await seller.agent.get(`${SALES}/receivables`);
    expect(receivables.status).toBe(200);
    expect(receivables.body.customers).toEqual([
      expect.objectContaining({
        customerId: open.customer.id,
        currency: 'DOP',
        invoiceCount: 1,
        invoiced: '1000.00',
        paid: '0.00',
        balance: '1000.00',
      }),
    ]);
    expect(receivables.body.invoices.map((row: { id: string }) => row.id)).toEqual([open.id]);
    expect(receivables.body.invoices.map((row: { id: string }) => row.id)).not.toContain(paid.id);
    expect(receivables.body.invoices[0].confirmedAt).toBe(open.confirmedAt);

    const byNumber = await seller.agent.get(`${SALES}/receivables?invoice=${open.number}`);
    expect(byNumber.status).toBe(200);
    expect(byNumber.body.invoices.map((row: { id: string }) => row.id)).toEqual([open.id]);

    const byUuid = await seller.agent.get(`${SALES}/receivables?invoice=${open.id}`);
    expect(byUuid.status).toBe(400);

    const byCustomer = await seller.agent.get(
      `${SALES}/receivables?customerId=${open.customer.id}`,
    );
    expect(byCustomer.status).toBe(200);
    expect(byCustomer.body.invoices.map((row: { id: string }) => row.id)).toEqual([open.id]);
  });

  it('filters overdue partial balances with the same state derived by invoice detail', async () => {
    const admin = await fixture(request.agent(createTestApp()), 'ADMINISTRATOR');
    const invoice = await confirmInvoice(admin.agent);
    const yesterday = databaseDate(businessDateString(new Date()));
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await prisma.invoice.update({ where: { id: invoice.id }, data: { dueDate: yesterday } });

    const payment = await admin.agent
      .post(`${SALES}/${invoice.id}/payments`)
      .set(CSRF)
      .send({
        amount: '250.00',
        method: 'CASH',
        effectiveDate: businessDateString(new Date()),
        idempotencyKey: randomUUID(),
      });
    const receivables = await admin.agent.get(`${SALES}/receivables`);

    expect(payment.status).toBe(201);
    expect(payment.body).toMatchObject({
      paymentState: 'PARTIALLY_PAID_OVERDUE',
      paid: '250.00',
      balance: '750.00',
    });
    expect(receivables.status).toBe(200);
    expect(receivables.body.invoices).toEqual([
      expect.objectContaining({
        id: invoice.id,
        paymentState: 'PARTIALLY_PAID_OVERDUE',
        paid: '250.00',
        balance: '750.00',
      }),
    ]);
  });

  it('rejects an invalid invoice filter at the HTTP boundary', async () => {
    const admin = await fixture(request.agent(createTestApp()), 'ADMINISTRATOR');

    const invalidInvoice = await admin.agent.get(`${SALES}/receivables?invoice=123`);
    expect(invalidInvoice.status).toBe(400);

    const retiredPaymentState = await admin.agent.get(`${SALES}/receivables?paymentState=PENDING`);
    const retiredCurrency = await admin.agent.get(`${SALES}/receivables?currency=DOP`);
    const retiredIssuedFrom = await admin.agent.get(`${SALES}/receivables?issuedFrom=2026-09-01`);
    expect(retiredPaymentState.status).toBe(400);
    expect(retiredCurrency.status).toBe(400);
    expect(retiredIssuedFrom.status).toBe(400);
  });

  it('paginates open receivables newest-first while keeping the complete customer aggregate', async () => {
    const seller = await fixture(request.agent(createTestApp()), 'ADMINISTRATOR');
    const first = await confirmInvoice(seller.agent);
    const second = await confirmInvoice(seller.agent, {}, first.customer.id);

    const firstPage = await seller.agent.get(`${SALES}/receivables?page=1&pageSize=1`);
    const secondPage = await seller.agent.get(`${SALES}/receivables?page=2&pageSize=1`);

    expect(firstPage.status).toBe(200);
    expect(secondPage.status).toBe(200);
    expect(firstPage.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(secondPage.body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    // Most recently confirmed invoice appears on page 1.
    expect(firstPage.body.invoices[0].id).toBe(second.id);
    expect(secondPage.body.invoices[0].id).toBe(first.id);
    expect(firstPage.body.customers).toEqual([
      expect.objectContaining({
        invoiceCount: 2,
        invoiced: '2000.00',
        paid: '0.00',
        balance: '2000.00',
      }),
    ]);

    const pagePastEnd = await seller.agent.get(`${SALES}/receivables?page=3&pageSize=1`);
    expect(pagePastEnd.body).toMatchObject({ invoices: [], total: 2, page: 3, pageSize: 1 });
  });
});
