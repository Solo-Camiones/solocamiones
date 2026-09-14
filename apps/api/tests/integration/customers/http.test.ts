import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { hashPassword } from '../../../src/features/access/password.js';
import { HistoryRepository } from '../../../src/features/history/repository.js';
import { GENERIC_CUSTOMER_LOCKED_MESSAGE } from '../../../src/features/customers/constants.js';
import { CustomerRepository } from '../../../src/features/customers/repository.js';
import { CustomerService } from '../../../src/features/customers/service.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';

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

async function cleanup() {
  vi.restoreAllMocks();
  await clearTestHistory();
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
