import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { hashPassword } from '../../../src/features/access/password.js';
import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import {
  PDF_COMPLETED_ONLY_MESSAGE,
  PDF_FAILED_MESSAGE,
  PDF_REGENERATE_FAILED_ONLY_MESSAGE,
} from '../../../src/features/invoice-documents/constants.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import {
  INVOICE_PDF_NCF_FIELD,
  failingInvoicePdfRenderer,
} from '../../../src/infrastructure/invoice-pdf/index.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';
import { assignNamedCustomerForCredit } from '../../helpers/sales.js';

const users = new UserRepository();
const PASSWORD = 'personal-password';
const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };
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
  await prisma.invoice.deleteMany();
  await prisma.invoiceSequence.update({
    where: { name: 'FAC' },
    data: { nextValue: 1 },
  });
  await prisma.customerContact.deleteMany({ where: { customer: { isDefault: false } } });
  await prisma.customer.deleteMany({ where: { isDefault: false } });
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

afterAll(disconnectPrisma);

async function confirmGeneric(agent: request.Agent) {
  const draft = await agent.post(SALES).set(CSRF).send({});
  expect(draft.status).toBe(201);
  expect(
    (
      await agent.post(`${SALES}/${draft.body.id}/lines`).set(CSRF).send({
        type: 'GENERIC',
        description: 'Filtro',
        unitPrice: '118.00',
        costProvenance: 'UNKNOWN',
      })
    ).status,
  ).toBe(201);
  await assignNamedCustomerForCredit(agent, draft.body.id);
  const confirmed = await agent.post(`${SALES}/${draft.body.id}/confirm`).set(CSRF).send({});
  expect(confirmed.status).toBe(200);
  return confirmed.body;
}

describe('M17 PDF generate + failed status (SALE-004)', () => {
  afterEach(cleanup);

  it('keeps the sale when PDF generation fails and does not retry on idempotent confirm', async () => {
    const app = createTestApp({ invoicePdfRenderer: failingInvoicePdfRenderer });
    const admin = await fixture(request.agent(app));
    const invoice = await confirmGeneric(admin.agent);

    expect(invoice).toMatchObject({
      status: 'COMPLETED',
      number: 'FAC-000001',
      document: { status: 'FAILED' },
    });
    expect(invoice.document.errorId).toEqual(expect.any(String));
    const stored = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(stored).toMatchObject({
      status: 'COMPLETED',
      number: 'FAC-000001',
      pdfStatus: 'FAILED',
      pdfErrorId: invoice.document.errorId,
    });

    const pdf = await admin.agent.get(`${SALES}/${invoice.id}/pdf`);
    expect(pdf.status).toBe(409);
    expect(pdf.body.error.message).toBe(PDF_FAILED_MESSAGE);
    expect(pdf.body.error.details.errorId).toBe(invoice.document.errorId);

    const retry = await admin.agent.post(`${SALES}/${invoice.id}/confirm`).set(CSRF).send({});
    expect(retry.status).toBe(200);
    expect(retry.body.number).toBe('FAC-000001');
    expect(retry.body.document.errorId).toBe(invoice.document.errorId);
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: invoice.id, eventType: 'INVOICE_CONFIRMED' },
      }),
    ).toBe(1);
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: invoice.id, eventType: 'INVOICE_PDF_FAILED' },
      }),
    ).toBe(1);
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: invoice.id, eventType: 'INVOICE_PDF_GENERATED' },
      }),
    ).toBe(0);
  });

  it('lets Seller download a READY PDF that contains FAC- and a blank NCF field', async () => {
    const app = createTestApp();
    const seller = await fixture(request.agent(app), 'SELLER');
    const invoice = await confirmGeneric(seller.agent);
    expect(invoice.document).toEqual({ status: 'READY' });

    const pdf = await seller.agent.get(`${SALES}/${invoice.id}/pdf`).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
    expect(pdf.headers['content-disposition']).toContain('FAC-000001.pdf');
    const body = Buffer.from(pdf.body);
    const text = body.toString('latin1');
    expect(text.slice(0, 5)).toBe('%PDF-');
    expect(text).toContain('(FAC-000001)');
    expect(text).toContain(`(${INVOICE_PDF_NCF_FIELD})`);

    expect(
      await prisma.historyEvent.count({
        where: { subjectId: invoice.id, eventType: 'INVOICE_PDF_GENERATED' },
      }),
    ).toBe(1);
  });

  it('serves a versioned CANCELLED PDF after the controlled cancellation', async () => {
    const app = createTestApp();
    const admin = await fixture(request.agent(app));
    const invoice = await confirmGeneric(admin.agent);

    const cancelled = await admin.agent
      .post(`${SALES}/${invoice.id}/cancel`)
      .set(CSRF)
      .send({ reason: 'Venta anulada por el cliente', idempotencyKey: randomUUID() });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', paymentState: 'CANCELLED' });
    await expect(prisma.invoice.findUnique({ where: { id: invoice.id } })).resolves.toMatchObject({
      status: 'CANCELLED',
      pdfStatus: 'READY',
      pdfTemplateVersion: 'internal-v3',
    });

    const pdf = await admin.agent.get(`${SALES}/${invoice.id}/pdf`).buffer(true);
    expect(pdf.status).toBe(200);
    expect(Buffer.from(pdf.body).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('passes the persisted template version to the renderer on download', async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from('%PDF-versioned'));
    const app = createTestApp({ invoicePdfRenderer: { render } });
    const admin = await fixture(request.agent(app));
    const invoice = await confirmGeneric(admin.agent);
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { pdfTemplateVersion: 'internal-legacy' },
    });

    const pdf = await admin.agent.get(`${SALES}/${invoice.id}/pdf`).buffer(true);

    expect(pdf.status).toBe(200);
    expect(render).toHaveBeenLastCalledWith(
      expect.objectContaining({ templateVersion: 'internal-legacy' }),
    );
  });

  it('rejects Mechanic and draft PDF downloads', async () => {
    const app = createTestApp();
    const admin = await fixture(request.agent(app));
    const mechanic = await fixture(request.agent(app), 'MECHANIC');
    const draft = await admin.agent.post(SALES).set(CSRF).send({});
    expect(draft.status).toBe(201);

    const draftPdf = await admin.agent.get(`${SALES}/${draft.body.id}/pdf`);
    expect(draftPdf.status).toBe(409);
    expect(draftPdf.body.error.message).toBe(PDF_COMPLETED_ONLY_MESSAGE);

    const invoice = await confirmGeneric(admin.agent);
    const denied = await mechanic.agent.get(`${SALES}/${invoice.id}/pdf`);
    expect(denied.status).toBe(403);
  });
});

describe('M18 PDF regenerate Administrator (SALE-004 / ADMIN-002)', () => {
  afterEach(cleanup);

  it('regenerates a failed PDF from the snapshot without a second FAC-', async () => {
    const render = vi
      .fn()
      .mockRejectedValueOnce(new Error('simulated-pdf-failure'))
      .mockResolvedValue(Buffer.from('%PDF-regenerated'));
    const app = createTestApp({ invoicePdfRenderer: { render } });
    const admin = await fixture(request.agent(app));
    const invoice = await confirmGeneric(admin.agent);
    expect(invoice).toMatchObject({
      status: 'COMPLETED',
      number: 'FAC-000001',
      document: { status: 'FAILED' },
    });
    const failedErrorId = invoice.document.errorId;

    const regenerated = await admin.agent
      .post(`${SALES}/${invoice.id}/pdf/regenerate`)
      .set(CSRF)
      .send({});
    expect(regenerated.status).toBe(200);
    expect(regenerated.body).toMatchObject({
      id: invoice.id,
      status: 'COMPLETED',
      number: 'FAC-000001',
      document: { status: 'READY' },
      customerSnapshot: invoice.customerSnapshot,
      lines: invoice.lines,
      totals: invoice.totals,
    });
    expect(regenerated.body.document.errorId).toBeUndefined();

    const stored = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(stored).toMatchObject({
      status: 'COMPLETED',
      number: 'FAC-000001',
      pdfStatus: 'READY',
      pdfErrorId: null,
    });
    expect(stored?.pdfErrorId).not.toBe(failedErrorId);

    const pdf = await admin.agent.get(`${SALES}/${invoice.id}/pdf`).buffer(true);
    expect(pdf.status).toBe(200);
    expect(Buffer.from(pdf.body).toString('latin1').slice(0, 5)).toBe('%PDF-');

    expect(
      await prisma.historyEvent.count({
        where: { subjectId: invoice.id, eventType: 'INVOICE_CONFIRMED' },
      }),
    ).toBe(1);
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: invoice.id, eventType: 'INVOICE_PDF_FAILED' },
      }),
    ).toBe(1);
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: invoice.id, eventType: 'INVOICE_PDF_GENERATED' },
      }),
    ).toBe(1);
  });

  it('keeps the sale and returns FAILED when regeneration render fails again', async () => {
    const app = createTestApp({ invoicePdfRenderer: failingInvoicePdfRenderer });
    const admin = await fixture(request.agent(app));
    const invoice = await confirmGeneric(admin.agent);
    const firstErrorId = invoice.document.errorId;

    const regenerated = await admin.agent
      .post(`${SALES}/${invoice.id}/pdf/regenerate`)
      .set(CSRF)
      .send({});
    expect(regenerated.status).toBe(200);
    expect(regenerated.body).toMatchObject({
      status: 'COMPLETED',
      number: 'FAC-000001',
      document: { status: 'FAILED' },
    });
    expect(regenerated.body.document.errorId).toEqual(expect.any(String));
    expect(regenerated.body.document.errorId).not.toBe(firstErrorId);
    expect(regenerated.body.customerSnapshot).toEqual(invoice.customerSnapshot);
    expect(regenerated.body.lines).toEqual(invoice.lines);

    expect(
      await prisma.historyEvent.count({
        where: { subjectId: invoice.id, eventType: 'INVOICE_PDF_FAILED' },
      }),
    ).toBe(2);
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: invoice.id, eventType: 'INVOICE_CONFIRMED' },
      }),
    ).toBe(1);
  });

  it('rejects persistence when Administrator authorization is revoked during rendering', async () => {
    let signalRenderStarted!: () => void;
    let releaseRender!: () => void;
    const renderStarted = new Promise<void>((resolve) => {
      signalRenderStarted = resolve;
    });
    const renderReleased = new Promise<void>((resolve) => {
      releaseRender = resolve;
    });
    const render = vi
      .fn()
      .mockRejectedValueOnce(new Error('simulated-pdf-failure'))
      .mockImplementationOnce(async () => {
        signalRenderStarted();
        await renderReleased;
        return Buffer.from('%PDF-regenerated');
      });
    const app = createTestApp({ invoicePdfRenderer: { render } });
    const admin = await fixture(request.agent(app));
    const invoice = await confirmGeneric(admin.agent);
    const failedErrorId = invoice.document.errorId;

    const pendingRegeneration = admin.agent
      .post(`${SALES}/${invoice.id}/pdf/regenerate`)
      .set(CSRF)
      .send({})
      .then((response) => response);
    await renderStarted;
    await prisma.user.update({ where: { id: admin.user.id }, data: { role: 'SELLER' } });
    releaseRender();

    const denied = await pendingRegeneration;
    expect(denied.status).toBe(403);
    expect(await prisma.invoice.findUnique({ where: { id: invoice.id } })).toMatchObject({
      pdfStatus: 'FAILED',
      pdfErrorId: failedErrorId,
    });
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: invoice.id, eventType: 'INVOICE_PDF_GENERATED' },
      }),
    ).toBe(0);
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: invoice.id, eventType: 'INVOICE_PDF_FAILED' },
      }),
    ).toBe(1);
  });

  it('rejects Seller, READY, draft, Mechanic and missing CSRF', async () => {
    const failing = createTestApp({ invoicePdfRenderer: failingInvoicePdfRenderer });
    const admin = await fixture(request.agent(failing));
    const seller = await fixture(request.agent(failing), 'SELLER');
    const mechanic = await fixture(request.agent(failing), 'MECHANIC');
    const failed = await confirmGeneric(admin.agent);

    const sellerDenied = await seller.agent
      .post(`${SALES}/${failed.id}/pdf/regenerate`)
      .set(CSRF)
      .send({});
    expect(sellerDenied.status).toBe(403);

    const csrfDenied = await admin.agent.post(`${SALES}/${failed.id}/pdf/regenerate`).send({});
    expect(csrfDenied.status).toBe(403);

    const mechanicDenied = await mechanic.agent
      .post(`${SALES}/${failed.id}/pdf/regenerate`)
      .set(CSRF)
      .send({});
    expect(mechanicDenied.status).toBe(403);

    const readyApp = createTestApp();
    const readyAdmin = await fixture(request.agent(readyApp));
    const ready = await confirmGeneric(readyAdmin.agent);
    expect(ready.document).toEqual({ status: 'READY' });
    const readyDenied = await readyAdmin.agent
      .post(`${SALES}/${ready.id}/pdf/regenerate`)
      .set(CSRF)
      .send({});
    expect(readyDenied.status).toBe(409);
    expect(readyDenied.body.error.message).toBe(PDF_REGENERATE_FAILED_ONLY_MESSAGE);

    const draft = await readyAdmin.agent.post(SALES).set(CSRF).send({});
    expect(draft.status).toBe(201);
    const draftDenied = await readyAdmin.agent
      .post(`${SALES}/${draft.body.id}/pdf/regenerate`)
      .set(CSRF)
      .send({});
    expect(draftDenied.status).toBe(409);
    expect(draftDenied.body.error.message).toBe(PDF_COMPLETED_ONLY_MESSAGE);
  });
});
