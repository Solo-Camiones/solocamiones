import { randomUUID } from 'node:crypto';

import { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { resetAccessReadRateLimit } from '../../../src/features/access/access-read-rate-limit.js';
import {
  ACCESS_READ_RATE_LIMIT_MAX_REQUESTS,
  CSRF_REQUEST_HEADER,
  CSRF_REQUEST_HEADER_VALUE,
  INVALID_CREDENTIALS_MESSAGE,
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  PROFILE_MUTATION_RATE_LIMIT_MAX_ATTEMPTS,
  SESSION_COOKIE_NAME,
} from '../../../src/features/access/constants.js';
import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import { resetProfileMutationRateLimit } from '../../../src/features/access/profile-mutation-rate-limit.js';
import { hashPassword } from '../../../src/features/access/password.js';
import { SessionRepository } from '../../../src/features/access/repository.js';
import {
  generateSessionToken,
  hashSessionToken,
} from '../../../src/features/access/session-token.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';

const users = new UserRepository();
const sessions = new SessionRepository();
const PASSWORD = 'correct-password';

function csrf() {
  return { [CSRF_REQUEST_HEADER]: CSRF_REQUEST_HEADER_VALUE };
}

function readSid(response: request.Response): string | undefined {
  const header = response.headers['set-cookie'];
  if (!header) {
    return undefined;
  }

  const match = String(header).match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  return match?.[1];
}

async function createUser(overrides: { active?: boolean; role?: Role } = {}) {
  const username = `auth-${randomUUID()}`;
  const user = await users.create({
    name: 'Auth Fixture',
    username,
    role: overrides.role ?? Role.SELLER,
    mustChangePassword: false,
    passwordHash: await hashPassword(PASSWORD),
    phone: '8095550000',
    email: 'auth@example.com',
  });

  if (overrides.active === false) {
    return { user: await users.setActive(user.id, false), username, password: PASSWORD };
  }

  return { user, username, password: PASSWORD };
}

describe('auth HTTP (integration)', () => {
  afterEach(async () => {
    await clearTestHistory();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await resetLoginRateLimit();
    await resetProfileMutationRateLimit();
    await resetAccessReadRateLimit();
  });

  afterAll(disconnectPrisma);

  it('logs in with valid credentials, sets sid, and persists only the token hash', async () => {
    const { user, username, password } = await createUser();
    const response = await request(createTestApp())
      .post('/api/auth/login')
      .send({ username, password });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: user.id,
      username,
      name: user.name,
      role: user.role,
      mustChangePassword: false,
    });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain(user.passwordHash);

    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).not.toMatch(/Secure/i);

    const token = readSid(response);
    expect(token).toMatch(/^[0-9a-f]+$/);
    expect(setCookie).not.toContain(hashSessionToken(token ?? ''));

    const session = await sessions.findByTokenHash(hashSessionToken(token ?? ''));
    expect(session).toMatchObject({ userId: user.id });
    expect(session).not.toHaveProperty('token');
  });

  it.each(['unknown-user', 'inactive', 'wrong-password'] as const)(
    'rejects %s login with the same message and without a session cookie',
    async (caseName) => {
      const fixture = await createUser({ active: caseName !== 'inactive' });
      if (caseName === 'inactive') {
        await users.setActive(fixture.user.id, false);
      }

      const response = await request(createTestApp())
        .post('/api/auth/login')
        .send({
          username: caseName === 'unknown-user' ? `missing-${randomUUID()}` : fixture.username,
          password: caseName === 'wrong-password' ? 'incorrect-password' : fixture.password,
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toMatchObject({
        code: 'UNAUTHORIZED',
        message: INVALID_CREDENTIALS_MESSAGE,
      });
      expect(readSid(response)).toBeUndefined();
      expect(await prisma.session.count()).toBe(0);
    },
  );

  it('requires a session cookie for session and profile reads', async () => {
    const app = createTestApp();
    const missing = await request(app).get('/api/auth/session');
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('UNAUTHORIZED');

    const expiredToken = generateSessionToken();
    const { user } = await createUser();
    await sessions.create({
      tokenHash: hashSessionToken(expiredToken),
      userId: user.id,
      expiresAt: new Date('2000-01-01T00:00:00.000Z'),
    });

    const expired = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${expiredToken}`);
    expect(expired.status).toBe(401);
  });

  it('returns own profile without passwordHash and logs out the session', async () => {
    const { user, username, password } = await createUser();
    const agent = request.agent(createTestApp());
    await agent.post('/api/auth/login').send({ username, password });

    const session = await agent.get('/api/auth/session');
    expect(session.status).toBe(200);
    expect(session.body).toEqual({
      id: user.id,
      username,
      name: user.name,
      role: user.role,
      mustChangePassword: false,
      phone: user.phone,
      email: user.email,
    });

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      id: user.id,
      username,
      phone: user.phone,
      email: user.email,
      active: true,
    });
    expect(JSON.stringify(me.body)).not.toContain('passwordHash');

    const logout = await agent.post('/api/auth/logout').set(csrf());
    expect(logout.status).toBe(204);
    expect(await prisma.session.count()).toBe(0);
    expect((await agent.get('/api/auth/session')).status).toBe(401);
  });

  it('updates own contact fields and rejects account-administration and bad passwords', async () => {
    const { username, password } = await createUser();
    const agent = request.agent(createTestApp());
    await agent.post('/api/auth/login').send({ username, password });

    const updated = await agent
      .patch('/api/auth/me')
      .set(csrf())
      .send({ name: 'Updated Name', phone: null, email: 'updated@example.com' });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      name: 'Updated Name',
      phone: null,
      email: 'updated@example.com',
      username,
      role: 'SELLER',
      mustChangePassword: false,
      active: true,
    });
    expect(JSON.stringify(updated.body)).not.toContain('passwordHash');

    const persisted = await users.findByUsername(username);
    expect(persisted).toMatchObject({
      name: 'Updated Name',
      username,
      role: Role.SELLER,
      mustChangePassword: false,
      active: true,
    });

    const rejectedFields = await agent
      .patch('/api/auth/me')
      .set(csrf())
      .send({ name: 'Nope', username: 'hacked', role: 'ADMINISTRATOR', active: false });
    expect(rejectedFields.status).toBe(400);
    expect(rejectedFields.body.error.code).toBe('VALIDATION');

    const shortPassword = await agent.patch('/api/auth/me').set(csrf()).send({
      name: 'Updated Name',
      currentPassword: password,
      password: '12345',
    });
    expect(shortPassword.status).toBe(400);

    const wrongCurrent = await agent.patch('/api/auth/me').set(csrf()).send({
      name: 'Updated Name',
      currentPassword: 'not-current',
      password: 'new-password',
    });
    expect(wrongCurrent.status).toBe(400);
    expect(wrongCurrent.body.error.code).toBe('VALIDATION');
  });

  it('rejects cookie-authenticated mutations without the CSRF header with 403', async () => {
    const { username, password } = await createUser();
    const agent = request.agent(createTestApp());
    await agent.post('/api/auth/login').send({ username, password });

    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(403);
    expect(logout.body.error.code).toBe('FORBIDDEN');
    expect(await prisma.session.count()).toBe(1);

    const patch = await agent.patch('/api/auth/me').send({ name: 'No CSRF' });
    expect(patch.status).toBe(403);
    expect(patch.body.error.code).toBe('FORBIDDEN');
  });

  it('rate-limits login attempts from the same client with 429 TOO_MANY_REQUESTS', async () => {
    const app = createTestApp();
    const body = { username: 'rate-limit-user', password: 'wrong-password' };
    const firstClientIp = '203.0.113.10';
    const secondClientIp = '203.0.113.11';

    for (let attempt = 0; attempt < LOGIN_RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
      const response = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', firstClientIp)
        .send(body);
      expect(response.status).toBe(401);
    }

    const limited = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', firstClientIp)
      .send(body);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('TOO_MANY_REQUESTS');

    const otherClient = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', secondClientIp)
      .send(body);
    expect(otherClient.status).toBe(401);
  });

  it('rate-limits own-profile mutations from the same client with 429 TOO_MANY_REQUESTS', async () => {
    const { username, password } = await createUser();
    const agent = request.agent(createTestApp());
    await agent.post('/api/auth/login').send({ username, password });

    const firstClientIp = '203.0.113.20';
    const secondClientIp = '203.0.113.21';
    const body = { name: 'Rate Limited Name' };

    for (let attempt = 0; attempt < PROFILE_MUTATION_RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
      const response = await agent
        .patch('/api/auth/me')
        .set('X-Forwarded-For', firstClientIp)
        .set(csrf())
        .send(body);
      expect(response.status).toBe(200);
    }

    const limited = await agent
      .patch('/api/auth/me')
      .set('X-Forwarded-For', firstClientIp)
      .set(csrf())
      .send(body);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('TOO_MANY_REQUESTS');

    const otherClient = await agent
      .patch('/api/auth/me')
      .set('X-Forwarded-For', secondClientIp)
      .set(csrf())
      .send(body);
    expect(otherClient.status).toBe(200);
  });

  it('does not rate-limit session and profile reads after a tight SPA-style burst', async () => {
    const { username, password } = await createUser();
    const agent = request.agent(createTestApp());
    await agent.post('/api/auth/login').send({ username, password });

    const burstSize = LOGIN_RATE_LIMIT_MAX_ATTEMPTS + 1;
    for (let attempt = 0; attempt < burstSize; attempt += 1) {
      const session = await agent.get('/api/auth/session');
      expect(session.status).toBe(200);

      const me = await agent.get('/api/auth/me');
      expect(me.status).toBe(200);
    }
  });

  it('rate-limits access reads from the same client after the generous window is exceeded', async () => {
    const { username, password } = await createUser();
    const agent = request.agent(createTestApp());
    await agent.post('/api/auth/login').send({ username, password });

    const firstClientIp = '203.0.113.30';
    const secondClientIp = '203.0.113.31';

    for (let attempt = 0; attempt < ACCESS_READ_RATE_LIMIT_MAX_REQUESTS; attempt += 1) {
      const response = await agent.get('/api/auth/session').set('X-Forwarded-For', firstClientIp);
      expect(response.status).toBe(200);
    }

    const limited = await agent.get('/api/auth/session').set('X-Forwarded-For', firstClientIp);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('TOO_MANY_REQUESTS');

    const otherClient = await agent.get('/api/auth/session').set('X-Forwarded-For', secondClientIp);
    expect(otherClient.status).toBe(200);
  });
});
