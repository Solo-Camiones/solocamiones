import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { hashPassword } from '../../../src/features/access/password.js';
import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { successfulUsdDopRate } from '../../helpers/fx.js';
import { clearTestHistory } from '../../helpers/history.js';
import {
  assignNamedCustomerForCredit,
  cashSaleFullPayment,
  seedKnownLineCost,
  TEST_CSRF_HEADERS,
} from '../../helpers/sales.js';
import { businessDateString } from '../../../src/features/payments/dates.js';

const users = new UserRepository();
const ROOT = '/api/sales';
const PROFIT = '/api/profitability';
const REPORT = '/api/sales/reports/seller-sales';
const PASSWORD = 'personal-password';
const CSRF = TEST_CSRF_HEADERS;

async function fixture(agent: request.Agent, role: Role, name?: string) {
  const user = await users.create({
    name: name ?? (role === 'ADMINISTRATOR' ? 'Ana Administradora' : 'Sara Vendedora'),
    username: randomUUID(),
    role,
    passwordHash: await hashPassword(PASSWORD),
  });
  expect(
    (await agent.post('/api/auth/login').send({ username: user.username, password: PASSWORD }))
      .status,
  ).toBe(200);
  return { user, agent };
}

function todayRange() {
  const today = businessDateString(new Date());
  return { dateFrom: today, dateTo: today };
}

function reportQuery(extra: Record<string, string> = {}) {
  return new URLSearchParams({ ...todayRange(), ...extra }).toString();
}

async function cleanup() {
  vi.restoreAllMocks();
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

afterAll(disconnectPrisma);

describe('CON-006 conduce profitability, reports, and history', () => {
  afterEach(cleanup);

  it('runs USD FX at conduce emission and keeps rate/profit after convert', async () => {
    const getUsdToDopRate = vi.fn(async () => successfulUsdDopRate('61.50'));
    const app = createTestApp({ fxRateProvider: { getUsdToDopRate } });
    const admin = await fixture(request.agent(app), 'ADMINISTRATOR');
    const customer = await prisma.customer.create({
      data: { name: 'Taller USD', rnc: '131123456' },
    });
    const draft = await admin.agent
      .post(ROOT)
      .set(CSRF)
      .send({ currency: 'USD', customerId: customer.id, fiscal: false });
    expect(draft.status).toBe(201);
    const priced = await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'GENERIC',
      description: 'Filtro',
      unitPrice: '118.00',
    });
    expect(priced.status).toBe(201);
    await seedKnownLineCost(priced.body.lines[0].id, 'ACTUAL', '80.00');

    const issued = await admin.agent
      .post(`${ROOT}/${draft.body.id}/issue-conduce`)
      .set(CSRF)
      .send(cashSaleFullPayment('118.00'));
    expect(issued.status).toBe(200);
    expect(issued.body).toMatchObject({
      status: 'CONDUCE',
      conduceNumber: 'CON-000001',
      number: null,
      profitability: {
        status: 'CALCULATED',
        profitDop: '7177.00',
        fx: { exchangeRateDopPerUsd: '61.5' },
      },
    });
    expect(getUsdToDopRate).toHaveBeenCalledTimes(1);

    const converted = await admin.agent
      .post(`${ROOT}/${draft.body.id}/convert-conduce-to-invoice`)
      .set(CSRF)
      .send({ fiscal: false });
    expect(converted.status).toBe(200);
    expect(converted.body).toMatchObject({
      status: 'COMPLETED',
      number: expect.stringMatching(/^FAC-/),
      conduceNumber: 'CON-000001',
      profitability: {
        status: 'CALCULATED',
        profitDop: '7177.00',
        fx: { exchangeRateDopPerUsd: '61.5' },
      },
    });
    expect(getUsdToDopRate).toHaveBeenCalledTimes(1);
  });

  it('allows Administrator manual gross profit on an emitted conduce', async () => {
    const app = createTestApp();
    const admin = await fixture(request.agent(app), 'ADMINISTRATOR');
    const draft = await admin.agent.post(ROOT).set(CSRF).send({});
    expect(draft.status).toBe(201);
    expect(
      (
        await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
          type: 'GENERIC',
          description: 'Sin costo',
          unitPrice: '100.00',
        })
      ).status,
    ).toBe(201);
    await assignNamedCustomerForCredit(admin.agent, draft.body.id);

    const issued = await admin.agent
      .post(`${ROOT}/${draft.body.id}/issue-conduce`)
      .set(CSRF)
      .send({});
    expect(issued.status).toBe(200);
    expect(issued.body.profitability).toEqual({
      status: 'UNAVAILABLE',
      reason: 'UNKNOWN_COST',
      profitDop: null,
      margin: null,
    });

    const recorded = await admin.agent
      .post(`${PROFIT}/${draft.body.id}/manual-gross-profit`)
      .set(CSRF)
      .send({ profitDop: '25.00' });
    expect(recorded.status).toBe(200);
    expect(recorded.body.status).toBe('CONDUCE');
    expect(recorded.body.profitability).toEqual({
      status: 'MANUAL',
      reason: null,
      profitDop: '25.00',
      margin: '25.00',
    });
  });

  it('lists one seller-sales row before and after convert with CON- origin and issuer attribution', async () => {
    const app = createTestApp();
    const seller = await fixture(request.agent(app), 'SELLER', 'Sara Emisora');
    const admin = await fixture(request.agent(app), 'ADMINISTRATOR', 'Ana Facturadora');
    const customer = await prisma.customer.create({
      data: {
        name: 'Cliente crédito reporte',
        rnc: '00199887766',
        customerType: 'CREDIT',
        creditLimitDop: '999999.99',
        creditTermDays: 60,
      },
    });

    const draft = await seller.agent
      .post(ROOT)
      .set(CSRF)
      .send({ customerId: customer.id, applyItbis: false });
    expect(draft.status).toBe(201);
    expect(
      (
        await seller.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
          type: 'GENERIC',
          description: 'Repuesto',
          unitPrice: '1000.00',
        })
      ).status,
    ).toBe(201);

    const issued = await seller.agent
      .post(`${ROOT}/${draft.body.id}/issue-conduce`)
      .set(CSRF)
      .send({});
    expect(issued.status).toBe(200);
    expect(issued.body.conduceNumber).toBe('CON-000001');

    const before = await admin.agent.get(`${REPORT}?${reportQuery()}`);
    expect(before.status).toBe(200);
    expect(before.body.rows).toHaveLength(1);
    expect(before.body.rows[0]).toMatchObject({
      documentType: 'CONDUCE',
      number: 'CON-000001',
      originNumber: null,
      sellerUserId: seller.user.id,
      sellerName: 'Sara Emisora',
      gross: '1000.00',
    });
    expect(before.body.totals[0]).toMatchObject({
      sellerUserId: seller.user.id,
      gross: '1000.00',
    });

    const converted = await admin.agent
      .post(`${ROOT}/${draft.body.id}/convert-conduce-to-invoice`)
      .set(CSRF)
      .send({ fiscal: false });
    expect(converted.status).toBe(200);

    const after = await admin.agent.get(`${REPORT}?${reportQuery()}`);
    expect(after.status).toBe(200);
    expect(after.body.rows).toHaveLength(1);
    expect(after.body.rows[0]).toMatchObject({
      documentType: 'INVOICE',
      number: converted.body.number,
      originNumber: 'CON-000001',
      sellerUserId: seller.user.id,
      sellerName: 'Sara Emisora',
      gross: '1000.00',
    });
    expect(after.body.totals[0]).toMatchObject({
      sellerUserId: seller.user.id,
      gross: '1000.00',
    });
  });

  it('projects ordered timeline with financial events Administrator-only', async () => {
    const app = createTestApp();
    const admin = await fixture(request.agent(app), 'ADMINISTRATOR');
    const seller = await fixture(request.agent(app), 'SELLER');
    const customer = await prisma.customer.create({
      data: {
        name: 'Cliente timeline',
        rnc: '00111223344',
        customerType: 'CREDIT',
        creditLimitDop: '999999.99',
        creditTermDays: 60,
      },
    });

    const quote = await admin.agent
      .post(`${ROOT}/quotes`)
      .set(CSRF)
      .send({ customerId: customer.id, applyItbis: false });
    expect(quote.status).toBe(201);
    expect(
      (
        await admin.agent.post(`${ROOT}/${quote.body.id}/lines`).set(CSRF).send({
          type: 'GENERIC',
          description: 'Timeline',
          unitPrice: '200.00',
        })
      ).status,
    ).toBe(201);
    const issuedQuote = await admin.agent
      .post(`${ROOT}/${quote.body.id}/issue-quote`)
      .set(CSRF)
      .send({});
    expect(issuedQuote.status).toBe(200);

    const conduce = await admin.agent
      .post(`${ROOT}/${quote.body.id}/convert-quote-to-conduce`)
      .set(CSRF)
      .send({});
    expect(conduce.status).toBe(200);

    const payment = await admin.agent
      .post(`${ROOT}/${quote.body.id}/payments`)
      .set(CSRF)
      .send({
        amount: '50.00',
        method: 'CASH',
        effectiveDate: businessDateString(new Date()),
        idempotencyKey: randomUUID(),
      });
    expect(payment.status).toBe(201);

    const invoiced = await admin.agent
      .post(`${ROOT}/${quote.body.id}/convert-conduce-to-invoice`)
      .set(CSRF)
      .send({ fiscal: false });
    expect(invoiced.status).toBe(200);

    const adminDetail = await admin.agent.get(`${ROOT}/${quote.body.id}`);
    expect(adminDetail.status).toBe(200);
    const adminTypes = adminDetail.body.history.map((entry: { type: string }) => entry.type);
    expect(adminTypes).toEqual(
      expect.arrayContaining([
        'QUOTE_ISSUED',
        'QUOTE_CONVERTED_TO_CONDUCE',
        'PAYMENT_RECORDED',
        'CONDUCE_INVOICED',
      ]),
    );
    const quoteIndex = adminTypes.indexOf('QUOTE_ISSUED');
    const conduceIndex = adminTypes.indexOf('QUOTE_CONVERTED_TO_CONDUCE');
    const paymentIndex = adminTypes.indexOf('PAYMENT_RECORDED');
    const invoiceIndex = adminTypes.indexOf('CONDUCE_INVOICED');
    // Timeline is newest-first (occurredAt desc).
    expect(invoiceIndex).toBeLessThan(paymentIndex);
    expect(paymentIndex).toBeLessThan(conduceIndex);
    expect(conduceIndex).toBeLessThan(quoteIndex);

    const sellerDetail = await seller.agent.get(`${ROOT}/${quote.body.id}`);
    expect(sellerDetail.status).toBe(200);
    const sellerTypes = sellerDetail.body.history.map((entry: { type: string }) => entry.type);
    expect(sellerTypes).toEqual(
      expect.arrayContaining(['QUOTE_ISSUED', 'QUOTE_CONVERTED_TO_CONDUCE', 'CONDUCE_INVOICED']),
    );
    expect(sellerTypes).not.toContain('PAYMENT_RECORDED');
  });
});
