import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import { hashPassword } from '../../../src/features/access/password.js';
import { businessDateString } from '../../../src/features/payments/dates.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';
import { assignNamedCustomerForCredit, TEST_CSRF_HEADERS } from '../../helpers/sales.js';

const users = new UserRepository();
const PASSWORD = 'personal-password';
const REPORT = '/api/sales/reports/seller-sales';
const REPORT_PDF = '/api/sales/reports/seller-sales.pdf';

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
  return { agent, user };
}

async function confirmCreditInvoice(agent: request.Agent, customerId?: string) {
  const draft = await agent.post('/api/sales').set(TEST_CSRF_HEADERS).send({});
  expect(draft.status).toBe(201);
  await agent.post(`/api/sales/${draft.body.id}/lines`).set(TEST_CSRF_HEADERS).send({
    type: 'GENERIC',
    description: 'Filtro de aceite',
    unitPrice: '1000.00',
  });
  const assignedCustomerId = await assignNamedCustomerForCredit(agent, draft.body.id, customerId);
  const confirmed = await agent.post(`/api/sales/${draft.body.id}/confirm`).set(TEST_CSRF_HEADERS).send({});
  expect(confirmed.status).toBe(200);
  return { invoice: confirmed.body, customerId: assignedCustomerId };
}

async function issueCreditQuote(agent: request.Agent, customerId?: string) {
  let assignedCustomerId = customerId;
  if (!assignedCustomerId) {
    const customer = await prisma.customer.create({
      data: {
        name: `Cliente cotizado ${randomUUID().slice(0, 8)}`,
        rnc: Array.from({ length: 11 }, () => String(Math.floor(Math.random() * 10))).join(''),
        customerType: 'CREDIT',
        creditLimitDop: '999999.99',
        creditTermDays: 60,
      },
    });
    assignedCustomerId = customer.id;
  }
  const quote = await agent
    .post('/api/sales/quotes')
    .set(TEST_CSRF_HEADERS)
    .send({ customerId: assignedCustomerId, applyItbis: false });
  expect(quote.status).toBe(201);
  await agent.post(`/api/sales/${quote.body.id}/lines`).set(TEST_CSRF_HEADERS).send({
    type: 'GENERIC',
    description: 'Bomba de agua',
    unitPrice: '500.00',
  });
  const issued = await agent
    .post(`/api/sales/${quote.body.id}/issue-quote`)
    .set(TEST_CSRF_HEADERS)
    .send({});
  expect(issued.status).toBe(200);
  return { quote: issued.body, customerId: assignedCustomerId };
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

describe('seller sales report HTTP', () => {
  afterEach(cleanup);

  it('requires Administrator auth and rejects invalid date queries', async () => {
    const app = createTestApp();
    const anonymous = request.agent(app);
    const admin = await fixture(request.agent(app), 'ADMINISTRATOR');
    const seller = await fixture(request.agent(app), 'SELLER');

    const unauthenticated = await anonymous.get(`${REPORT}?${reportQuery()}`);
    const denied = await seller.agent.get(`${REPORT}?${reportQuery()}`);
    const missingDates = await admin.agent.get(REPORT);
    const inverted = await admin.agent.get(
      `${REPORT}?dateFrom=2026-09-30&dateTo=2026-09-01`,
    );
    const badFormat = await admin.agent.get(
      `${REPORT}?dateFrom=09-01-2026&dateTo=2026-09-18`,
    );

    expect(unauthenticated.status).toBe(401);
    expect(denied.status).toBe(403);
    expect(missingDates.status).toBe(400);
    expect(inverted.status).toBe(400);
    expect(badFormat.status).toBe(400);
  });

  it('includes COMPLETED, CONDUCE, and QUOTE_ISSUED and excludes cancelled and drafts', async () => {
    const app = createTestApp();
    const admin = await fixture(request.agent(app), 'ADMINISTRATOR');
    const completed = await confirmCreditInvoice(admin.agent);
    const issued = await issueCreditQuote(admin.agent, completed.customerId);
    const cancelled = await confirmCreditInvoice(admin.agent, completed.customerId);
    const cancelResponse = await admin.agent
      .post(`/api/sales/${cancelled.invoice.id}/cancel`)
      .set(TEST_CSRF_HEADERS)
      .send({ reason: 'Cliente desistió', idempotencyKey: randomUUID() });
    expect(cancelResponse.status).toBe(200);

    const draft = await admin.agent.post('/api/sales').set(TEST_CSRF_HEADERS).send({});
    expect(draft.status).toBe(201);
    expect(
      (
        await admin.agent.post(`/api/sales/${draft.body.id}/lines`).set(TEST_CSRF_HEADERS).send({
          type: 'GENERIC',
          description: 'Conduce pendiente',
          unitPrice: '250.00',
        })
      ).status,
    ).toBe(201);
    await assignNamedCustomerForCredit(admin.agent, draft.body.id, completed.customerId);
    const conduce = await admin.agent
      .post(`/api/sales/${draft.body.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(conduce.status).toBe(200);

    const quoteDraft = await admin.agent
      .post('/api/sales/quotes')
      .set(TEST_CSRF_HEADERS)
      .send({ customerId: completed.customerId });
    expect(quoteDraft.status).toBe(201);

    const response = await admin.agent.get(`${REPORT}?${reportQuery()}`);

    expect(response.status).toBe(200);
    expect(response.body.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentType: 'INVOICE',
          number: completed.invoice.number,
          originNumber: null,
          sellerUserId: admin.user.id,
          gross: '1000.00',
        }),
        expect.objectContaining({
          documentType: 'CONDUCE',
          number: conduce.body.conduceNumber,
          originNumber: null,
          sellerUserId: admin.user.id,
          gross: '250.00',
        }),
        expect.objectContaining({
          documentType: 'QUOTE',
          number: issued.quote.quoteNumber,
          originNumber: null,
          sellerUserId: admin.user.id,
          gross: '500.00',
        }),
      ]),
    );
    expect(response.body.rows).toHaveLength(3);
    expect(response.body.total).toBe(3);
    expect(response.body.page).toBe(1);
    expect(response.body.pageSize).toBe(10);
    expect(response.body.rows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ number: cancelled.invoice.number }),
        expect.objectContaining({ id: draft.body.id }),
        expect.objectContaining({ id: quoteDraft.body.id }),
      ]),
    );
    expect(response.body.totals).toEqual([
      expect.objectContaining({
        sellerUserId: admin.user.id,
        currency: 'DOP',
        gross: '1750.00',
      }),
    ]);
  });

  it('does not double-count after converting a quote to an invoice', async () => {
    const app = createTestApp();
    const admin = await fixture(request.agent(app), 'ADMINISTRATOR');
    const issued = await issueCreditQuote(admin.agent);
    const converted = await admin.agent
      .post(`/api/sales/${issued.quote.id}/convert-quote`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(converted.status).toBe(200);

    const response = await admin.agent.get(`${REPORT}?${reportQuery()}`);

    expect(response.status).toBe(200);
    expect(response.body.rows).toHaveLength(1);
    expect(response.body.rows[0]).toMatchObject({
      documentType: 'INVOICE',
      number: converted.body.number,
      gross: '500.00',
    });
    expect(response.body.rows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentType: 'QUOTE',
          number: issued.quote.quoteNumber,
        }),
      ]),
    );
  });

  it('filters rows by sellerUserId', async () => {
    const app = createTestApp();
    const admin = await fixture(request.agent(app), 'ADMINISTRATOR', 'Ana Administradora');
    const seller = await fixture(request.agent(app), 'SELLER', 'Sara Vendedora');
    const adminSale = await confirmCreditInvoice(admin.agent);
    const sellerSale = await confirmCreditInvoice(seller.agent, adminSale.customerId);

    const filtered = await admin.agent.get(
      `${REPORT}?${reportQuery({ sellerUserId: seller.user.id })}`,
    );
    const all = await admin.agent.get(`${REPORT}?${reportQuery()}`);

    expect(filtered.status).toBe(200);
    expect(filtered.body.rows).toHaveLength(1);
    expect(filtered.body.rows[0]).toMatchObject({
      number: sellerSale.invoice.number,
      sellerUserId: seller.user.id,
      sellerName: 'Sara Vendedora',
    });
    expect(all.body.rows).toHaveLength(2);
  });

  it('paginates JSON rows like other sales lists while totals cover the full range', async () => {
    const app = createTestApp();
    const admin = await fixture(request.agent(app), 'ADMINISTRATOR');
    const first = await confirmCreditInvoice(admin.agent);
    await confirmCreditInvoice(admin.agent, first.customerId);
    await confirmCreditInvoice(admin.agent, first.customerId);

    const page1 = await admin.agent.get(`${REPORT}?${reportQuery({ page: '1', pageSize: '2' })}`);
    const page2 = await admin.agent.get(`${REPORT}?${reportQuery({ page: '2', pageSize: '2' })}`);

    expect(page1.status).toBe(200);
    expect(page1.body.page).toBe(1);
    expect(page1.body.pageSize).toBe(2);
    expect(page1.body.total).toBe(3);
    expect(page1.body.rows).toHaveLength(2);
    expect(page1.body.totals).toEqual([
      expect.objectContaining({
        sellerUserId: admin.user.id,
        currency: 'DOP',
        gross: '3000.00',
      }),
    ]);

    expect(page2.status).toBe(200);
    expect(page2.body.page).toBe(2);
    expect(page2.body.rows).toHaveLength(1);
    expect(page2.body.total).toBe(3);
    expect(page2.body.totals[0].gross).toBe('3000.00');
    expect(page1.body.rows[0].number).not.toBe(page2.body.rows[0].number);
  });

  it('downloads the PDF attachment for Administrator with mocked renderer', async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from('%PDF-seller-sales'));
    const app = createTestApp({ sellerSalesPdfRenderer: { render } });
    const admin = await fixture(request.agent(app), 'ADMINISTRATOR');
    const sale = await confirmCreditInvoice(admin.agent);
    const { dateFrom, dateTo } = todayRange();

    const response = await admin.agent.get(`${REPORT_PDF}?${reportQuery()}`).buffer(true);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/pdf/);
    expect(response.headers['content-disposition']).toContain(
      `ventas-vendedores-${dateFrom.replaceAll('-', '')}-${dateTo.replaceAll('-', '')}.pdf`,
    );
    expect(response.body.toString('utf8')).toBe('%PDF-seller-sales');
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom,
        dateTo,
        rows: [
          expect.objectContaining({
            documentTypeLabel: 'Factura',
            number: sale.invoice.number,
            currency: 'DOP',
          }),
        ],
        totals: [expect.objectContaining({ currency: 'DOP' })],
      }),
    );
  });
});
