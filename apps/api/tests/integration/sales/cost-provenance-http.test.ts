import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { hashPassword } from '../../../src/features/access/password.js';
import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';

const users = new UserRepository();
const PASSWORD = 'personal-password';
const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };
const ROOT = '/api/sales';

async function fixture() {
  const app = createTestApp();
  const agent = request.agent(app);
  const user = await users.create({
    name: 'Fixture',
    username: randomUUID(),
    role: 'ADMINISTRATOR',
    passwordHash: await hashPassword(PASSWORD),
  });
  expect(
    (await agent.post('/api/auth/login').send({ username: user.username, password: PASSWORD }))
      .status,
  ).toBe(200);
  return agent;
}

async function cleanup() {
  await resetLoginRateLimit();
  await clearTestHistory();
  await prisma.invoice.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

afterAll(disconnectPrisma);

describe('draft line cost capture withdrawal (COST-006)', () => {
  afterEach(cleanup);

  it('persists UNKNOWN cost, omits it from projections, and rejects billing cost fields', async () => {
    const agent = await fixture();
    const draft = await agent.post(ROOT).set(CSRF).send({});
    const created = await agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'GENERIC',
      description: 'Filtro',
      unitPrice: '118.00',
    });
    expect(created.status).toBe(201);
    expect(created.body.lines[0]).not.toHaveProperty('acquisitionCostDop');
    expect(created.body.lines[0]).not.toHaveProperty('costProvenance');

    const stored = await prisma.invoiceLine.findUnique({
      where: { id: created.body.lines[0].id },
    });
    expect(stored).toMatchObject({
      costProvenance: 'UNKNOWN',
      acquisitionCostDop: null,
    });

    const lineId = created.body.lines[0].id;
    expect(
      (
        await agent
          .patch(`${ROOT}/${draft.body.id}/lines/${lineId}`)
          .set(CSRF)
          .send({ acquisitionCostDop: '45.00', costProvenance: 'ACTUAL' })
      ).status,
    ).toBe(400);
    expect(
      (
        await agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
          type: 'GENERIC',
          description: 'Otro filtro',
          unitPrice: '50.00',
          costProvenance: 'ESTIMATED',
          acquisitionCostDop: '10.00',
        })
      ).status,
    ).toBe(400);
  });
});
