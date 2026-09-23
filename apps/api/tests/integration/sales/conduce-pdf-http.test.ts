import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { hashPassword } from '../../../src/features/access/password.js';
import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import {
  PDF_COMPLETED_ONLY_MESSAGE,
  PDF_CONDUCE_ONLY_MESSAGE,
} from '../../../src/features/invoice-documents/constants.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { INVOICE_PDF_NCF_FIELD } from '../../../src/infrastructure/invoice-pdf/index.js';
import { failingInvoicePdfRenderer } from '../../../src/infrastructure/invoice-pdf/index.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';
import { cashSaleFullPayment, TEST_CSRF_HEADERS } from '../../helpers/sales.js';

const users = new UserRepository();
const PASSWORD = 'personal-password';
const SALES = '/api/sales';

async function fixture(agent: request.Agent, role: Role = 'ADMINISTRATOR') {
  const user = await users.create({
    name: 'Fixture',
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

async function cleanup() {
  vi.restoreAllMocks();
  await resetLoginRateLimit();
  await clearTestHistory();
  await prisma.invoicePayment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.invoiceSequence.update({ where: { name: 'FAC' }, data: { nextValue: 1 } });
  await prisma.invoiceSequence.update({ where: { name: 'CON' }, data: { nextValue: 1 } });
  await prisma.invoiceSequence.update({ where: { name: 'COT' }, data: { nextValue: 1 } });
  await prisma.customerContact.deleteMany({ where: { customer: { isDefault: false } } });
  await prisma.customer.deleteMany({ where: { isDefault: false } });
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

afterAll(disconnectPrisma);

async function namedCashCustomer() {
  return prisma.customer.create({
    data: {
      name: 'Cliente contado nombrado PDF',
      customerType: 'CASH',
      contacts: { create: { phone: '809-555-0404', isPrimary: true } },
    },
  });
}

async function draftWithLine(agent: request.Agent, customerId: string) {
  const draft = await agent
    .post(SALES)
    .set(TEST_CSRF_HEADERS)
    .send({ customerId, applyItbis: true, fiscal: false });
  expect(draft.status).toBe(201);
  const line = await agent
    .post(`${SALES}/${draft.body.id}/lines`)
    .set(TEST_CSRF_HEADERS)
    .send({
      type: 'GENERIC',
      description: 'Aceite',
      notes: 'Nota PDF',
      unitPrice: '100.00',
    });
  expect(line.status).toBe(201);
  return line.body;
}

function pdfHexText(pdf: Buffer): string {
  return [...pdf.toString('latin1').matchAll(/\[(.*?)\]\s*TJ/gs)]
    .flatMap((operation) => [...operation[1].matchAll(/<([0-9a-f]+)>/gi)])
    .map((operand) => operand[1])
    .join('');
}

describe('M5 conduce PDF HTTP (CON-004)', () => {
  afterEach(cleanup);

  it('Seller downloads conduce.pdf without NCF; GET /pdf stays unavailable for CONDUCE', async () => {
    const app = createTestApp();
    const { agent } = await fixture(request.agent(app), 'SELLER');
    const customer = await namedCashCustomer();
    const draft = await draftWithLine(agent, customer.id);
    const issued = await agent
      .post(`${SALES}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send(cashSaleFullPayment('118.00'));
    expect(issued.status).toBe(200);
    expect(issued.body.conduceNumber).toMatch(/^CON-\d{6}$/);

    const primary = await agent.get(`${SALES}/${draft.id}/pdf`);
    expect(primary.status).toBe(409);
    expect(primary.body.error.message).toBe(PDF_COMPLETED_ONLY_MESSAGE);

    const pdf = await agent.get(`${SALES}/${draft.id}/conduce.pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
    expect(pdf.headers['content-disposition']).toContain(`${issued.body.conduceNumber}.pdf`);
    const body = Buffer.from(pdf.body);
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const hexText = pdfHexText(body);
    expect(hexText).toContain(Buffer.from('CONDUCE').toString('hex'));
    expect(hexText).toContain(Buffer.from(issued.body.conduceNumber).toString('hex'));
    expect(hexText).not.toContain(Buffer.from('NCF:').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('SALDO PENDIENTE').toString('hex'));
  });

  it('keeps both PDFs after conversion with CON- origin and blank NCF on the invoice', async () => {
    const app = createTestApp();
    const { agent } = await fixture(request.agent(app));
    const customer = await namedCashCustomer();
    const draft = await draftWithLine(agent, customer.id);
    const issued = await agent
      .post(`${SALES}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send(cashSaleFullPayment('118.00'));
    expect(issued.status).toBe(200);

    const converted = await agent
      .post(`${SALES}/${draft.id}/convert-conduce-to-invoice`)
      .set(TEST_CSRF_HEADERS)
      .send({ fiscal: false });
    expect(converted.status).toBe(200);
    expect(converted.body.number).toMatch(/^FAC-\d{6}$/);
    expect(converted.body.document?.status).toBe('READY');

    const invoicePdf = await agent.get(`${SALES}/${draft.id}/pdf`);
    expect(invoicePdf.status).toBe(200);
    const invoiceHex = pdfHexText(Buffer.from(invoicePdf.body));
    expect(invoiceHex).toContain(Buffer.from('FACTURA').toString('hex'));
    expect(invoiceHex).toContain(Buffer.from(converted.body.number).toString('hex'));
    expect(invoiceHex).toContain(Buffer.from(issued.body.conduceNumber).toString('hex'));
    expect(Buffer.from(invoicePdf.body).toString('latin1')).toContain(`(${INVOICE_PDF_NCF_FIELD})`);

    const conducePdf = await agent.get(`${SALES}/${draft.id}/conduce.pdf`);
    expect(conducePdf.status).toBe(200);
    const conduceHex = pdfHexText(Buffer.from(conducePdf.body));
    expect(conduceHex).toContain(Buffer.from('CONDUCE').toString('hex'));
    expect(conduceHex).toContain(Buffer.from(issued.body.conduceNumber).toString('hex'));
    expect(conduceHex).not.toContain(Buffer.from('NCF:').toString('hex'));
  });

  it('invoice PDF failure after convert does not roll back conversion; conduce.pdf still works', async () => {
    const app = createTestApp({ invoicePdfRenderer: failingInvoicePdfRenderer });
    const { agent } = await fixture(request.agent(app));
    const customer = await namedCashCustomer();
    const draft = await draftWithLine(agent, customer.id);
    const issued = await agent
      .post(`${SALES}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send(cashSaleFullPayment('118.00'));
    expect(issued.status).toBe(200);

    const converted = await agent
      .post(`${SALES}/${draft.id}/convert-conduce-to-invoice`)
      .set(TEST_CSRF_HEADERS)
      .send({ fiscal: false });
    expect(converted.status).toBe(200);
    expect(converted.body.status).toBe('COMPLETED');
    expect(converted.body.number).toMatch(/^FAC-\d{6}$/);
    expect(converted.body.document?.status).toBe('FAILED');

    const conducePdf = await agent.get(`${SALES}/${draft.id}/conduce.pdf`);
    expect(conducePdf.status).toBe(200);
    expect(Buffer.from(conducePdf.body).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('rejects Mechanic and aggregates without conduce', async () => {
    const app = createTestApp();
    const admin = await fixture(request.agent(app));
    const customer = await namedCashCustomer();
    const draft = await draftWithLine(admin.agent, customer.id);
    const issued = await admin.agent
      .post(`${SALES}/${draft.id}/issue-conduce`)
      .set(TEST_CSRF_HEADERS)
      .send(cashSaleFullPayment('118.00'));
    expect(issued.status).toBe(200);

    const mechanic = await fixture(request.agent(app), 'MECHANIC');
    const denied = await mechanic.agent.get(`${SALES}/${draft.id}/conduce.pdf`);
    expect(denied.status).toBe(403);

    const without = await admin.agent
      .post(SALES)
      .set(TEST_CSRF_HEADERS)
      .send({ customerId: customer.id });
    expect(without.status).toBe(201);
    const missing = await admin.agent.get(`${SALES}/${without.body.id}/conduce.pdf`);
    expect(missing.status).toBe(409);
    expect(missing.body.error.message).toBe(PDF_CONDUCE_ONLY_MESSAGE);
  });
});
