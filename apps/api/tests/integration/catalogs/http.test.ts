import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { hashPassword } from '../../../src/features/access/password.js';
import { CatalogService } from '../../../src/features/catalogs/service.js';
import { HistoryRepository } from '../../../src/features/history/repository.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';

const app = createTestApp();
const users = new UserRepository();
const service = new CatalogService();
const PASSWORD = 'personal-password';
const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };
const ROOT = '/api/catalogs/services';

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
  await prisma.invoice.deleteMany();
  await prisma.mechanicalService.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

describe('M4 catalogs HTTP (LINE-004 / ADMIN-001)', () => {
  afterEach(cleanup);
  afterAll(disconnectPrisma);

  it('lets Administrator create, edit and deactivate; Seller lists only active services', async () => {
    const admin = await fixture();
    const seller = await fixture('SELLER');
    const created = await admin.agent.post(ROOT).set(CSRF).send({
      name: '  Instalación  ',
      description: '  En bahía  ',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Instalación',
      description: 'En bahía',
      active: true,
    });
    expect(created.body).not.toHaveProperty('price');
    const renamed = await admin.agent.patch(`${ROOT}/${created.body.id}`).set(CSRF).send({
      name: 'Instalación mecánica',
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Instalación mecánica');
    const inactive = await admin.agent.post(ROOT).set(CSRF).send({
      name: 'Diagnóstico',
      active: false,
    });
    expect(inactive.status).toBe(201);
    const deactivated = await admin.agent.patch(`${ROOT}/${created.body.id}`).set(CSRF).send({
      active: false,
    });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.active).toBe(false);

    const adminList = await admin.agent.get(ROOT);
    expect(adminList.status).toBe(200);
    expect(adminList.body.items.map((item: { name: string }) => item.name)).toEqual([
      'Diagnóstico',
      'Instalación mecánica',
    ]);

    const sellerList = await seller.agent.get(ROOT);
    expect(sellerList.status).toBe(200);
    expect(sellerList.body.items).toEqual([]);

    const stillActive = await admin.agent.patch(`${ROOT}/${inactive.body.id}`).set(CSRF).send({
      active: true,
    });
    expect(stillActive.status).toBe(200);
    const sellerActive = await seller.agent.get(`${ROOT}/${inactive.body.id}`);
    expect(sellerActive.status).toBe(200);
    expect(sellerActive.body.name).toBe('Diagnóstico');
    expect(sellerActive.body).not.toHaveProperty('price');

    expect(await prisma.historyEvent.findMany({ where: { subjectId: created.body.id } })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'SERVICE_CREATED',
          actorUserId: admin.user.id,
          subjectType: 'MECHANICAL_SERVICE',
        }),
        expect.objectContaining({ eventType: 'SERVICE_UPDATED', actorUserId: admin.user.id }),
      ]),
    );
  });

  it('returns 403 for Seller writes and Mechanic reads or writes', async () => {
    const seller = await fixture('SELLER');
    const mechanic = await fixture('MECHANIC');
    expect((await seller.agent.post(ROOT).set(CSRF).send({ name: 'X' })).status).toBe(403);
    expect(
      (await seller.agent.patch(`${ROOT}/${randomUUID()}`).set(CSRF).send({ name: 'X' })).status,
    ).toBe(403);
    expect((await mechanic.agent.get(ROOT)).status).toBe(403);
    expect((await mechanic.agent.post(ROOT).set(CSRF).send({ name: 'X' })).status).toBe(403);
  });

  it('hides inactive services from Seller by id while Administrator can still read them', async () => {
    const admin = await fixture();
    const seller = await fixture('SELLER');
    const created = await admin.agent.post(ROOT).set(CSRF).send({
      name: 'Oculto',
      active: false,
    });
    expect(created.status).toBe(201);
    expect((await seller.agent.get(`${ROOT}/${created.body.id}`)).status).toBe(404);
    const adminGet = await admin.agent.get(`${ROOT}/${created.body.id}`);
    expect(adminGet.status).toBe(200);
    expect(adminGet.body.active).toBe(false);
  });

  it('returns the R1 validation envelope for unknown fields and price', async () => {
    const admin = await fixture();
    const priced = await admin.agent.post(ROOT).set(CSRF).send({ name: 'A', price: 100 });
    expect(priced.status).toBe(400);
    expect(priced.body.error.code).toBe('VALIDATION');
    expect(priced.body.error).not.toHaveProperty('errorId');
    const unknown = await admin.agent.post(ROOT).set(CSRF).send({ name: 'A', extra: true });
    expect(unknown.status).toBe(400);
    const patchPrice = await admin.agent
      .patch(`${ROOT}/${randomUUID()}`)
      .set(CSRF)
      .send({ price: 50 });
    expect(patchPrice.status).toBe(400);
  });

  it('rejects writes without the CSRF header', async () => {
    const admin = await fixture();
    expect((await admin.agent.post(ROOT).send({ name: 'No CSRF' })).status).toBe(403);
  });

  it('rolls back the service when history append fails', async () => {
    const admin = await fixture();
    vi.spyOn(HistoryRepository.prototype, 'append').mockImplementation(async () => {
      throw new Error('history-unavailable');
    });
    await expect(service.create(admin.user.id, { name: 'Rollback' })).rejects.toThrow(
      'history-unavailable',
    );
    expect(await prisma.mechanicalService.count()).toBe(0);
    expect(await prisma.historyEvent.count()).toBe(0);
  });
});
