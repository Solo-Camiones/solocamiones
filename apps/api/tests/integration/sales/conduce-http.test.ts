import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { hashPassword } from '../../../src/features/access/password.js';
import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import {
  CONDUCE_DUE_DATE_REQUIRED_MESSAGE,
  CONDUCE_FISCAL_RETRY_MISMATCH_MESSAGE,
  CONDUCE_ONLY_CONVERT_TO_INVOICE_MESSAGE,
  DRAFT_ONLY_EDIT_MESSAGE,
  DRAFT_ONLY_ISSUE_CONDUCE_MESSAGE,
  EXPIRED_QUOTE_CONVERT_MESSAGE,
  FISCAL_IDENTITY_REQUIRED_MESSAGE,
  QUOTE_ISSUED_ONLY_CONVERT_TO_CONDUCE_MESSAGE,
} from '../../../src/features/sales/constants.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';
import { cashSaleFullPayment, TEST_CSRF_HEADERS } from '../../helpers/sales.js';

const app = createTestApp();
const users = new UserRepository();
const ROOT = '/api/sales';
const PASSWORD = 'personal-password';

async function fixture(role: Role = 'ADMINISTRATOR') {
  const user = await users.create({
    name: 'Fixture',
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

async function creditCustomer(name = 'Cliente crédito conduce', rnc = '00112345678') {
  return prisma.customer.create({
    data: {
      name,
      rnc,
      customerType: 'CREDIT',
      creditLimitDop: '10000.00',
      creditTermDays: 60,
      contacts: { create: { phone: '809-555-0202', isPrimary: true } },
    },
  });
}

async function namedCashCustomer(name = 'Cliente contado nombrado') {
  return prisma.customer.create({
    data: {
      name,
      customerType: 'CASH',
      contacts: { create: { phone: '809-555-0303', isPrimary: true } },
    },
  });
}

async function draftWithLine(
  agent: request.Agent,
  customerId: string,
  options: { applyItbis?: boolean; fiscal?: boolean } = {},
) {
  const draft = await agent
    .post(ROOT)
    .set(TEST_CSRF_HEADERS)
    .send({
      customerId,
      applyItbis: options.applyItbis ?? true,
      fiscal: options.fiscal ?? false,
    });
  expect(draft.status).toBe(201);
  const line = await agent
    .post(`${ROOT}/${draft.body.id}/lines`)
    .set(TEST_CSRF_HEADERS)
    .send({
      type: 'GENERIC',
      description: 'Aceite',
      notes: 'Nota conduce',
      unitPrice: '100.00',
    });
  expect(line.status).toBe(201);
  return line.body;
}

async function issuedQuoteWithLine(agent: request.Agent, customerId: string) {
  const quote = await agent
    .post(`${ROOT}/quotes`)
    .set(TEST_CSRF_HEADERS)
    .send({ customerId, applyItbis: true });
  expect(quote.status).toBe(201);
  const withLine = await agent
    .post(`${ROOT}/${quote.body.id}/lines`)
    .set(TEST_CSRF_HEADERS)
    .send({
      type: 'GENERIC',
      description: 'Filtro',
      notes: 'Nota cotización',
      unitPrice: '100.00',
    });
  expect(withLine.status).toBe(201);
  const issued = await agent
    .post(`${ROOT}/${quote.body.id}/issue-quote`)
    .set(TEST_CSRF_HEADERS)
    .send({});
  expect(issued.status).toBe(200);
  return issued.body;
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

describe('conduce emission and conversion HTTP (CON-001/CON-003)', () => {
  it('issues a conduce from draft, freezes commercial identity, and is immutable', async () => {
    const { agent } = await fixture('SELLER');
    const customer = await creditCustomer();
    const draft = await draftWithLine(agent, customer.id);

    const issued = await agent
      .post(`${ROOT}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(issued.status).toBe(200);
    expect(issued.body).toMatchObject({
      id: draft.id,
      status: 'CONDUCE',
      number: null,
      invoiceIssuedAt: null,
      conduceNumber: 'CON-000001',
      fiscal: false,
      sellerName: 'Fixture',
      customerSnapshot: {
        name: 'Cliente crédito conduce',
        rnc: '00112345678',
        phone: '809-555-0202',
      },
      totals: { base: '100.00', itbis: '18.00', gross: '118.00' },
    });
    expect(issued.body.conduceIssuedAt).toEqual(issued.body.confirmedAt);
    expect(issued.body).not.toHaveProperty('document');

    expect(
      (await agent.patch(`${ROOT}/${draft.id}`).set(TEST_CSRF_HEADERS).send({ currency: 'USD' }))
        .status,
    ).toBe(409);
    expect(
      (
        await agent
          .post(`${ROOT}/${draft.id}/lines`)
          .set(TEST_CSRF_HEADERS)
          .send({ type: 'GENERIC', description: 'Extra', unitPrice: '1.00' })
      ).body.error.message,
    ).toBe(DRAFT_ONLY_EDIT_MESSAGE);

    expect(await prisma.historyEvent.count({ where: { subjectId: draft.id, eventType: 'CONDUCE_ISSUED' } })).toBe(
      1,
    );

    const retry = await agent
      .post(`${ROOT}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(retry.status).toBe(200);
    expect(retry.body.conduceNumber).toBe('CON-000001');
    expect(await prisma.invoiceSequence.findUnique({ where: { name: 'CON' } })).toMatchObject({
      nextValue: 2,
    });
    expect(
      await prisma.historyEvent.count({ where: { subjectId: draft.id, eventType: 'CONDUCE_ISSUED' } }),
    ).toBe(1);
  });

  it('converts a valid quote to conduce and rejects expired quotes', async () => {
    const { agent } = await fixture();
    const customer = await creditCustomer();
    const quote = await issuedQuoteWithLine(agent, customer.id);

    await prisma.customer.update({
      where: { id: customer.id },
      data: { name: 'Nombre nuevo', creditTermDays: 90 },
    });

    const converted = await agent
      .post(`${ROOT}/${quote.id}/convert-quote-to-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(converted.status).toBe(200);
    expect(converted.body).toMatchObject({
      id: quote.id,
      status: 'CONDUCE',
      conduceNumber: 'CON-000001',
      quoteNumber: 'COT-000001',
      number: null,
      fiscal: false,
      customerSnapshot: {
        name: 'Cliente crédito conduce',
        rnc: '00112345678',
        phone: '809-555-0202',
      },
      // Live credit terms are revalidated and snapshotted at emission (same as quote→invoice).
      customer: { customerType: 'CREDIT', creditTermDays: 90 },
      totals: { base: '100.00', itbis: '18.00', gross: '118.00' },
    });
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: quote.id, eventType: 'QUOTE_CONVERTED_TO_CONDUCE' },
      }),
    ).toBe(1);

    const retry = await agent
      .post(`${ROOT}/${quote.id}/convert-quote-to-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(retry.status).toBe(200);
    expect(retry.body.conduceNumber).toBe('CON-000001');
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: quote.id, eventType: 'QUOTE_CONVERTED_TO_CONDUCE' },
      }),
    ).toBe(1);

    const expiredSource = await issuedQuoteWithLine(agent, customer.id);
    await prisma.invoice.update({
      where: { id: expiredSource.id },
      data: {
        quoteIssuedAt: new Date('2026-01-01T04:00:00.000Z'),
        quoteExpiresAt: new Date('2026-01-31T03:59:59.999Z'),
      },
    });
    const expired = await agent
      .post(`${ROOT}/${expiredSource.id}/convert-quote-to-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(expired.status).toBe(409);
    expect(expired.body.error.message).toBe(EXPIRED_QUOTE_CONVERT_MESSAGE);
    expect(await prisma.invoiceSequence.findUnique({ where: { name: 'CON' } })).toMatchObject({
      nextValue: 2,
    });
  });

  it('converts conduce to fiscal/non-fiscal invoice without recalculating money or payments', async () => {
    const seller = await fixture('SELLER');
    const customer = await namedCashCustomer();
    await prisma.customer.update({
      where: { id: customer.id },
      data: { rnc: '00114567890' },
    });
    const draft = await draftWithLine(seller.agent, customer.id, { fiscal: true });
    const issued = await seller.agent
      .post(`${ROOT}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send(cashSaleFullPayment('118.00'));
    expect(issued.status).toBe(200);
    expect(issued.body).toMatchObject({
      status: 'CONDUCE',
      fiscal: false,
      conduceNumber: 'CON-000001',
      sellerName: 'Fixture',
    });
    // Seller timeline hides payment ledger (PAY-007); verify settlement from persistence.
    expect(await prisma.invoicePayment.count({ where: { invoiceId: draft.id } })).toBe(1);
    const payment = await prisma.invoicePayment.findFirst({ where: { invoiceId: draft.id } });
    expect(payment?.amount.toFixed(2)).toBe('118.00');

    const confirmedAt = issued.body.confirmedAt;
    const dueDate = issued.body.dueDate;

    const admin = await fixture('ADMINISTRATOR');
    const detailBefore = await admin.agent.get(`${ROOT}/${draft.id}`);
    expect(detailBefore.status).toBe(200);
    expect(detailBefore.body).toMatchObject({
      paymentState: 'PAID',
      balance: '0.00',
    });
    const paymentId = detailBefore.body.payments[0].id;

    const invoiced = await admin.agent
      .post(`${ROOT}/${draft.id}/convert-conduce-to-invoice`)
      .set(TEST_CSRF_HEADERS)
      .send({ fiscal: true });
    expect(invoiced.status).toBe(200);
    expect(invoiced.body).toMatchObject({
      id: draft.id,
      status: 'COMPLETED',
      number: 'FAC-000001',
      conduceNumber: 'CON-000001',
      fiscal: true,
      confirmedAt,
      dueDate,
      sellerName: 'Fixture',
      paymentState: 'PAID',
      balance: '0.00',
      totals: { base: '100.00', itbis: '18.00', gross: '118.00' },
    });
    expect(invoiced.body.invoiceIssuedAt).not.toBeNull();
    expect(invoiced.body.invoiceIssuedAt).not.toEqual(confirmedAt);
    expect(invoiced.body.payments).toHaveLength(1);
    expect(invoiced.body.payments[0].id).toBe(paymentId);
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: draft.id, eventType: 'CONDUCE_INVOICED' },
      }),
    ).toBe(1);
    expect(
      await prisma.historyEvent.findFirst({
        where: { subjectId: draft.id, eventType: 'CONDUCE_INVOICED' },
      }),
    ).toMatchObject({ actorUserId: admin.user.id });
    expect(
      await prisma.invoice.findUnique({
        where: { id: draft.id },
        select: { confirmedByUserId: true },
      }),
    ).toMatchObject({ confirmedByUserId: seller.user.id });

    const retrySame = await admin.agent
      .post(`${ROOT}/${draft.id}/convert-conduce-to-invoice`)
      .set(TEST_CSRF_HEADERS)
      .send({ fiscal: true });
    expect(retrySame.status).toBe(200);
    expect(retrySame.body.number).toBe('FAC-000001');
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: draft.id, eventType: 'CONDUCE_INVOICED' },
      }),
    ).toBe(1);

    const mismatch = await admin.agent
      .post(`${ROOT}/${draft.id}/convert-conduce-to-invoice`)
      .set(TEST_CSRF_HEADERS)
      .send({ fiscal: false });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.message).toBe(CONDUCE_FISCAL_RETRY_MISMATCH_MESSAGE);
  });

  it('rejects fiscal conversion when the frozen snapshot lacks identity', async () => {
    const { agent } = await fixture();
    const customer = await namedCashCustomer('Sin RNC');
    const draft = await draftWithLine(agent, customer.id);
    const issued = await agent
      .post(`${ROOT}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send(cashSaleFullPayment('118.00'));
    expect(issued.status).toBe(200);

    const fiscal = await agent
      .post(`${ROOT}/${draft.id}/convert-conduce-to-invoice`)
      .set(TEST_CSRF_HEADERS)
      .send({ fiscal: true });
    expect(fiscal.status).toBe(409);
    expect(fiscal.body.error.message).toBe(FISCAL_IDENTITY_REQUIRED_MESSAGE);

    const nonFiscal = await agent
      .post(`${ROOT}/${draft.id}/convert-conduce-to-invoice`)
      .set(TEST_CSRF_HEADERS)
      .send({ fiscal: false });
    expect(nonFiscal.status).toBe(200);
    expect(nonFiscal.body).toMatchObject({
      status: 'COMPLETED',
      number: 'FAC-000001',
      fiscal: false,
      conduceNumber: 'CON-000001',
    });
  });

  it('rejects wrong source status, named-CASH without dueDate when balance remains, and cancelled conversion', async () => {
    const { agent } = await fixture();
    const cash = await namedCashCustomer();
    const unpaidDraft = await draftWithLine(agent, cash.id);
    const unpaid = await agent
      .post(`${ROOT}/${unpaidDraft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(unpaid.status).toBe(409);
    expect(unpaid.body.error.message).toBe(CONDUCE_DUE_DATE_REQUIRED_MESSAGE);

    const draft = await draftWithLine(agent, (await creditCustomer()).id);
    const wrongQuoteCommand = await agent
      .post(`${ROOT}/${draft.id}/convert-quote-to-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(wrongQuoteCommand.status).toBe(409);
    expect(wrongQuoteCommand.body.error.message).toBe(QUOTE_ISSUED_ONLY_CONVERT_TO_CONDUCE_MESSAGE);

    const quote = await issuedQuoteWithLine(agent, (await creditCustomer('Otro crédito', '13109876543')).id);
    const wrongDraftCommand = await agent
      .post(`${ROOT}/${quote.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(wrongDraftCommand.status).toBe(409);
    expect(wrongDraftCommand.body.error.message).toBe(DRAFT_ONLY_ISSUE_CONDUCE_MESSAGE);

    const wrongConvert = await agent
      .post(`${ROOT}/${draft.id}/convert-conduce-to-invoice`)
      .set(TEST_CSRF_HEADERS)
      .send({ fiscal: false });
    expect(wrongConvert.status).toBe(409);
    expect(wrongConvert.body.error.message).toBe(CONDUCE_ONLY_CONVERT_TO_INVOICE_MESSAGE);

    const issued = await agent
      .post(`${ROOT}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(issued.status).toBe(200);
    const { user } = await fixture();
    await prisma.invoice.update({
      where: { id: draft.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: 'test',
        cancelledByUserId: user.id,
        cancelledByName: user.name,
        cancellationIdempotencyKey: `cancel-${draft.id}`,
      },
    });
    const cancelled = await agent
      .post(`${ROOT}/${draft.id}/convert-conduce-to-invoice`)
      .set(TEST_CSRF_HEADERS)
      .send({ fiscal: false });
    expect(cancelled.status).toBe(409);
    expect(cancelled.body.error.message).toBe(CONDUCE_ONLY_CONVERT_TO_INVOICE_MESSAGE);
  });

  it('forces non-fiscal conduce even when the draft was marked fiscal', async () => {
    const { agent } = await fixture();
    const customer = await creditCustomer('Fiscal draft', '40212345671');
    const draft = await draftWithLine(agent, customer.id, { fiscal: true });
    expect(draft.fiscal).toBe(true);

    const issued = await agent
      .post(`${ROOT}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(issued.status).toBe(200);
    expect(issued.body.fiscal).toBe(false);
  });
});
