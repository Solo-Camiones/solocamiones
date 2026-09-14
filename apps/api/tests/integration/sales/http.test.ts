import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { hashPassword } from '../../../src/features/access/password.js';
import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import { CustomerRepository } from '../../../src/features/customers/repository.js';
import { HistoryRepository } from '../../../src/features/history/repository.js';
import {
  CATALOG_SERVICE_NOT_FOUND_MESSAGE,
  DRAFT_ONLY_DISCARD_MESSAGE,
  DRAFT_ONLY_EDIT_MESSAGE,
  DUPLICATE_DELIVERY_LINE_MESSAGE,
  EMPTY_DRAFT_CONFIRM_MESSAGE,
  FISCAL_IDENTITY_REQUIRED_MESSAGE,
  FIXED_LINE_QUANTITY_MESSAGE,
  INACTIVE_SERVICE_LINE_MESSAGE,
  UNSUPPORTED_INVENTORY_LINE_MESSAGE,
} from '../../../src/features/sales/constants.js';
import { SalesService } from '../../../src/features/sales/service.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';
import { assignNamedCustomerForCredit, cashSaleFullPayment } from '../../helpers/sales.js';

const app = createTestApp();
const users = new UserRepository();
const customers = new CustomerRepository();
const service = new SalesService();
const PASSWORD = 'personal-password';
const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };
const ROOT = '/api/sales';

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

async function cleanup() {
  vi.restoreAllMocks();
  await resetLoginRateLimit();
  await clearTestHistory();
  await prisma.invoicePayment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.mechanicalService.deleteMany();
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

describe('M7 draft HTTP shell (SALE-001 draft)', () => {
  afterEach(cleanup);

  it('creates a draft with Cliente contado, DOP and non-fiscal defaults', async () => {
    const seller = await fixture('SELLER');
    const generic = await customers.findDefault();
    expect(generic).not.toBeNull();

    const created = await seller.agent.post(ROOT).set(CSRF).send({});
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      status: 'DRAFT',
      number: null,
      currency: 'DOP',
      fiscal: false,
      customer: { id: generic!.id, isDefault: true },
      lines: [],
      totals: { gross: '0.00', base: '0.00', itbis: '0.00' },
    });
    expect(await prisma.historyEvent.findMany({ where: { subjectId: created.body.id } })).toEqual([
      expect.objectContaining({
        eventType: 'INVOICE_DRAFT_CREATED',
        actorUserId: seller.user.id,
        subjectType: 'INVOICE',
      }),
    ]);
  });

  it('lets Seller change currency and assign a fiscal customer', async () => {
    const seller = await fixture('SELLER');
    const identified = await customers.create({
      name: 'Taller Norte',
      rnc: '131123456',
    });
    const created = await seller.agent.post(ROOT).set(CSRF).send({ currency: 'USD' });
    expect(created.status).toBe(201);
    expect(created.body.currency).toBe('USD');

    const patched = await seller.agent
      .patch(`${ROOT}/${created.body.id}`)
      .set(CSRF)
      .send({ customerId: identified.id, fiscal: true });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({
      currency: 'USD',
      fiscal: true,
      customer: { id: identified.id, rnc: '131123456', isDefault: false },
    });
    expect(await prisma.historyEvent.count({ where: { subjectId: created.body.id } })).toBe(1);
  });

  it('rejects fiscal drafts that use Cliente contado and discards only drafts', async () => {
    const admin = await fixture();
    const generic = await customers.findDefault();
    const conflict = await admin.agent.post(ROOT).set(CSRF).send({ fiscal: true });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.message).toBe(FISCAL_IDENTITY_REQUIRED_MESSAGE);

    const draft = await admin.agent.post(ROOT).set(CSRF).send({});
    const fiscalPatch = await admin.agent
      .patch(`${ROOT}/${draft.body.id}`)
      .set(CSRF)
      .send({ fiscal: true });
    expect(fiscalPatch.status).toBe(409);

    const discarded = await admin.agent.delete(`${ROOT}/${draft.body.id}`).set(CSRF);
    expect(discarded.status).toBe(204);
    expect((await admin.agent.get(`${ROOT}/${draft.body.id}`)).status).toBe(404);
    expect(
      await prisma.historyEvent.findFirst({
        where: { subjectId: draft.body.id, eventType: 'INVOICE_DRAFT_DISCARDED' },
      }),
    ).not.toBeNull();
    expect(await prisma.invoice.findUnique({ where: { id: draft.body.id } })).toBeNull();

    const completed = await prisma.invoice.create({
      data: {
        status: 'COMPLETED',
        currency: 'DOP',
        fiscal: false,
        customerId: generic!.id,
        number: `FAC-${randomUUID().slice(0, 6)}`,
        confirmedAt: new Date(),
        dueDate: new Date('2026-10-10T00:00:00.000Z'),
        customerName: generic!.name,
        customerRnc: generic!.rnc,
        gross: '0.00',
        base: '0.00',
        itbis: '0.00',
      },
    });
    const blocked = await admin.agent.delete(`${ROOT}/${completed.id}`).set(CSRF);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toBe(DRAFT_ONLY_DISCARD_MESSAGE);
    const blockedEdit = await admin.agent.patch(`${ROOT}/${completed.id}`).set(CSRF).send({
      currency: 'USD',
    });
    expect(blockedEdit.status).toBe(409);
    expect(blockedEdit.body.error.message).toBe(DRAFT_ONLY_EDIT_MESSAGE);
  });

  it('lists invoices with status filter and pagination', async () => {
    const admin = await fixture();
    const first = await admin.agent.post(ROOT).set(CSRF).send({ currency: 'DOP' });
    const second = await admin.agent.post(ROOT).set(CSRF).send({ currency: 'USD' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(
      (
        await admin.agent.post(`${ROOT}/${first.body.id}/lines`).set(CSRF).send({
          type: 'GENERIC',
          description: 'Filtro',
          unitPrice: '118.00',
          costProvenance: 'UNKNOWN',
        })
      ).status,
    ).toBe(201);

    const page = await admin.agent.get(`${ROOT}?page=1&pageSize=2&status=DRAFT`);
    expect(page.status).toBe(200);
    expect(page.body.total).toBe(2);
    expect(page.body.page).toBe(1);
    expect(page.body.pageSize).toBe(2);
    expect(page.body.items).toHaveLength(2);
    expect(page.body.items[0]).toMatchObject({ status: 'DRAFT', number: null });
    expect(page.body.items[0]).not.toHaveProperty('lines');
    expect(
      page.body.items.find((item: { id: string }) => item.id === first.body.id).totals,
    ).toEqual({
      gross: '118.00',
      base: '118.00',
      itbis: '0.00',
    });
  });

  it('searches invoices by number or customer across pages', async () => {
    const admin = await fixture();
    const generic = await prisma.customer.findFirst({ where: { isDefault: true } });
    expect(generic).not.toBeNull();
    const older = await prisma.invoice.create({
      data: {
        status: 'COMPLETED',
        currency: 'DOP',
        fiscal: false,
        customerId: generic!.id,
        number: 'FAC-000881',
        confirmedAt: new Date('2026-01-01T00:00:00.000Z'),
        dueDate: new Date('2026-01-15T00:00:00.000Z'),
        customerName: 'Taller Alpha',
        gross: '100.00',
        base: '100.00',
        itbis: '0.00',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await prisma.invoice.create({
      data: {
        status: 'COMPLETED',
        currency: 'DOP',
        fiscal: false,
        customerId: generic!.id,
        number: 'FAC-000882',
        confirmedAt: new Date('2026-02-01T00:00:00.000Z'),
        dueDate: new Date('2026-02-15T00:00:00.000Z'),
        customerName: 'Flota Beta',
        gross: '200.00',
        base: '200.00',
        itbis: '0.00',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    });

    const firstPage = await admin.agent.get(`${ROOT}?page=1&pageSize=1&status=COMPLETED`);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.total).toBe(2);
    expect(firstPage.body.items[0].number).toBe('FAC-000882');
    expect(firstPage.body.items.some((item: { id: string }) => item.id === older.id)).toBe(false);

    const byNumber = await admin.agent.get(
      `${ROOT}?page=1&pageSize=1&status=COMPLETED&q=FAC-000881`,
    );
    expect(byNumber.status).toBe(200);
    expect(byNumber.body).toMatchObject({ total: 1, page: 1, pageSize: 1 });
    expect(byNumber.body.items).toEqual([
      expect.objectContaining({ id: older.id, number: 'FAC-000881' }),
    ]);

    const byCustomer = await admin.agent.get(`${ROOT}?page=1&pageSize=10&q=alpha`);
    expect(byCustomer.status).toBe(200);
    expect(byCustomer.body.total).toBe(1);
    expect(byCustomer.body.items[0].id).toBe(older.id);
  });

  it('returns 403 for Mechanic and 400 for unknown fields', async () => {
    const mechanic = await fixture('MECHANIC');
    const admin = await fixture();
    expect((await mechanic.agent.get(ROOT)).status).toBe(403);
    expect((await mechanic.agent.post(ROOT).set(CSRF).send({})).status).toBe(403);
    const unknown = await admin.agent.post(ROOT).set(CSRF).send({ currency: 'DOP', extra: true });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('VALIDATION');
  });

  it('does not keep a draft when history append fails', async () => {
    const admin = await fixture();
    vi.spyOn(HistoryRepository.prototype, 'append').mockImplementation(async () => {
      throw new Error('history-unavailable');
    });
    await expect(service.createDraft(admin.user.id, {})).rejects.toThrow('history-unavailable');
    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.historyEvent.count()).toBe(0);
  });

  it('rejects writes without the CSRF header', async () => {
    const admin = await fixture();
    expect((await admin.agent.post(ROOT).send({})).status).toBe(403);
  });
});

describe('M8 draft GENERIC lines (LINE-003)', () => {
  afterEach(cleanup);

  it('adds a fiscal GENERIC line, recalculates included ITBIS, then updates price and removes it', async () => {
    const seller = await fixture('SELLER');
    const identified = await customers.create({
      name: 'Taller Norte',
      rnc: '131123456',
    });
    const draft = await seller.agent
      .post(ROOT)
      .set(CSRF)
      .send({ customerId: identified.id, fiscal: true });
    expect(draft.status).toBe(201);

    const added = await seller.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'GENERIC',
      description: 'Filtro de aceite',
      quantity: '2',
      unitPrice: '118.00',
      costProvenance: 'ACTUAL',
      acquisitionCostDop: '80.00',
    });
    expect(added.status).toBe(201);
    expect(added.body.lines).toHaveLength(1);
    expect(added.body.lines[0]).toMatchObject({
      type: 'GENERIC',
      description: 'Filtro de aceite',
      quantity: '2.00',
      unitPrice: '118.00',
      taxable: true,
      gross: '236.00',
      base: '200.00',
      itbis: '36.00',
      acquisitionCostDop: '80.00',
      costProvenance: 'ACTUAL',
      serviceId: null,
    });
    expect(added.body.totals).toEqual({ gross: '236.00', base: '200.00', itbis: '36.00' });
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: draft.body.id, eventType: 'INVOICE_LINE_ADDED' },
      }),
    ).toBe(0);

    const priced = await seller.agent
      .patch(`${ROOT}/${draft.body.id}/lines/${added.body.lines[0].id}`)
      .set(CSRF)
      .send({ unitPrice: '59.00' });
    expect(priced.status).toBe(200);
    expect(priced.body.lines[0]).toMatchObject({
      unitPrice: '59.00',
      gross: '118.00',
      base: '100.00',
      itbis: '18.00',
      acquisitionCostDop: '80.00',
    });
    expect(priced.body.totals).toEqual({ gross: '118.00', base: '100.00', itbis: '18.00' });
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: draft.body.id, eventType: 'INVOICE_LINE_UPDATED' },
      }),
    ).toBe(0);

    const counted = await seller.agent
      .patch(`${ROOT}/${draft.body.id}/lines/${added.body.lines[0].id}`)
      .set(CSRF)
      .send({ quantity: '3.00' });
    expect(counted.status).toBe(200);
    expect(counted.body.lines[0]).toMatchObject({
      quantity: '3.00',
      unitPrice: '59.00',
      gross: '177.00',
      base: '150.00',
      itbis: '27.00',
    });
    expect(counted.body.totals).toEqual({ gross: '177.00', base: '150.00', itbis: '27.00' });

    const renamed = await seller.agent
      .patch(`${ROOT}/${draft.body.id}/lines/${added.body.lines[0].id}`)
      .set(CSRF)
      .send({ description: 'Filtro de aire' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.lines[0]).toMatchObject({
      description: 'Filtro de aire',
      quantity: '3.00',
      unitPrice: '59.00',
    });

    const removed = await seller.agent
      .delete(`${ROOT}/${draft.body.id}/lines/${added.body.lines[0].id}`)
      .set(CSRF);
    expect(removed.status).toBe(200);
    expect(removed.body.lines).toEqual([]);
    expect(removed.body.totals).toEqual({ gross: '0.00', base: '0.00', itbis: '0.00' });
    expect(await prisma.invoiceLine.count({ where: { invoiceId: draft.body.id } })).toBe(0);
  });

  it('stores optional line notes independently of description and freezes them on confirm', async () => {
    const seller = await fixture('SELLER');
    const draft = await seller.agent.post(ROOT).set(CSRF).send({});
    expect(draft.status).toBe(201);

    const added = await seller.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'GENERIC',
      description: 'Filtro',
      notes: '  Se instaló en bahía 1  ',
      unitPrice: '118.00',
      costProvenance: 'UNKNOWN',
    });
    expect(added.status).toBe(201);
    expect(added.body.lines[0]).toMatchObject({
      description: 'Filtro',
      notes: 'Se instaló en bahía 1',
    });

    const updated = await seller.agent
      .patch(`${ROOT}/${draft.body.id}/lines/${added.body.lines[0].id}`)
      .set(CSRF)
      .send({ notes: 'Cambio de junta\ny filtro' });
    expect(updated.status).toBe(200);
    expect(updated.body.lines[0].notes).toBe('Cambio de junta\ny filtro');

    const cleared = await seller.agent
      .patch(`${ROOT}/${draft.body.id}/lines/${added.body.lines[0].id}`)
      .set(CSRF)
      .send({ notes: '   ' });
    expect(cleared.status).toBe(200);
    expect(cleared.body.lines[0].notes).toBeNull();

    const tooLong = await seller.agent
      .post(`${ROOT}/${draft.body.id}/lines`)
      .set(CSRF)
      .send({
        type: 'GENERIC',
        description: 'Otro',
        notes: 'x'.repeat(101),
        unitPrice: '10.00',
        costProvenance: 'UNKNOWN',
      });
    expect(tooLong.status).toBe(400);

    const restored = await seller.agent
      .patch(`${ROOT}/${draft.body.id}/lines/${added.body.lines[0].id}`)
      .set(CSRF)
      .send({ notes: 'Nota final' });
    expect(restored.status).toBe(200);

    const confirmed = await seller.agent
      .post(`${ROOT}/${draft.body.id}/confirm`)
      .set(CSRF)
      .send(cashSaleFullPayment(added.body.totals.gross));
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.lines[0].notes).toBe('Nota final');

    const frozen = await seller.agent
      .patch(`${ROOT}/${draft.body.id}/lines/${added.body.lines[0].id}`)
      .set(CSRF)
      .send({ notes: 'No debe guardar' });
    expect(frozen.status).toBe(409);
  });

  it('stores UNKNOWN cost as null, not zero, and rejects ITEM/QTY without inventory effects', async () => {
    const admin = await fixture();
    const draft = await admin.agent.post(ROOT).set(CSRF).send({});
    expect(draft.status).toBe(201);

    const unknown = await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'GENERIC',
      description: 'Varilla',
      unitPrice: '118.00',
      costProvenance: 'UNKNOWN',
    });
    expect(unknown.status).toBe(201);
    expect(unknown.body.lines[0]).toMatchObject({
      acquisitionCostDop: null,
      costProvenance: 'UNKNOWN',
      itbis: '0.00',
      gross: '118.00',
    });
    expect(unknown.body.lines[0].acquisitionCostDop).not.toBe('0.00');

    const item = await admin.agent
      .post(`${ROOT}/${draft.body.id}/lines`)
      .set(CSRF)
      .send({ type: 'ITEM', description: 'Tracked part', unitPrice: '10.00' });
    expect(item.status).toBe(409);
    expect(item.body.error.message).toBe(UNSUPPORTED_INVENTORY_LINE_MESSAGE);

    const qty = await admin.agent
      .post(`${ROOT}/${draft.body.id}/lines`)
      .set(CSRF)
      .send({ type: 'QTY', description: 'Bolts', unitPrice: '10.00' });
    expect(qty.status).toBe(409);
    expect(qty.body.error.message).toBe(UNSUPPORTED_INVENTORY_LINE_MESSAGE);
    expect(await prisma.invoiceLine.count({ where: { invoiceId: draft.body.id } })).toBe(1);
  });

  it('rejects negative prices, textual placeholders, completed invoices, Mechanic, and CSRF-less writes', async () => {
    const mechanic = await fixture('MECHANIC');
    const admin = await fixture();
    const generic = await customers.findDefault();
    const draft = await admin.agent.post(ROOT).set(CSRF).send({});

    const negative = await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'GENERIC',
      description: 'Filtro',
      unitPrice: '-1.00',
      costProvenance: 'UNKNOWN',
    });
    expect(negative.status).toBe(400);

    const placeholder = await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'GENERIC',
      description: 'Filtro',
      unitPrice: 'N/A',
      costProvenance: 'UNKNOWN',
    });
    expect(placeholder.status).toBe(400);
    expect(await prisma.invoiceLine.count({ where: { invoiceId: draft.body.id } })).toBe(0);

    expect(
      (
        await mechanic.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
          type: 'GENERIC',
          description: 'Filtro',
          unitPrice: '10.00',
          costProvenance: 'UNKNOWN',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).send({
          type: 'GENERIC',
          description: 'Filtro',
          unitPrice: '10.00',
          costProvenance: 'UNKNOWN',
        })
      ).status,
    ).toBe(403);

    const completed = await prisma.invoice.create({
      data: {
        status: 'COMPLETED',
        currency: 'DOP',
        fiscal: false,
        customerId: generic!.id,
        number: `FAC-${randomUUID().slice(0, 6)}`,
        confirmedAt: new Date(),
        dueDate: new Date('2026-10-10T00:00:00.000Z'),
        customerName: generic!.name,
        customerRnc: generic!.rnc,
        gross: '0.00',
        base: '0.00',
        itbis: '0.00',
      },
    });
    const blocked = await admin.agent.post(`${ROOT}/${completed.id}/lines`).set(CSRF).send({
      type: 'GENERIC',
      description: 'Filtro',
      unitPrice: '10.00',
      costProvenance: 'UNKNOWN',
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toBe(DRAFT_ONLY_EDIT_MESSAGE);
  });
});

const SERVICES = '/api/catalogs/services';

describe('M9 draft SERVICE lines (LINE-004)', () => {
  afterEach(cleanup);

  it('lets Seller add an active catalog service with negotiated price and zero ITBIS', async () => {
    const admin = await fixture();
    const seller = await fixture('SELLER');
    const identified = await customers.create({
      name: 'Taller Norte',
      rnc: '131123456',
    });
    const catalog = await admin.agent
      .post(SERVICES)
      .set(CSRF)
      .send({ name: 'Instalación mecánica' });
    expect(catalog.status).toBe(201);

    const forbiddenCatalog = await seller.agent.post(SERVICES).set(CSRF).send({ name: 'Otro' });
    expect(forbiddenCatalog.status).toBe(403);

    const draft = await seller.agent
      .post(ROOT)
      .set(CSRF)
      .send({ customerId: identified.id, fiscal: true });
    expect(draft.status).toBe(201);

    const generic = await seller.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'GENERIC',
      description: 'Filtro de aceite',
      unitPrice: '118.00',
      costProvenance: 'UNKNOWN',
    });
    expect(generic.status).toBe(201);

    const copiedName = await seller.agent
      .post(`${ROOT}/${draft.body.id}/lines`)
      .set(CSRF)
      .send({ type: 'SERVICE', serviceId: catalog.body.id, unitPrice: '500.00' });
    expect(copiedName.status).toBe(201);
    expect(copiedName.body.lines).toHaveLength(2);
    expect(copiedName.body.lines[1]).toMatchObject({
      type: 'SERVICE',
      description: 'Instalación mecánica',
      quantity: '1.00',
      unitPrice: '500.00',
      taxable: false,
      gross: '500.00',
      base: '500.00',
      itbis: '0.00',
      acquisitionCostDop: null,
      costProvenance: null,
      serviceId: catalog.body.id,
    });
    expect(copiedName.body.totals).toEqual({ gross: '618.00', base: '600.00', itbis: '18.00' });
    expect(copiedName.body.lines[1].serviceId).toBe(catalog.body.id);

    const overridden = await seller.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'SERVICE',
      serviceId: catalog.body.id,
      unitPrice: '0.00',
      description: 'Instalación expres',
    });
    expect(overridden.status).toBe(201);
    expect(overridden.body.lines[2]).toMatchObject({
      type: 'SERVICE',
      description: 'Instalación expres',
      unitPrice: '0.00',
      itbis: '0.00',
      gross: '0.00',
      serviceId: catalog.body.id,
    });
    expect(overridden.body.totals).toEqual({ gross: '618.00', base: '600.00', itbis: '18.00' });

    const priced = await seller.agent
      .patch(`${ROOT}/${draft.body.id}/lines/${copiedName.body.lines[1].id}`)
      .set(CSRF)
      .send({ unitPrice: '250.00' });
    expect(priced.status).toBe(200);
    expect(priced.body.lines[1]).toMatchObject({
      unitPrice: '250.00',
      itbis: '0.00',
      gross: '250.00',
    });
    expect(priced.body.totals).toEqual({ gross: '368.00', base: '350.00', itbis: '18.00' });

    const quantityBlocked = await seller.agent
      .patch(`${ROOT}/${draft.body.id}/lines/${copiedName.body.lines[1].id}`)
      .set(CSRF)
      .send({ quantity: '2.00' });
    expect(quantityBlocked.status).toBe(409);
    expect(quantityBlocked.body.error.message).toBe(FIXED_LINE_QUANTITY_MESSAGE);
  });

  it('rejects inactive and missing catalog services without inserting a line', async () => {
    const admin = await fixture();
    const draft = await admin.agent.post(ROOT).set(CSRF).send({});
    const inactive = await admin.agent
      .post(SERVICES)
      .set(CSRF)
      .send({ name: 'Diagnóstico', active: false });
    expect(inactive.status).toBe(201);

    const blocked = await admin.agent
      .post(`${ROOT}/${draft.body.id}/lines`)
      .set(CSRF)
      .send({ type: 'SERVICE', serviceId: inactive.body.id, unitPrice: '200.00' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toBe(INACTIVE_SERVICE_LINE_MESSAGE);
    expect(await prisma.invoiceLine.count({ where: { invoiceId: draft.body.id } })).toBe(0);

    const missing = await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'SERVICE',
      serviceId: '11111111-1111-4111-8111-111111111111',
      unitPrice: '200.00',
    });
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toBe(CATALOG_SERVICE_NOT_FOUND_MESSAGE);
    expect(await prisma.invoiceLine.count({ where: { invoiceId: draft.body.id } })).toBe(0);
  });

  it('rejects SERVICE payloads with quantity, cost, or extra fields', async () => {
    const admin = await fixture();
    const catalog = await admin.agent.post(SERVICES).set(CSRF).send({ name: 'Balanceo' });
    const draft = await admin.agent.post(ROOT).set(CSRF).send({});

    const withQuantity = await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'SERVICE',
      serviceId: catalog.body.id,
      unitPrice: '100.00',
      quantity: '2',
    });
    expect(withQuantity.status).toBe(400);

    const withCost = await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'SERVICE',
      serviceId: catalog.body.id,
      unitPrice: '100.00',
      costProvenance: 'UNKNOWN',
    });
    expect(withCost.status).toBe(400);
    expect(await prisma.invoiceLine.count({ where: { invoiceId: draft.body.id } })).toBe(0);
  });
});

describe('M10 draft DELIVERY lines (LINE-006)', () => {
  afterEach(cleanup);

  it('adds omitted-as-absent, free zero, and charged delivery without ITBIS', async () => {
    const seller = await fixture('SELLER');
    const identified = await customers.create({
      name: 'Taller Norte',
      rnc: '131123456',
    });
    const draft = await seller.agent
      .post(ROOT)
      .set(CSRF)
      .send({ customerId: identified.id, fiscal: true });
    expect(draft.status).toBe(201);
    expect(draft.body.lines).toEqual([]);
    expect(draft.body.totals).toEqual({ gross: '0.00', base: '0.00', itbis: '0.00' });

    const generic = await seller.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'GENERIC',
      description: 'Filtro',
      unitPrice: '118.00',
      costProvenance: 'UNKNOWN',
    });
    expect(generic.status).toBe(201);
    expect(generic.body.totals).toEqual({ gross: '118.00', base: '100.00', itbis: '18.00' });

    const free = await seller.agent
      .post(`${ROOT}/${draft.body.id}/lines`)
      .set(CSRF)
      .send({ type: 'DELIVERY', description: 'Entrega incluida', unitPrice: '0.00' });
    expect(free.status).toBe(201);
    expect(free.body.lines).toHaveLength(2);
    expect(free.body.lines[1]).toMatchObject({
      type: 'DELIVERY',
      description: 'Entrega incluida',
      quantity: '1.00',
      unitPrice: '0.00',
      taxable: false,
      gross: '0.00',
      base: '0.00',
      itbis: '0.00',
      acquisitionCostDop: null,
      costProvenance: null,
      serviceId: null,
    });
    expect(free.body.totals).toEqual({ gross: '118.00', base: '100.00', itbis: '18.00' });

    const duplicate = await seller.agent
      .post(`${ROOT}/${draft.body.id}/lines`)
      .set(CSRF)
      .send({ type: 'DELIVERY', description: 'Envío', unitPrice: '200.00' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.message).toBe(DUPLICATE_DELIVERY_LINE_MESSAGE);
    expect(await prisma.invoiceLine.count({ where: { invoiceId: draft.body.id } })).toBe(2);

    const charged = await seller.agent
      .patch(`${ROOT}/${draft.body.id}/lines/${free.body.lines[1].id}`)
      .set(CSRF)
      .send({ unitPrice: '200.00' });
    expect(charged.status).toBe(200);
    expect(charged.body.lines[1]).toMatchObject({
      type: 'DELIVERY',
      unitPrice: '200.00',
      itbis: '0.00',
      gross: '200.00',
    });
    expect(charged.body.totals).toEqual({ gross: '318.00', base: '300.00', itbis: '18.00' });

    const removed = await seller.agent
      .delete(`${ROOT}/${draft.body.id}/lines/${free.body.lines[1].id}`)
      .set(CSRF);
    expect(removed.status).toBe(200);
    expect(removed.body.lines).toHaveLength(1);
    expect(removed.body.totals).toEqual({ gross: '118.00', base: '100.00', itbis: '18.00' });

    const restored = await seller.agent
      .post(`${ROOT}/${draft.body.id}/lines`)
      .set(CSRF)
      .send({ type: 'DELIVERY', description: 'Envío Santo Domingo', unitPrice: '150.00' });
    expect(restored.status).toBe(201);
    expect(restored.body.lines[1]).toMatchObject({
      type: 'DELIVERY',
      description: 'Envío Santo Domingo',
      unitPrice: '150.00',
      itbis: '0.00',
      gross: '150.00',
    });
    expect(restored.body.totals).toEqual({ gross: '268.00', base: '250.00', itbis: '18.00' });
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: draft.body.id, eventType: 'INVOICE_LINE_ADDED' },
      }),
    ).toBe(0);
  });

  it('rejects missing descriptions, negative amounts, textual placeholders, quantity, and cost', async () => {
    const admin = await fixture();
    const draft = await admin.agent.post(ROOT).set(CSRF).send({});

    const withoutDescription = await admin.agent
      .post(`${ROOT}/${draft.body.id}/lines`)
      .set(CSRF)
      .send({ type: 'DELIVERY', unitPrice: '10.00' });
    expect(withoutDescription.status).toBe(400);

    const withEmptyDescription = await admin.agent
      .post(`${ROOT}/${draft.body.id}/lines`)
      .set(CSRF)
      .send({ type: 'DELIVERY', description: '   ', unitPrice: '10.00' });
    expect(withEmptyDescription.status).toBe(400);

    const negative = await admin.agent
      .post(`${ROOT}/${draft.body.id}/lines`)
      .set(CSRF)
      .send({ type: 'DELIVERY', description: 'Envío', unitPrice: '-1.00' });
    expect(negative.status).toBe(400);

    const placeholder = await admin.agent
      .post(`${ROOT}/${draft.body.id}/lines`)
      .set(CSRF)
      .send({ type: 'DELIVERY', description: 'Envío', unitPrice: 'N/A' });
    expect(placeholder.status).toBe(400);

    const withQuantity = await admin.agent
      .post(`${ROOT}/${draft.body.id}/lines`)
      .set(CSRF)
      .send({ type: 'DELIVERY', description: 'Envío', unitPrice: '10.00', quantity: '2' });
    expect(withQuantity.status).toBe(400);

    const withCost = await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'DELIVERY',
      description: 'Envío',
      unitPrice: '10.00',
      costProvenance: 'UNKNOWN',
    });
    expect(withCost.status).toBe(400);
    expect(await prisma.invoiceLine.count({ where: { invoiceId: draft.body.id } })).toBe(0);
  });
});

describe('M11 draft EXTERNAL lines (LINE-005)', () => {
  afterEach(cleanup);

  it('adds EXTERNAL with actual, estimated, and unknown cost, recalculates included ITBIS, then updates and removes', async () => {
    const seller = await fixture('SELLER');
    const identified = await customers.create({
      name: 'Taller Norte',
      rnc: '131123456',
    });
    const draft = await seller.agent
      .post(ROOT)
      .set(CSRF)
      .send({ customerId: identified.id, fiscal: true });
    expect(draft.status).toBe(201);

    const actual = await seller.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'EXTERNAL',
      description: 'Bomba hidráulica',
      quantity: '2',
      unitPrice: '118.00',
      costProvenance: 'ACTUAL',
      acquisitionCostDop: '80.00',
    });
    expect(actual.status).toBe(201);
    expect(actual.body.lines[0]).toMatchObject({
      type: 'EXTERNAL',
      description: 'Bomba hidráulica',
      quantity: '2.00',
      unitPrice: '118.00',
      taxable: true,
      gross: '236.00',
      base: '200.00',
      itbis: '36.00',
      acquisitionCostDop: '80.00',
      costProvenance: 'ACTUAL',
      serviceId: null,
    });
    expect(actual.body.totals).toEqual({ gross: '236.00', base: '200.00', itbis: '36.00' });

    const estimated = await seller.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'EXTERNAL',
      description: 'Sensor usado',
      unitPrice: '118.00',
      costProvenance: 'ESTIMATED',
      acquisitionCostDop: '40.00',
    });
    expect(estimated.status).toBe(201);
    expect(estimated.body.lines[1]).toMatchObject({
      type: 'EXTERNAL',
      quantity: '1.00',
      taxable: true,
      gross: '118.00',
      base: '100.00',
      itbis: '18.00',
      acquisitionCostDop: '40.00',
      costProvenance: 'ESTIMATED',
    });
    expect(estimated.body.totals).toEqual({ gross: '354.00', base: '300.00', itbis: '54.00' });

    const unknown = await seller.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'EXTERNAL',
      description: 'Pieza sin factura',
      unitPrice: '19.50',
      costProvenance: 'UNKNOWN',
    });
    expect(unknown.status).toBe(201);
    expect(unknown.body.lines[2]).toMatchObject({
      type: 'EXTERNAL',
      acquisitionCostDop: null,
      costProvenance: 'UNKNOWN',
      gross: '19.50',
    });
    expect(unknown.body.lines[2].acquisitionCostDop).not.toBe('0.00');
    expect(unknown.body.lines.every((line: { type: string }) => line.type === 'EXTERNAL')).toBe(
      true,
    );
    expect(await prisma.invoiceLine.count({ where: { invoiceId: draft.body.id } })).toBe(3);

    const priced = await seller.agent
      .patch(`${ROOT}/${draft.body.id}/lines/${actual.body.lines[0].id}`)
      .set(CSRF)
      .send({ unitPrice: '59.00' });
    expect(priced.status).toBe(200);
    expect(priced.body.lines[0]).toMatchObject({
      type: 'EXTERNAL',
      unitPrice: '59.00',
      gross: '118.00',
      base: '100.00',
      itbis: '18.00',
      acquisitionCostDop: '80.00',
    });

    const removed = await seller.agent
      .delete(`${ROOT}/${draft.body.id}/lines/${unknown.body.lines[2].id}`)
      .set(CSRF);
    expect(removed.status).toBe(200);
    expect(removed.body.lines).toHaveLength(2);
    expect(
      await prisma.historyEvent.count({
        where: {
          subjectId: draft.body.id,
          eventType: { in: ['INVOICE_LINE_ADDED', 'INVOICE_LINE_REMOVED'] },
        },
      }),
    ).toBe(0);
  });

  it('rejects UNKNOWN with amount, missing actual cost, numeric money, extra fields, and ITEM/QTY', async () => {
    const admin = await fixture();
    const draft = await admin.agent.post(ROOT).set(CSRF).send({});

    const unknownWithAmount = await admin.agent
      .post(`${ROOT}/${draft.body.id}/lines`)
      .set(CSRF)
      .send({
        type: 'EXTERNAL',
        description: 'Bomba',
        unitPrice: '300.00',
        costProvenance: 'UNKNOWN',
        acquisitionCostDop: '0.00',
      });
    expect(unknownWithAmount.status).toBe(400);

    const missingCost = await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'EXTERNAL',
      description: 'Bomba',
      unitPrice: '300.00',
      costProvenance: 'ACTUAL',
    });
    expect(missingCost.status).toBe(400);

    const numericMoney = await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'EXTERNAL',
      description: 'Bomba',
      unitPrice: 300,
      costProvenance: 'UNKNOWN',
    });
    expect(numericMoney.status).toBe(400);

    const extraField = await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'EXTERNAL',
      description: 'Bomba',
      unitPrice: '300.00',
      costProvenance: 'UNKNOWN',
      serviceId: '11111111-1111-4111-8111-111111111111',
    });
    expect(extraField.status).toBe(400);

    const item = await admin.agent
      .post(`${ROOT}/${draft.body.id}/lines`)
      .set(CSRF)
      .send({ type: 'ITEM', description: 'Tracked part', unitPrice: '10.00' });
    expect(item.status).toBe(409);
    expect(item.body.error.message).toBe(UNSUPPORTED_INVENTORY_LINE_MESSAGE);
    expect(await prisma.invoiceLine.count({ where: { invoiceId: draft.body.id } })).toBe(0);
  });
});

describe('M12 confirmation FAC- snapshot (SALE-001, CUST-003)', () => {
  afterEach(cleanup);

  async function addGenericLine(
    agent: Awaited<ReturnType<typeof fixture>>['agent'],
    invoiceId: string,
  ) {
    const added = await agent.post(`${ROOT}/${invoiceId}/lines`).set(CSRF).send({
      type: 'GENERIC',
      description: 'Filtro',
      unitPrice: '118.00',
      costProvenance: 'UNKNOWN',
    });
    expect(added.status).toBe(201);
    return added;
  }

  it('confirms DOP and USD drafts with a shared FAC- sequence and frozen money', async () => {
    const seller = await fixture('SELLER');
    const generic = await customers.findDefault();
    const identified = await customers.create({
      name: 'Taller Norte',
      rnc: '131123456',
    });

    const dopDraft = await seller.agent.post(ROOT).set(CSRF).send({});
    expect(dopDraft.status).toBe(201);
    await addGenericLine(seller.agent, dopDraft.body.id);
    const dop = await seller.agent
      .post(`${ROOT}/${dopDraft.body.id}/confirm`)
      .set(CSRF)
      .send(cashSaleFullPayment('118.00'));
    expect(dop.status).toBe(200);
    expect(dop.body).toMatchObject({
      status: 'COMPLETED',
      number: 'FAC-000001',
      currency: 'DOP',
      fiscal: false,
      customer: { id: generic!.id, name: generic!.name, rnc: null },
      customerSnapshot: { name: generic!.name, rnc: null, phone: null },
      totals: { gross: '118.00', base: '118.00', itbis: '0.00' },
    });
    expect(dop.body.confirmedAt).toEqual(expect.any(String));
    expect(dop.body.lines[0]).toMatchObject({
      gross: '118.00',
      base: '118.00',
      itbis: '0.00',
    });
    expect(
      await prisma.historyEvent.findFirst({
        where: { subjectId: dop.body.id, eventType: 'INVOICE_CONFIRMED' },
      }),
    ).toMatchObject({
      actorUserId: seller.user.id,
      payload: expect.objectContaining({ number: 'FAC-000001' }),
    });

    const usdDraft = await seller.agent
      .post(ROOT)
      .set(CSRF)
      .send({ currency: 'USD', customerId: identified.id, fiscal: true });
    expect(usdDraft.status).toBe(201);
    await addGenericLine(seller.agent, usdDraft.body.id);
    const usd = await seller.agent.post(`${ROOT}/${usdDraft.body.id}/confirm`).set(CSRF).send({});
    expect(usd.status).toBe(200);
    expect(usd.body).toMatchObject({
      status: 'COMPLETED',
      number: 'FAC-000002',
      currency: 'USD',
      fiscal: true,
      customerSnapshot: { name: 'Taller Norte', rnc: '131123456', phone: null },
      totals: { gross: '118.00', base: '100.00', itbis: '18.00' },
    });
    expect(await prisma.invoiceSequence.findUnique({ where: { name: 'FAC' } })).toMatchObject({
      nextValue: 3,
    });
  });

  it('is idempotent on retry and does not consume another number', async () => {
    const admin = await fixture();
    const draft = await admin.agent.post(ROOT).set(CSRF).send({});
    await addGenericLine(admin.agent, draft.body.id);
    await assignNamedCustomerForCredit(admin.agent, draft.body.id);
    const first = await admin.agent.post(`${ROOT}/${draft.body.id}/confirm`).set(CSRF).send({});
    expect(first.status).toBe(200);
    expect(first.body.number).toBe('FAC-000001');

    const second = await admin.agent.post(`${ROOT}/${draft.body.id}/confirm`).set(CSRF).send({});
    expect(second.status).toBe(200);
    expect(second.body.number).toBe('FAC-000001');
    expect(second.body.confirmedAt).toBe(first.body.confirmedAt);
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: draft.body.id, eventType: 'INVOICE_CONFIRMED' },
      }),
    ).toBe(1);
    expect(await prisma.invoiceSequence.findUnique({ where: { name: 'FAC' } })).toMatchObject({
      nextValue: 2,
    });
  });

  it('assigns unique FAC- numbers under concurrent confirmation', async () => {
    const admin = await fixture();
    const firstDraft = await admin.agent.post(ROOT).set(CSRF).send({});
    const secondDraft = await admin.agent.post(ROOT).set(CSRF).send({});
    await addGenericLine(admin.agent, firstDraft.body.id);
    await addGenericLine(admin.agent, secondDraft.body.id);
    await assignNamedCustomerForCredit(admin.agent, firstDraft.body.id);
    await assignNamedCustomerForCredit(admin.agent, secondDraft.body.id);

    const [first, second] = await Promise.all([
      admin.agent.post(`${ROOT}/${firstDraft.body.id}/confirm`).set(CSRF).send({}),
      admin.agent.post(`${ROOT}/${secondDraft.body.id}/confirm`).set(CSRF).send({}),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect([first.body.number, second.body.number].sort()).toEqual(['FAC-000001', 'FAC-000002']);
    expect(await prisma.invoiceSequence.findUnique({ where: { name: 'FAC' } })).toMatchObject({
      nextValue: 3,
    });
  });

  it('keeps the customer snapshot after a later customer edit', async () => {
    const admin = await fixture();
    const identified = await customers.create({
      name: 'Taller Norte',
      rnc: '131123456',
    });
    const draft = await admin.agent
      .post(ROOT)
      .set(CSRF)
      .send({ customerId: identified.id, fiscal: true });
    await addGenericLine(admin.agent, draft.body.id);
    const confirmed = await admin.agent.post(`${ROOT}/${draft.body.id}/confirm`).set(CSRF).send({});
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.customerSnapshot).toEqual({
      name: 'Taller Norte',
      rnc: '131123456',
      phone: null,
    });

    const renamed = await admin.agent
      .patch(`/api/customers/${identified.id}`)
      .set(CSRF)
      .send({ name: 'Taller Sur' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Taller Sur');

    const loaded = await admin.agent.get(`${ROOT}/${draft.body.id}`);
    expect(loaded.status).toBe(200);
    expect(loaded.body.history.map((event: { type: string }) => event.type)).toEqual(
      expect.arrayContaining(['INVOICE_DRAFT_CREATED', 'INVOICE_CONFIRMED']),
    );
    expect(loaded.body.history.map((event: { type: string }) => event.type)).not.toContain(
      'INVOICE_LINE_ADDED',
    );
    expect(loaded.body.history.map((event: { type: string }) => event.type)).not.toContain(
      'INVOICE_LINE_REMOVED',
    );
    expect(loaded.body.history[0]).toMatchObject({
      type: expect.stringMatching(/^INVOICE_/),
      description: expect.any(String),
      actorName: 'Fixture',
    });
    expect(loaded.body.customerSnapshot).toEqual({
      name: 'Taller Norte',
      rnc: '131123456',
      phone: null,
    });
    expect(loaded.body.customer).toMatchObject({
      id: identified.id,
      name: 'Taller Norte',
      rnc: '131123456',
    });
  });

  it('rejects empty drafts, payment payloads, Mechanic, CSRF-less writes, and completed edits', async () => {
    const mechanic = await fixture('MECHANIC');
    const admin = await fixture();
    const empty = await admin.agent.post(ROOT).set(CSRF).send({});
    const emptyConfirm = await admin.agent
      .post(`${ROOT}/${empty.body.id}/confirm`)
      .set(CSRF)
      .send({});
    expect(emptyConfirm.status).toBe(409);
    expect(emptyConfirm.body.error.message).toBe(EMPTY_DRAFT_CONFIRM_MESSAGE);
    expect(await prisma.invoice.findUnique({ where: { id: empty.body.id } })).toMatchObject({
      status: 'DRAFT',
      number: null,
    });
    expect(await prisma.invoiceSequence.findUnique({ where: { name: 'FAC' } })).toMatchObject({
      nextValue: 1,
    });

    const draft = await admin.agent.post(ROOT).set(CSRF).send({});
    await addGenericLine(admin.agent, draft.body.id);
    const payment = await admin.agent
      .post(`${ROOT}/${draft.body.id}/confirm`)
      .set(CSRF)
      .send({ payment: { amount: '10.00' } });
    expect(payment.status).toBe(400);

    expect(
      (await mechanic.agent.post(`${ROOT}/${draft.body.id}/confirm`).set(CSRF).send({})).status,
    ).toBe(403);
    expect((await admin.agent.post(`${ROOT}/${draft.body.id}/confirm`).send({})).status).toBe(403);

    await assignNamedCustomerForCredit(admin.agent, draft.body.id);
    const confirmed = await admin.agent.post(`${ROOT}/${draft.body.id}/confirm`).set(CSRF).send({});
    expect(confirmed.status).toBe(200);
    const blockedEdit = await admin.agent
      .patch(`${ROOT}/${confirmed.body.id}`)
      .set(CSRF)
      .send({ currency: 'USD' });
    expect(blockedEdit.status).toBe(409);
    expect(blockedEdit.body.error.message).toBe(DRAFT_ONLY_EDIT_MESSAGE);
    const blockedLine = await admin.agent
      .post(`${ROOT}/${confirmed.body.id}/lines`)
      .set(CSRF)
      .send({
        type: 'GENERIC',
        description: 'Otra',
        unitPrice: '10.00',
        costProvenance: 'UNKNOWN',
      });
    expect(blockedLine.status).toBe(409);
    expect(blockedLine.body.error.message).toBe(DRAFT_ONLY_EDIT_MESSAGE);
    const blockedDiscard = await admin.agent.delete(`${ROOT}/${confirmed.body.id}`).set(CSRF);
    expect(blockedDiscard.status).toBe(409);
    expect(blockedDiscard.body.error.message).toBe(DRAFT_ONLY_DISCARD_MESSAGE);
  });

  it('does not complete or consume a FAC- number when history append fails', async () => {
    const admin = await fixture();
    const draft = await admin.agent.post(ROOT).set(CSRF).send({});
    await addGenericLine(admin.agent, draft.body.id);
    await assignNamedCustomerForCredit(admin.agent, draft.body.id);
    vi.spyOn(HistoryRepository.prototype, 'append').mockImplementation(async () => {
      throw new Error('history-unavailable');
    });
    await expect(service.confirm(admin.user.id, draft.body.id, {})).rejects.toThrow(
      'history-unavailable',
    );
    expect(await prisma.invoice.findUnique({ where: { id: draft.body.id } })).toMatchObject({
      status: 'DRAFT',
      number: null,
    });
    expect(await prisma.invoiceSequence.findUnique({ where: { name: 'FAC' } })).toMatchObject({
      nextValue: 1,
    });
    expect(
      await prisma.historyEvent.findFirst({
        where: { subjectId: draft.body.id, eventType: 'INVOICE_CONFIRMED' },
      }),
    ).toBeNull();
  });
});

describe('M13 DOP profitability Administrator boundary (COST-001..004)', () => {
  afterEach(cleanup);

  const SERVICES = '/api/catalogs/services';

  function expectNoProfitability(body: { profitability?: unknown; lines?: unknown[] }) {
    expect(body.profitability).toBeUndefined();
    for (const line of body.lines ?? []) {
      expect(line).not.toHaveProperty('profitability');
    }
  }

  it('keeps mixed-cost invoice profit unavailable while calculating known lines', async () => {
    const admin = await fixture();
    const seller = await fixture('SELLER');
    const catalog = await admin.agent.post(SERVICES).set(CSRF).send({ name: 'Balanceo' });
    expect(catalog.status).toBe(201);

    const draft = await admin.agent.post(ROOT).set(CSRF).send({});
    expect(
      (
        await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
          type: 'GENERIC',
          description: 'Filtro',
          unitPrice: '18000.00',
          costProvenance: 'ACTUAL',
          acquisitionCostDop: '12300.00',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
          type: 'EXTERNAL',
          description: 'Bomba externa',
          unitPrice: '200.00',
          costProvenance: 'ESTIMATED',
          acquisitionCostDop: '80.00',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
          type: 'GENERIC',
          description: 'Sin costo',
          unitPrice: '100.00',
          costProvenance: 'UNKNOWN',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
          type: 'SERVICE',
          serviceId: catalog.body.id,
          unitPrice: '500.00',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
          type: 'DELIVERY',
          description: 'Entrega Santiago',
          unitPrice: '0.00',
        })
      ).status,
    ).toBe(201);

    await assignNamedCustomerForCredit(admin.agent, draft.body.id);
    const confirmed = await admin.agent.post(`${ROOT}/${draft.body.id}/confirm`).set(CSRF).send({});
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.profitability).toEqual({
      status: 'UNAVAILABLE',
      reason: 'UNKNOWN_COST',
      profitDop: null,
      margin: null,
    });
    expect(confirmed.body.lines[0].profitability).toEqual({
      status: 'CALCULATED',
      reason: null,
      profitDop: '5700.00',
      margin: '31.67',
    });
    expect(confirmed.body.lines[0].costProvenance).toBe('ACTUAL');
    expect(confirmed.body.lines[1].profitability).toEqual({
      status: 'CALCULATED',
      reason: null,
      profitDop: '120.00',
      margin: '60.00',
    });
    expect(confirmed.body.lines[1].costProvenance).toBe('ESTIMATED');
    expect(confirmed.body.lines[2].profitability).toEqual({
      status: 'UNAVAILABLE',
      reason: 'UNKNOWN_COST',
      profitDop: null,
      margin: null,
    });
    expect(confirmed.body.lines[2].acquisitionCostDop).toBeNull();
    expect(confirmed.body.lines[3].profitability).toEqual({
      status: 'CALCULATED',
      reason: null,
      profitDop: '500.00',
      margin: '100.00',
    });
    expect(confirmed.body.lines[4].profitability).toEqual({
      status: 'CALCULATED',
      reason: null,
      profitDop: '0.00',
      margin: null,
    });

    const listed = await admin.agent.get(`${ROOT}?status=COMPLETED`);
    expect(listed.status).toBe(200);
    expect(listed.body.items[0].profitability).toEqual(confirmed.body.profitability);

    const sellerView = await seller.agent.get(`${ROOT}/${draft.body.id}`);
    expect(sellerView.status).toBe(200);
    expect(sellerView.body.lines[0].acquisitionCostDop).toBe('12300.00');
    expectNoProfitability(sellerView.body);
    expect(sellerView.body.history.map((event: { type: string }) => event.type)).not.toContain(
      'INVOICE_GROSS_PROFIT_RECORDED',
    );
    expect(sellerView.body.history.map((event: { type: string }) => event.type)).toContain(
      'INVOICE_CONFIRMED',
    );

    const sellerList = await seller.agent.get(`${ROOT}?status=COMPLETED`);
    expect(sellerList.status).toBe(200);
    expect(sellerList.body.items[0].profitability).toBeUndefined();
    expect(sellerList.body.items[0].exchangeRateDopPerUsd).toBeUndefined();
    expect(listed.body.items[0].payments).toEqual([]);

    const mechanic = await fixture('MECHANIC');
    expect((await mechanic.agent.get(`${ROOT}/${draft.body.id}`)).status).toBe(403);
  });

  it('marks completed USD profitability unavailable without FX and omits profit on drafts', async () => {
    const admin = await fixture();
    const identified = await customers.create({
      name: 'Taller Norte',
      rnc: '131123456',
    });
    const usdDraft = await admin.agent
      .post(ROOT)
      .set(CSRF)
      .send({ currency: 'USD', customerId: identified.id, fiscal: true });
    expect(usdDraft.status).toBe(201);
    expectNoProfitability(usdDraft.body);

    expect(
      (
        await admin.agent.post(`${ROOT}/${usdDraft.body.id}/lines`).set(CSRF).send({
          type: 'GENERIC',
          description: 'Filtro',
          unitPrice: '118.00',
          costProvenance: 'ACTUAL',
          acquisitionCostDop: '80.00',
        })
      ).status,
    ).toBe(201);
    const usd = await admin.agent.post(`${ROOT}/${usdDraft.body.id}/confirm`).set(CSRF).send({});
    expect(usd.status).toBe(200);
    expect(usd.body.profitability).toEqual({
      status: 'UNAVAILABLE',
      reason: 'PENDING_FX_RATE',
      profitDop: null,
      margin: null,
    });
    expect(usd.body.lines[0].profitability).toEqual(usd.body.profitability);
    expect(usd.body.lines[0].acquisitionCostDop).toBe('80.00');

    const seller = await fixture('SELLER');
    const sellerUsd = await seller.agent.get(`${ROOT}/${usdDraft.body.id}`);
    expect(sellerUsd.status).toBe(200);
    expect(sellerUsd.body.lines[0].acquisitionCostDop).toBe('80.00');
    expectNoProfitability(sellerUsd.body);
  });

  it('leaves an all-unknown DOP invoice unavailable rather than profit 0', async () => {
    const admin = await fixture();
    const draft = await admin.agent.post(ROOT).set(CSRF).send({});
    expect(
      (
        await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
          type: 'GENERIC',
          description: 'Sin costo',
          unitPrice: '100.00',
          costProvenance: 'UNKNOWN',
        })
      ).status,
    ).toBe(201);
    await assignNamedCustomerForCredit(admin.agent, draft.body.id);
    const confirmed = await admin.agent.post(`${ROOT}/${draft.body.id}/confirm`).set(CSRF).send({});
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.profitability).toEqual({
      status: 'UNAVAILABLE',
      reason: 'UNKNOWN_COST',
      profitDop: null,
      margin: null,
    });
  });
});
