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

describe('draft line cost provenance updates (COST-001)', () => {
  afterEach(cleanup);

  it('preserves provenance on unrelated edits and persists explicit ACTUAL, ESTIMATED, and UNKNOWN', async () => {
    const agent = await fixture();
    const draft = await agent.post(ROOT).set(CSRF).send({});
    const created = await agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'GENERIC',
      description: 'Filtro',
      unitPrice: '118.00',
      costProvenance: 'ESTIMATED',
      acquisitionCostDop: '40.00',
    });
    const lineId = created.body.lines[0].id;

    const repriced = await agent
      .patch(`${ROOT}/${draft.body.id}/lines/${lineId}`)
      .set(CSRF)
      .send({ unitPrice: '120.00' });
    expect(repriced.status).toBe(200);
    expect(repriced.body.lines[0]).toMatchObject({
      unitPrice: '120.00',
      acquisitionCostDop: '40.00',
      costProvenance: 'ESTIMATED',
    });

    const actual = await agent
      .patch(`${ROOT}/${draft.body.id}/lines/${lineId}`)
      .set(CSRF)
      .send({ acquisitionCostDop: '45.00', costProvenance: 'ACTUAL' });
    expect(actual.status).toBe(200);
    expect(actual.body.lines[0]).toMatchObject({
      acquisitionCostDop: '45.00',
      costProvenance: 'ACTUAL',
    });

    const estimated = await agent
      .patch(`${ROOT}/${draft.body.id}/lines/${lineId}`)
      .set(CSRF)
      .send({ acquisitionCostDop: '42.00', costProvenance: 'ESTIMATED' });
    expect(estimated.status).toBe(200);
    expect(estimated.body.lines[0]).toMatchObject({
      acquisitionCostDop: '42.00',
      costProvenance: 'ESTIMATED',
    });

    const unknown = await agent
      .patch(`${ROOT}/${draft.body.id}/lines/${lineId}`)
      .set(CSRF)
      .send({ acquisitionCostDop: null, costProvenance: 'UNKNOWN' });
    expect(unknown.status).toBe(200);
    expect(unknown.body.lines[0]).toMatchObject({
      acquisitionCostDop: null,
      costProvenance: 'UNKNOWN',
    });

    expect(
      (
        await agent
          .patch(`${ROOT}/${draft.body.id}/lines/${lineId}`)
          .set(CSRF)
          .send({ acquisitionCostDop: '50.00' })
      ).status,
    ).toBe(400);
  });
});
