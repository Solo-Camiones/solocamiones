import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { hashPassword } from '../../../src/features/access/password.js';
import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import { HistoryRepository } from '../../../src/features/history/repository.js';
import { PDF_COMPLETED_ONLY_MESSAGE } from '../../../src/features/invoice-documents/constants.js';
import {
  CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE,
  DRAFT_ONLY_CONFIRM_MESSAGE,
  EXPIRED_QUOTE_CONVERT_MESSAGE,
  QUOTE_ISSUED_ONLY_CONVERT_MESSAGE,
} from '../../../src/features/sales/constants.js';
import { SalesService } from '../../../src/features/sales/service.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';
import { TEST_CSRF_HEADERS } from '../../helpers/sales.js';

const app = createTestApp();
const users = new UserRepository();
const ROOT = '/api/sales';
const PASSWORD = 'personal-password';

function concatenatedPdfHexOperands(pdf: Buffer): string {
  return [...pdf.toString('latin1').matchAll(/\[(.*?)\]\s*TJ/gs)]
    .flatMap((textOperation) => [...textOperation[1].matchAll(/<([0-9a-f]+)>/gi)])
    .map((hexOperand) => hexOperand[1])
    .join('');
}

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

async function creditCustomer(name = 'Cliente cotizado', rnc = '00112345678') {
  return prisma.customer.create({
    data: {
      name,
      rnc,
      customerType: 'CREDIT',
      creditLimitDop: '10000.00',
      creditTermDays: 60,
      contacts: { create: { phone: '809-555-0101', isPrimary: true } },
    },
  });
}

async function quoteWithLine(agent: request.Agent, customerId: string) {
  const quote = await agent
    .post(`${ROOT}/quotes`)
    .set(TEST_CSRF_HEADERS)
    .send({ customerId, applyItbis: true });
  expect(quote.status).toBe(201);
  const line = await agent
    .post(`${ROOT}/${quote.body.id}/lines`)
    .set(TEST_CSRF_HEADERS)
    .send({ type: 'GENERIC', description: 'Filtro', notes: 'Nota por línea', unitPrice: '100.00' });
  expect(line.status).toBe(201);
  return line.body;
}

async function cleanup() {
  vi.restoreAllMocks();
  await resetLoginRateLimit();
  await clearTestHistory();
  await prisma.invoicePayment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.invoiceSequence.updateMany({
    where: { name: { in: ['FAC', 'COT'] } },
    data: { nextValue: 1 },
  });
  await prisma.customerContact.deleteMany({ where: { customer: { isDefault: false } } });
  await prisma.customer.deleteMany({ where: { isDefault: false } });
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

afterEach(cleanup);
afterAll(disconnectPrisma);

describe('convertible quotes HTTP (QUOTE-001/002)', () => {
  it('issues atomically, freezes commercial identity, is immutable and idempotent', async () => {
    const { agent } = await fixture('SELLER');
    const customer = await creditCustomer();
    const draft = await quoteWithLine(agent, customer.id);
    expect(draft).toMatchObject({ status: 'QUOTE_DRAFT', quoteNumber: null });

    const issued = await agent
      .post(`${ROOT}/${draft.id}/issue-quote`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(issued.status).toBe(200);
    expect(issued.body).toMatchObject({
      status: 'QUOTE_ISSUED',
      number: null,
      quoteNumber: 'COT-000001',
      customerSnapshot: { name: 'Cliente cotizado', rnc: '00112345678', phone: '809-555-0101' },
      totals: { base: '100.00', itbis: '18.00', gross: '118.00' },
    });
    expect(issued.body).not.toHaveProperty('paymentState');
    expect(issued.body).not.toHaveProperty('payments');
    expect(issued.body).not.toHaveProperty('profitability');
    expect(issued.body).not.toHaveProperty('document');

    const retry = await agent
      .post(`${ROOT}/${draft.id}/issue-quote`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(retry.status).toBe(200);
    expect(retry.body.quoteNumber).toBe('COT-000001');
    expect(await prisma.invoiceSequence.findUnique({ where: { name: 'COT' } })).toMatchObject({ nextValue: 2 });
    expect((await agent.patch(`${ROOT}/${draft.id}`).set(TEST_CSRF_HEADERS).send({ currency: 'USD' })).status).toBe(409);
    expect((await agent.post(`${ROOT}/${draft.id}/payments`).set(TEST_CSRF_HEADERS).send({ amount: '1.00', method: 'CASH', effectiveDate: '2026-09-16', idempotencyKey: 'quote-pay' })).status).toBe(403);
  });

  it('converts the same aggregate with current credit rules and frozen identity', async () => {
    const { agent } = await fixture();
    const customer = await creditCustomer();
    const draft = await quoteWithLine(agent, customer.id);
    const issued = await agent.post(`${ROOT}/${draft.id}/issue-quote`).set(TEST_CSRF_HEADERS).send({});
    expect(issued.status).toBe(200);
    expect((await agent.post(`${ROOT}/${draft.id}/payments`).set(TEST_CSRF_HEADERS).send({ amount: '1.00', method: 'CASH', effectiveDate: '2026-09-16', idempotencyKey: 'quote-pay' })).status).toBe(409);

    await prisma.customer.update({
      where: { id: customer.id },
      data: { name: 'Nombre nuevo', creditTermDays: 90, creditLimitDop: '20000.00' },
    });
    const converted = await agent
      .post(`${ROOT}/${draft.id}/convert-quote`)
      .set(TEST_CSRF_HEADERS)
      .send({});
    expect(converted.status).toBe(200);
    expect(converted.body).toMatchObject({
      id: draft.id,
      status: 'COMPLETED',
      number: 'FAC-000001',
      quoteNumber: 'COT-000001',
      customerSnapshot: { name: 'Cliente cotizado', rnc: '00112345678', phone: '809-555-0101' },
      customer: { customerType: 'CREDIT', creditTermDays: 90 },
    });
    expect(converted.body.lines).toHaveLength(1);
    expect(converted.body.lines[0]).toMatchObject({ description: 'Filtro', notes: 'Nota por línea', unitPrice: '100.00' });
    const retry = await agent.post(`${ROOT}/${draft.id}/convert-quote`).set(TEST_CSRF_HEADERS).send({});
    expect(retry.status).toBe(200);
    expect(retry.body.number).toBe('FAC-000001');
    expect(await prisma.invoiceLine.count({ where: { invoiceId: draft.id } })).toBe(1);
    expect(await prisma.historyEvent.count({ where: { subjectId: draft.id, eventType: 'QUOTE_CONVERTED' } })).toBe(1);
  });

  it('duplicates issued quotes as independent editable drafts', async () => {
    const { agent } = await fixture();
    const source = await quoteWithLine(agent, (await creditCustomer()).id);
    await agent.post(`${ROOT}/${source.id}/issue-quote`).set(TEST_CSRF_HEADERS).send({});
    const duplicated = await agent.post(`${ROOT}/${source.id}/duplicate-quote`).set(TEST_CSRF_HEADERS).send({});
    expect(duplicated.status).toBe(201);
    expect(duplicated.body).toMatchObject({ status: 'QUOTE_DRAFT', quoteNumber: null, number: null });
    expect(duplicated.body.id).not.toBe(source.id);
    expect(duplicated.body.lines[0]).toMatchObject({ description: 'Filtro', notes: 'Nota por línea', unitPrice: '100.00' });
    expect((await agent.patch(`${ROOT}/${duplicated.body.id}`).set(TEST_CSRF_HEADERS).send({ applyItbis: false })).status).toBe(200);
  });

  it('rejects expired conversion and a normal draft on the explicit command', async () => {
    const { agent } = await fixture();
    const source = await quoteWithLine(agent, (await creditCustomer()).id);
    await agent.post(`${ROOT}/${source.id}/issue-quote`).set(TEST_CSRF_HEADERS).send({});
    await prisma.invoice.update({
      where: { id: source.id },
      data: {
        quoteIssuedAt: new Date('2026-01-01T04:00:00.000Z'),
        quoteExpiresAt: new Date('2026-01-31T03:59:59.999Z'),
      },
    });
    const expired = await agent.post(`${ROOT}/${source.id}/convert-quote`).set(TEST_CSRF_HEADERS).send({});
    expect(expired.status).toBe(409);
    expect(expired.body.error.message).toBe(EXPIRED_QUOTE_CONVERT_MESSAGE);
    expect(await prisma.invoiceSequence.findUnique({ where: { name: 'FAC' } })).toMatchObject({ nextValue: 1 });

    const normal = await agent.post(ROOT).set(TEST_CSRF_HEADERS).send({});
    const wrongCommand = await agent.post(`${ROOT}/${normal.body.id}/convert-quote`).set(TEST_CSRF_HEADERS).send({});
    expect(wrongCommand.status).toBe(409);
    expect(wrongCommand.body.error.message).toBe(QUOTE_ISSUED_ONLY_CONVERT_MESSAGE);
  });

  it('converts a cash quote only with full payment and rejects confirm on the quote command', async () => {
    const { agent } = await fixture();
    const customer = await prisma.customer.create({
      data: { name: 'Cliente contado nombrado', customerType: 'CASH' },
    });
    const draft = await quoteWithLine(agent, customer.id);
    expect((await agent.post(`${ROOT}/${draft.id}/issue-quote`).set(TEST_CSRF_HEADERS).send({})).status).toBe(
      200,
    );

    const unpaid = await agent.post(`${ROOT}/${draft.id}/convert-quote`).set(TEST_CSRF_HEADERS).send({});
    expect(unpaid.status).toBe(409);
    expect(unpaid.body.error.message).toBe(CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE);
    expect(await prisma.invoice.findUnique({ where: { id: draft.id } })).toMatchObject({
      status: 'QUOTE_ISSUED',
      number: null,
    });

    const confirmInstead = await agent.post(`${ROOT}/${draft.id}/confirm`).set(TEST_CSRF_HEADERS).send({
      payment: { amount: '118.00', method: 'CASH' },
    });
    expect(confirmInstead.status).toBe(409);
    expect(confirmInstead.body.error.message).toBe(DRAFT_ONLY_CONFIRM_MESSAGE);

    const converted = await agent.post(`${ROOT}/${draft.id}/convert-quote`).set(TEST_CSRF_HEADERS).send({
      payment: { amount: '118.00', method: 'CASH' },
    });
    expect(converted.status).toBe(200);
    expect(converted.body).toMatchObject({
      id: draft.id,
      status: 'COMPLETED',
      number: 'FAC-000001',
      quoteNumber: 'COT-000001',
    });
  });

  it('assigns unique COT numbers concurrently and rejects Mechanics', async () => {
    const { agent } = await fixture();
    const customer = await creditCustomer();
    const first = await quoteWithLine(agent, customer.id);
    const second = await quoteWithLine(agent, customer.id);
    const results = await Promise.all([
      agent.post(`${ROOT}/${first.id}/issue-quote`).set(TEST_CSRF_HEADERS).send({}),
      agent.post(`${ROOT}/${second.id}/issue-quote`).set(TEST_CSRF_HEADERS).send({}),
    ]);
    expect(results.map((result) => result.body.quoteNumber).sort()).toEqual(['COT-000001', 'COT-000002']);

    const mechanic = await fixture('MECHANIC');
    expect((await mechanic.agent.post(`${ROOT}/quotes`).set(TEST_CSRF_HEADERS).send({})).status).toBe(403);
  });

  it('lets Seller download an issued quote as COT- without changing the aggregate', async () => {
    const { agent } = await fixture('SELLER');
    const draft = await quoteWithLine(agent, (await creditCustomer()).id);
    const issued = await agent.post(`${ROOT}/${draft.id}/issue-quote`).set(TEST_CSRF_HEADERS).send({});
    expect(issued.status).toBe(200);

    const pdf = await agent.get(`${ROOT}/${draft.id}/pdf`).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
    expect(pdf.headers['content-disposition']).toMatch(/filename="COT-000001\.pdf"/);
    expect(Buffer.from(pdf.body).subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const stored = await prisma.invoice.findUnique({ where: { id: draft.id } });
    expect(stored).toMatchObject({
      status: 'QUOTE_ISSUED',
      number: null,
      quoteNumber: 'COT-000001',
    });
    expect(await prisma.invoicePayment.count({ where: { invoiceId: draft.id } })).toBe(0);
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: draft.id, eventType: 'INVOICE_PDF_GENERATED' },
      }),
    ).toBe(0);
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: draft.id, eventType: 'QUOTE_ISSUED' },
      }),
    ).toBe(1);

    const converted = await agent.post(`${ROOT}/${draft.id}/convert-quote`).set(TEST_CSRF_HEADERS).send({});
    expect(converted.status).toBe(200);
    expect(converted.body).toMatchObject({
      status: 'COMPLETED',
      number: 'FAC-000001',
      quoteNumber: 'COT-000001',
    });
    const invoicePdf = await agent.get(`${ROOT}/${draft.id}/pdf`).buffer(true);
    expect(invoicePdf.status).toBe(200);
    expect(invoicePdf.headers['content-disposition']).toMatch(/filename="FAC-000001\.pdf"/);
    const invoicePdfBuffer = Buffer.from(invoicePdf.body);
    expect(invoicePdfBuffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(concatenatedPdfHexOperands(invoicePdfBuffer)).toContain(
      Buffer.from('COT-000001').toString('hex'),
    );
    await expect(prisma.invoice.findUnique({ where: { id: draft.id } })).resolves.toMatchObject({
      pdfTemplateVersion: 'internal-v4',
    });
  });

  it('lets Administrator download an expired issued quote and rejects draft and Mechanic', async () => {
    const { agent } = await fixture();
    const mechanic = await fixture('MECHANIC');
    const source = await quoteWithLine(agent, (await creditCustomer()).id);
    expect((await agent.post(`${ROOT}/${source.id}/issue-quote`).set(TEST_CSRF_HEADERS).send({})).status).toBe(
      200,
    );
    await prisma.invoice.update({
      where: { id: source.id },
      data: {
        quoteIssuedAt: new Date('2026-01-01T04:00:00.000Z'),
        quoteExpiresAt: new Date('2026-01-31T03:59:59.999Z'),
      },
    });

    const expiredPdf = await agent.get(`${ROOT}/${source.id}/pdf`).buffer(true);
    expect(expiredPdf.status).toBe(200);
    expect(expiredPdf.headers['content-disposition']).toMatch(/filename="COT-000001\.pdf"/);
    expect(await prisma.invoice.findUnique({ where: { id: source.id } })).toMatchObject({
      status: 'QUOTE_ISSUED',
      number: null,
    });

    const quoteDraft = await quoteWithLine(
      agent,
      (await creditCustomer('Otro cliente', '00112345679')).id,
    );
    const draftPdf = await agent.get(`${ROOT}/${quoteDraft.id}/pdf`);
    expect(draftPdf.status).toBe(409);
    expect(draftPdf.body.error.message).toBe(PDF_COMPLETED_ONLY_MESSAGE);

    expect((await mechanic.agent.get(`${ROOT}/${source.id}/pdf`)).status).toBe(403);
  });

  it('rolls back quote issue and COT allocation when history fails', async () => {
    const { agent, user } = await fixture();
    const draft = await quoteWithLine(agent, (await creditCustomer()).id);
    vi.spyOn(HistoryRepository.prototype, 'append').mockRejectedValueOnce(
      new Error('history-unavailable'),
    );

    await expect(new SalesService().issueQuote(user.id, draft.id)).rejects.toThrow(
      'history-unavailable',
    );
    expect(await prisma.invoice.findUnique({ where: { id: draft.id } })).toMatchObject({
      status: 'QUOTE_DRAFT',
      quoteNumber: null,
    });
    expect(await prisma.invoiceSequence.findUnique({ where: { name: 'COT' } })).toMatchObject({
      nextValue: 1,
    });
  });
});
