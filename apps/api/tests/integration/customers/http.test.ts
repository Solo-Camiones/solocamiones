import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import { hashPassword } from '../../../src/features/access/password.js';
import { HistoryRepository } from '../../../src/features/history/repository.js';
import {
  CASH_CUSTOMER_CREDIT_FIELDS_FORBIDDEN_MESSAGE,
  CREDIT_CUSTOMER_REQUIRES_FISCAL_ID_MESSAGE,
  CREDIT_TO_CASH_OPEN_BALANCE_MESSAGE,
  GENERIC_CUSTOMER_LOCKED_MESSAGE,
} from '../../../src/features/customers/constants.js';
import { CustomerRepository } from '../../../src/features/customers/repository.js';
import { CustomerService } from '../../../src/features/customers/service.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';
import { validCreditCustomerBody } from '../../helpers/sales.js';

const app = createTestApp();
const users = new UserRepository();
const customers = new CustomerRepository();
const service = new CustomerService();
const PASSWORD = 'personal-password';
const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };
const ROOT = '/api/customers';

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

async function createCompletedInvoice(input: {
  customerId: string;
  currency: 'DOP' | 'USD';
  gross: string;
  actorUserId: string;
  payments?: Array<{ amount: string }>;
}) {
  const invoice = await prisma.invoice.create({
    data: {
      status: 'COMPLETED',
      currency: input.currency,
      fiscal: false,
      customerId: input.customerId,
      number: `FAC-${randomUUID().slice(0, 8)}`,
      confirmedAt: new Date(),
      dueDate: new Date('2026-10-10T00:00:00.000Z'),
      customerName: 'Snapshot',
      gross: input.gross,
      base: input.gross,
      itbis: '0.00',
      confirmedByUserId: input.actorUserId,
      confirmedByName: 'Fixture',
      snapshotCustomerType: 'CREDIT',
      snapshotCreditTermDays: 60,
      payments: input.payments?.length
        ? {
            create: input.payments.map((payment) => ({
              kind: 'PAYMENT',
              amount: payment.amount,
              currency: input.currency,
              method: 'CASH',
              effectiveDate: new Date('2026-09-01T00:00:00.000Z'),
              actorUserId: input.actorUserId,
            })),
          }
        : undefined,
    },
  });
  return invoice;
}

async function cleanup() {
  vi.restoreAllMocks();
  await resetLoginRateLimit();
  await clearTestHistory();
  await prisma.invoicePayment.deleteMany({
    where: { invoice: { customer: { isDefault: false } } },
  });
  await prisma.invoice.deleteMany({ where: { customer: { isDefault: false } } });
  await prisma.customerContact.deleteMany({ where: { customer: { isDefault: false } } });
  await prisma.customer.deleteMany({ where: { isDefault: false } });
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

describe('M2 customers HTTP (CUST-001/002)', () => {
  afterEach(cleanup);
  afterAll(disconnectPrisma);

  it('lets Seller and Administrator create, search and edit customers', async () => {
    const seller = await fixture('SELLER');
    const created = await seller.agent.post(ROOT).set(CSRF).send({
      name: ' Taller Norte ',
      rnc: '1-31-12345-6',
      contacts: [{ name: 'Ana', phone: '8091112222', isPrimary: true }],
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Taller Norte',
      rnc: '131123456',
      isDefault: false,
      customerType: 'CASH',
      creditLimitDop: null,
      creditTermDays: null,
    });
    expect(created.body.contacts).toHaveLength(1);
    const listed = await seller.agent.get(`${ROOT}?q=norte`);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    const updated = await seller.agent.patch(`${ROOT}/${created.body.id}`).set(CSRF).send({
      notes: 'VIP',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.notes).toBe('VIP');
    expect(await prisma.historyEvent.findMany({ where: { subjectId: created.body.id } })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'CUSTOMER_CREATED', actorUserId: seller.user.id }),
        expect.objectContaining({ eventType: 'CUSTOMER_UPDATED', actorUserId: seller.user.id }),
      ]),
    );
  });

  it('returns 403 for Mechanic and keeps Cliente contado locked', async () => {
    const mechanic = await fixture('MECHANIC');
    const admin = await fixture('ADMINISTRATOR');
    expect((await mechanic.agent.get(ROOT)).status).toBe(403);
    expect((await mechanic.agent.post(ROOT).set(CSRF).send({ name: 'X' })).status).toBe(403);
    const generic = await customers.findDefault();
    expect(generic).not.toBeNull();
    const locked = await admin.agent.patch(`${ROOT}/${generic!.id}`).set(CSRF).send({ name: 'Cash' });
    expect(locked.status).toBe(409);
    expect(locked.body.error.message).toBe(GENERIC_CUSTOMER_LOCKED_MESSAGE);
    expect(await prisma.historyEvent.count({ where: { subjectId: generic!.id } })).toBe(0);
    expect((await admin.agent.get(`${ROOT}/${generic!.id}`)).body.isDefault).toBe(true);
  });

  it('returns the R1 validation envelope for unknown fields and invalid RNC', async () => {
    const admin = await fixture();
    const invalid = await admin.agent.post(ROOT).set(CSRF).send({ name: 'A', rnc: '12' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION');
    expect(invalid.body.error).not.toHaveProperty('errorId');
    const unknown = await admin.agent.post(ROOT).set(CSRF).send({ name: 'A', isDefault: true });
    expect(unknown.status).toBe(400);
  });

  it('does not append a success event when create fails after a duplicate fiscal id', async () => {
    const admin = await fixture();
    await service.create(admin.user.id, { name: 'A', rnc: '00112345678' });
    await clearTestHistory();
    await expect(service.create(admin.user.id, { name: 'B', rnc: '00112345678' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(await prisma.historyEvent.count()).toBe(0);
    expect(await prisma.customer.count({ where: { isDefault: false } })).toBe(1);
  });

  it('rolls back the customer when history append fails', async () => {
    const admin = await fixture();
    vi.spyOn(HistoryRepository.prototype, 'append').mockImplementation(async () => {
      throw new Error('history-unavailable');
    });
    await expect(service.create(admin.user.id, { name: 'Rollback' })).rejects.toThrow(
      'history-unavailable',
    );
    expect(await prisma.customer.count({ where: { isDefault: false } })).toBe(0);
    expect(await prisma.historyEvent.count()).toBe(0);
  });

  it('rejects writes without the CSRF header', async () => {
    const admin = await fixture();
    expect((await admin.agent.post(ROOT).send({ name: 'No CSRF' })).status).toBe(403);
  });
});

describe('pre-production customers HTTP (CUST-004/005/006)', () => {
  afterEach(cleanup);
  afterAll(disconnectPrisma);

  it('denies Seller credit customer creation and credit field writes with 403', async () => {
    const seller = await fixture('SELLER');
    const creditPost = await seller.agent.post(ROOT).set(CSRF).send(validCreditCustomerBody());
    expect(creditPost.status).toBe(403);
    expect(await prisma.customer.count({ where: { isDefault: false } })).toBe(0);

    const limitPost = await seller.agent.post(ROOT).set(CSRF).send({
      name: 'Contado',
      creditLimitDop: '1000.00',
    });
    expect(limitPost.status).toBe(403);
    expect(await prisma.customer.count({ where: { isDefault: false } })).toBe(0);
  });

  it('denies Seller updates on CREDIT customers and credit fields on CASH customers', async () => {
    const admin = await fixture('ADMINISTRATOR');
    const seller = await fixture('SELLER');
    const created = await admin.agent.post(ROOT).set(CSRF).send(validCreditCustomerBody());
    expect(created.status).toBe(201);

    const patchCredit = await seller.agent
      .patch(`${ROOT}/${created.body.id}`)
      .set(CSRF)
      .send({ notes: 'No touch' });
    expect(patchCredit.status).toBe(403);

    const cash = await seller.agent.post(ROOT).set(CSRF).send({ name: 'Seller cash' });
    expect(cash.status).toBe(201);
    const patchLimit = await seller.agent
      .patch(`${ROOT}/${cash.body.id}`)
      .set(CSRF)
      .send({ creditTermDays: 30 });
    expect(patchLimit.status).toBe(403);
  });

  it('lets Administrator create CREDIT customers and validates CASH/CREDIT integrity', async () => {
    const admin = await fixture('ADMINISTRATOR');
    const created = await admin.agent.post(ROOT).set(CSRF).send(validCreditCustomerBody('Distribuidora'));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Distribuidora',
      customerType: 'CREDIT',
      creditLimitDop: '10000.00',
      creditTermDays: 60,
      rnc: '00112345678',
    });

    const cashWithLimit = await admin.agent.post(ROOT).set(CSRF).send({
      name: 'Bad cash',
      customerType: 'CASH',
      creditLimitDop: '100.00',
    });
    expect(cashWithLimit.status).toBe(400);
    expect(cashWithLimit.body.error.message).toBe(CASH_CUSTOMER_CREDIT_FIELDS_FORBIDDEN_MESSAGE);

    const creditWithoutRnc = await admin.agent.post(ROOT).set(CSRF).send({
      name: 'Bad credit',
      customerType: 'CREDIT',
      creditLimitDop: '100.00',
      creditTermDays: 30,
    });
    expect(creditWithoutRnc.status).toBe(400);
    expect(creditWithoutRnc.body.error.message).toBe(CREDIT_CUSTOMER_REQUIRES_FISCAL_ID_MESSAGE);
  });

  it('filters customers by customerType', async () => {
    const admin = await fixture('ADMINISTRATOR');
    await admin.agent.post(ROOT).set(CSRF).send(validCreditCustomerBody('Filtro crédito'));
    await admin.agent.post(ROOT).set(CSRF).send({ name: 'Filtro contado' });

    const creditOnly = await admin.agent.get(`${ROOT}?customerType=CREDIT&q=Filtro`);
    expect(creditOnly.status).toBe(200);
    expect(creditOnly.body.items).toHaveLength(1);
    expect(creditOnly.body.items[0]).toMatchObject({ customerType: 'CREDIT' });
  });

  it('blocks CREDIT to CASH only while completed DOP invoices have balance', async () => {
    const admin = await fixture('ADMINISTRATOR');
    const created = await admin.agent.post(ROOT).set(CSRF).send(validCreditCustomerBody());
    expect(created.status).toBe(201);

    await createCompletedInvoice({
      customerId: created.body.id,
      currency: 'DOP',
      gross: '500.00',
      actorUserId: admin.user.id,
    });

    const blocked = await admin.agent
      .patch(`${ROOT}/${created.body.id}`)
      .set(CSRF)
      .send({ customerType: 'CASH' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toBe(CREDIT_TO_CASH_OPEN_BALANCE_MESSAGE);

    await prisma.invoice.deleteMany({ where: { customerId: created.body.id } });
    await createCompletedInvoice({
      customerId: created.body.id,
      currency: 'USD',
      gross: '200.00',
      actorUserId: admin.user.id,
    });
    const allowedWithUsdBalance = await admin.agent
      .patch(`${ROOT}/${created.body.id}`)
      .set(CSRF)
      .send({ customerType: 'CASH' });
    expect(allowedWithUsdBalance.status).toBe(200);
    expect(allowedWithUsdBalance.body).toMatchObject({
      customerType: 'CASH',
      creditLimitDop: null,
      creditTermDays: null,
    });
  });

  it('allows CREDIT to CASH after balance is settled and records limit history', async () => {
    const admin = await fixture('ADMINISTRATOR');
    const created = await admin.agent.post(ROOT).set(CSRF).send(validCreditCustomerBody());
    expect(created.status).toBe(201);

    await createCompletedInvoice({
      customerId: created.body.id,
      currency: 'DOP',
      gross: '500.00',
      actorUserId: admin.user.id,
      payments: [{ amount: '500.00' }],
    });

    const downgraded = await admin.agent
      .patch(`${ROOT}/${created.body.id}`)
      .set(CSRF)
      .send({ customerType: 'CASH' });
    expect(downgraded.status).toBe(200);
    expect(downgraded.body).toMatchObject({
      customerType: 'CASH',
      creditLimitDop: null,
      creditTermDays: null,
    });

    const updatedEvent = await prisma.historyEvent.findFirst({
      where: { subjectId: created.body.id, eventType: 'CUSTOMER_UPDATED' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(updatedEvent?.payload).toMatchObject({
      before: expect.objectContaining({
        customerType: 'CREDIT',
        creditLimitDop: '10000.00',
      }),
      after: expect.objectContaining({
        customerType: 'CASH',
        creditLimitDop: null,
        creditTermDays: null,
      }),
    });
  });
});
