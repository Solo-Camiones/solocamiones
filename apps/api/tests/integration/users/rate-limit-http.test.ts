import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { hashPassword } from '../../../src/features/access/password.js';
import { USERS_MUTATION_RATE_LIMIT_MAX_ATTEMPTS } from '../../../src/features/users/constants.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { resetUsersMutationRateLimit } from '../../../src/features/users/users-mutation-rate-limit.js';
import { resetUsersReadRateLimit } from '../../../src/features/users/users-read-rate-limit.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';

const app = createTestApp();
const users = new UserRepository();
const PASSWORD = 'personal-password';
const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };
const ROOT = '/api/admin/users';

async function administratorSession() {
  const user = await users.create({
    name: 'Fixture',
    username: randomUUID(),
    role: 'ADMINISTRATOR',
    passwordHash: await hashPassword(PASSWORD),
  });
  const agent = request.agent(app);
  expect(
    (await agent.post('/api/auth/login').send({ username: user.username, password: PASSWORD }))
      .status,
  ).toBe(200);
  return { user, agent };
}

describe('administrative users HTTP rate limits', () => {
  afterEach(async () => {
    await clearTestHistory();
    await prisma.passwordRecoveryRequest.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await resetUsersMutationRateLimit();
    await resetUsersReadRateLimit();
  });
  afterAll(disconnectPrisma);

  it('rate-limits administrative user creation from the same IP after 10 POSTs', async () => {
    const { agent } = await administratorSession();
    const firstClientIp = '203.0.113.40';
    const secondClientIp = '203.0.113.41';
    const invalidCreateBody = {};

    for (let attempt = 0; attempt < USERS_MUTATION_RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
      const response = await agent
        .post(ROOT)
        .set(CSRF)
        .set('X-Forwarded-For', firstClientIp)
        .send(invalidCreateBody);
      expect(response.status).not.toBe(429);
    }

    const limited = await agent
      .post(ROOT)
      .set(CSRF)
      .set('X-Forwarded-For', firstClientIp)
      .send(invalidCreateBody);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('TOO_MANY_REQUESTS');

    const otherClient = await agent
      .post(ROOT)
      .set(CSRF)
      .set('X-Forwarded-For', secondClientIp)
      .send({ name: 'Other IP User', username: randomUUID(), role: 'SELLER' });
    expect(otherClient.status).toBe(201);
  });

  it('does not rate-limit listing users after more than 11 GETs', async () => {
    const { agent } = await administratorSession();
    const clientIp = '203.0.113.42';

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await agent.get(ROOT).set('X-Forwarded-For', clientIp);
      expect(response.status).toBe(200);
    }
  });
});
