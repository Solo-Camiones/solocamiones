import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { AccessService } from '../../../src/features/access/service.js';
import { RECOVERY_RATE_LIMIT_MAX_ATTEMPTS } from '../../../src/features/access/constants.js';
import { hashPassword, verifyPassword } from '../../../src/features/access/password.js';
import { resetAccessReadRateLimit } from '../../../src/features/access/access-read-rate-limit.js';
import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import { resetProfileMutationRateLimit } from '../../../src/features/access/profile-mutation-rate-limit.js';
import { resetRecoveryRateLimit } from '../../../src/features/access/recovery-rate-limit.js';
import { resetUsersMutationRateLimit } from '../../../src/features/users/users-mutation-rate-limit.js';
import { resetUsersReadRateLimit } from '../../../src/features/users/users-read-rate-limit.js';
import { SessionRepository } from '../../../src/features/access/repository.js';
import { RecoveryRepository } from '../../../src/features/users/recovery-repository.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { INITIAL_PASSWORD, UserService } from '../../../src/features/users/service.js';
import { accountTransaction } from '../../../src/features/users/transaction.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';

const app = createTestApp();
const users = new UserRepository();
const service = new UserService();
const access = new AccessService();
const PASSWORD = 'personal-password';
const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };
const ROOT = '/api/admin/users';
const RECOVERY = '/api/auth/recovery-requests';

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

async function pending(userId: string) {
  const user = await users.findById(userId);
  await service.requestRecovery({ username: user!.username });
  return (
    await prisma.passwordRecoveryRequest.findFirstOrThrow({ where: { userId, status: 'PENDING' } })
  ).id;
}

describe('M8 account management HTTP and transactions', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await clearTestHistory();
    await prisma.passwordRecoveryRequest.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await resetLoginRateLimit();
    await resetRecoveryRateLimit();
    await resetAccessReadRateLimit();
    await resetProfileMutationRateLimit();
    await resetUsersMutationRateLimit();
    await resetUsersReadRateLimit();
  });
  afterAll(disconnectPrisma);

  it.each(['ADMINISTRATOR', 'SELLER', 'MECHANIC'] as const)(
    'creates %s with restricted initial access and completes own change',
    async (role) => {
      const admin = await fixture();
      const created = await admin.agent
        .post(ROOT)
        .set(CSRF)
        .send({ name: ' New User ', username: ` New-${role} `, role });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        name: 'New User',
        username: `new-${role.toLowerCase()}`,
        mustChangePassword: true,
        active: true,
        initialPassword: INITIAL_PASSWORD,
      });
      expect(created.headers['cache-control']).toBe('no-store');
      expect(JSON.stringify(created.body)).not.toMatch(/passwordHash|argon2/);
      const createdHistory = await prisma.historyEvent.findMany({
        where: { subjectId: created.body.id },
      });
      expect(JSON.stringify(createdHistory)).not.toContain(INITIAL_PASSWORD);
      expect(createdHistory).toMatchObject([
        {
          eventType: 'USER_CREATED',
          actorUserId: admin.user.id,
          payload: { role, source: 'ADMINISTRATION' },
        },
      ]);
      const stored = await users.findById(created.body.id);
      expect(await verifyPassword(stored!.passwordHash, INITIAL_PASSWORD)).toBe(true);
      const agent = request.agent(app);
      const login = await agent
        .post('/api/auth/login')
        .send({ username: stored!.username, password: INITIAL_PASSWORD });
      expect(login.body.mustChangePassword).toBe(true);
      expect(JSON.stringify(login.body)).not.toContain(INITIAL_PASSWORD);
      const second = await access.login({ username: stored!.username, password: INITIAL_PASSWORD });
      const session = await agent.get('/api/auth/session');
      expect(session.body.mustChangePassword).toBe(true);
      expect(JSON.stringify(session.body)).not.toContain(INITIAL_PASSWORD);
      const me = await agent.get('/api/auth/me');
      expect(me.status).toBe(200);
      expect(JSON.stringify(me.body)).not.toContain(INITIAL_PASSWORD);
      const denied = await agent.get(ROOT);
      expect(denied.status).toBe(403);
      expect(denied.body.error.details.reason).toBe('PASSWORD_CHANGE_REQUIRED');
      expect((await agent.get('/api/auth/admin-probe')).status).toBe(403);
      expect(
        (await agent.patch('/api/auth/me').set(CSRF).send({ name: 'Contact only' })).body
          .mustChangePassword,
      ).toBe(true);
      for (const [currentPassword, password] of [
        ['wrong', PASSWORD],
        [INITIAL_PASSWORD, '12345'],
        [INITIAL_PASSWORD, INITIAL_PASSWORD],
      ]) {
        expect(
          (
            await agent
              .patch('/api/auth/me')
              .set(CSRF)
              .send({ name: 'Name', currentPassword, password })
          ).status,
        ).toBe(400);
      }
      const changed = await agent
        .patch('/api/auth/me')
        .set(CSRF)
        .send({ name: 'Name', currentPassword: INITIAL_PASSWORD, password: PASSWORD });
      expect(changed.status).toBe(200);
      expect(changed.body.mustChangePassword).toBe(false);
      expect(String(changed.headers['set-cookie'])).toContain('sid=;');
      expect(await prisma.session.count({ where: { userId: stored!.id } })).toBe(0);
      await expect(access.resolveSession(second.sessionToken)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
      expect((await agent.get('/api/auth/session')).status).toBe(401);
      expect(
        (
          await agent
            .post('/api/auth/login')
            .send({ username: stored!.username, password: INITIAL_PASSWORD })
        ).status,
      ).toBe(401);
      expect(
        (
          await agent
            .post('/api/auth/login')
            .send({ username: stored!.username, password: PASSWORD })
        ).status,
      ).toBe(200);
      expect((await agent.get(ROOT)).status).toBe(role === 'ADMINISTRATOR' ? 200 : 403);
    },
  );

  it('keeps existing/internal accounts unrestricted and revokes every session on a voluntary change', async () => {
    const { user, agent } = await fixture('MECHANIC');
    expect(user.mustChangePassword).toBe(false);
    await access.login({ username: user.username, password: PASSWORD });
    const response = await agent
      .patch('/api/auth/me')
      .set(CSRF)
      .send({ name: user.name, currentPassword: PASSWORD, password: 'replacement-password' });
    expect(response.status).toBe(200);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('enforces authentication, role and CSRF without mutation', async () => {
    expect((await request(app).get(ROOT)).status).toBe(401);
    for (const role of ['SELLER', 'MECHANIC'] as const) {
      const { agent, user } = await fixture(role);
      expect((await agent.get(ROOT)).status).toBe(403);
      expect((await agent.post(ROOT).set(CSRF).send({})).status).toBe(403);
      expect(
        (await agent.patch(`${ROOT}/${user.id}`).set(CSRF).send({ role: 'ADMINISTRATOR' })).status,
      ).toBe(403);
      expect((await agent.get(`${ROOT}/recovery-requests`)).status).toBe(403);
      await expect(service.list(user.id, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    const admin = await fixture();
    expect((await admin.agent.post(ROOT).send({})).status).toBe(403);
    expect(await prisma.user.count()).toBe(3);
    expect(await prisma.historyEvent.count()).toBe(0);
  });

  it('rejects credential injection, invalid IDs, empty patches and duplicate normalized usernames', async () => {
    const { user, agent } = await fixture();
    for (const field of ['password', 'currentPassword', 'passwordHash', 'mustChangePassword']) {
      const forbidden = { [field]: field === 'mustChangePassword' ? false : 'injected' };
      expect(
        (
          await agent
            .post(ROOT)
            .set(CSRF)
            .send({ name: 'N', username: 'other', role: 'SELLER', ...forbidden })
        ).status,
      ).toBe(400);
      expect((await agent.patch(`${ROOT}/${user.id}`).set(CSRF).send(forbidden)).status).toBe(400);
    }
    expect((await agent.patch(`${ROOT}/${user.id}`).set(CSRF).send({})).status).toBe(400);
    expect((await agent.patch(`${ROOT}/invalid`).set(CSRF).send({ name: 'N' })).status).toBe(400);
    expect(
      (await agent.patch(`${ROOT}/${randomUUID()}`).set(CSRF).send({ name: 'N' })).status,
    ).toBe(404);
    expect(
      (
        await agent
          .post(ROOT)
          .set(CSRF)
          .send({ name: 'N', username: ` ${user.username.toUpperCase()} `, role: 'SELLER' })
      ).status,
    ).toBe(409);
    expect(await prisma.user.count()).toBe(1);
  });

  it('lists stable pages, updates allowed fields and retains inactive identities and credentials', async () => {
    const admin = await fixture();
    const target = await fixture('SELLER');
    const page = await admin.agent.get(`${ROOT}?page=1&pageSize=1`);
    expect(page.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect(page.body.items).toHaveLength(1);
      expect(JSON.stringify(page.body)).not.toContain(INITIAL_PASSWORD);
      expect((await admin.agent.get(`${ROOT}?pageSize=101`)).status).toBe(400);
      const updated = await admin.agent
        .patch(`${ROOT}/${target.user.id}`)
        .set(CSRF)
        .send({ username: ' EDITED ', role: 'MECHANIC', phone: '', email: '' });
      expect(updated.body).toMatchObject({
        username: 'edited',
        role: 'MECHANIC',
        phone: null,
        email: null,
      });
      expect(JSON.stringify(updated.body)).not.toContain(INITIAL_PASSWORD);
    expect(
      (
        await admin.agent
          .patch(`${ROOT}/${target.user.id}`)
          .set(CSRF)
          .send({ username: admin.user.username })
      ).status,
    ).toBe(409);
    await pending(target.user.id);
    expect(
      (await admin.agent.patch(`${ROOT}/${target.user.id}`).set(CSRF).send({ active: false }))
        .status,
    ).toBe(200);
    expect((await target.agent.get('/api/auth/session')).status).toBe(401);
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: target.user.id, eventType: 'USER_DEACTIVATED' },
      }),
    ).toBe(1);
    expect(await users.findById(target.user.id)).toMatchObject({
      active: false,
      passwordHash: target.user.passwordHash,
    });
    expect((await admin.agent.get(ROOT)).body.total).toBe(2);
    await expect(access.login({ username: 'edited', password: PASSWORD })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(
      (await admin.agent.patch(`${ROOT}/${target.user.id}`).set(CSRF).send({ active: true }))
        .status,
    ).toBe(200);
    expect((await target.agent.get('/api/auth/session')).status).toBe(401);
    await expect(access.login({ username: 'edited', password: PASSWORD })).resolves.toBeDefined();
  });

  it('forbids self demotion/deactivation and preserves an active admin under simultaneous cross changes', async () => {
    const a = await fixture();
    for (const patch of [{ active: false }, { role: 'SELLER' }]) {
      expect((await a.agent.patch(`${ROOT}/${a.user.id}`).set(CSRF).send(patch)).status).toBe(403);
    }
    const b = await fixture();
    const results = await Promise.allSettled([
      service.update(a.user.id, b.user.id, { active: false }),
      service.update(b.user.id, a.user.id, { role: 'SELLER' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await users.countActiveAdministrators()).toBe(1);
  });

  it('preserves a new account restriction across role changes and deactivation/reactivation', async () => {
    const admin = await fixture();
    const target = await service.create(admin.user.id, {
      name: 'New',
      username: 'pending-user',
      role: 'SELLER',
    });
    const login = await access.login({ username: target.username, password: INITIAL_PASSWORD });
    await service.update(admin.user.id, target.id, { role: 'MECHANIC', active: false });
    await service.update(admin.user.id, target.id, { active: true });
    expect(await users.findById(target.id)).toMatchObject({
      role: 'MECHANIC',
      active: true,
      mustChangePassword: true,
    });
    await expect(access.resolveSession(login.sessionToken)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    const fresh = await access.login({ username: target.username, password: INITIAL_PASSWORD });
    expect(fresh.user.mustChangePassword).toBe(true);
  });

  it('public recovery is generic, deduplicated, rate limited and never changes credentials or sessions', async () => {
    const target = await fixture('SELLER');
    const firstClientIp = '203.0.113.20';
    const secondClientIp = '203.0.113.21';
    const missing = await request(app)
      .post(RECOVERY)
      .set('X-Forwarded-For', firstClientIp)
      .send({ username: 'missing' });
    const found = await request(app)
      .post(RECOVERY)
      .set('X-Forwarded-For', firstClientIp)
      .send({ username: target.user.username });
    expect(found.status).toBe(202);
    expect(found.body).toEqual(missing.body);
    await Promise.all(
      Array.from({ length: 4 }, () => service.requestRecovery({ username: target.user.username })),
    );
    expect(await prisma.passwordRecoveryRequest.count()).toBe(1);
    expect(await users.findById(target.user.id)).toEqual(target.user);
    expect(await prisma.session.count()).toBe(1);
    for (let attempt = 2; attempt < RECOVERY_RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
      expect(
        (
          await request(app)
            .post(RECOVERY)
            .set('X-Forwarded-For', firstClientIp)
            .send({ username: 'missing' })
        ).status,
      ).toBe(202);
    }
    expect(
      (
        await request(app)
          .post(RECOVERY)
          .set('X-Forwarded-For', firstClientIp)
          .send({ username: 'missing' })
      ).status,
    ).toBe(429);
    expect(
      (
        await request(app)
          .post(RECOVERY)
          .set('X-Forwarded-For', secondClientIp)
          .send({ username: 'missing' })
      ).status,
    ).toBe(202);
  });

  it('requires another administrator and identity confirmation; approval returns a temporary password only once', async () => {
    const admin = await fixture();
    const target = await fixture('SELLER');
    const id = await pending(target.user.id);
    const ownId = await pending(admin.user.id);
    const resolve = `${ROOT}/recovery-requests/${id}/resolve`;
    expect((await admin.agent.get(`${ROOT}/recovery-requests`)).body.total).toBe(2);
    expect(
      (
        await admin.agent
          .post(`${ROOT}/recovery-requests/${ownId}/resolve`)
          .set(CSRF)
          .send({ action: 'reject' })
      ).status,
    ).toBe(403);
    expect(
      (
        await admin.agent
          .post(resolve)
          .set(CSRF)
          .send({ action: 'approve', identityVerified: false })
      ).status,
    ).toBe(400);
    expect(
      (
        await target.agent
          .post(resolve)
          .set(CSRF)
          .send({ action: 'approve', identityVerified: true })
      ).status,
    ).toBe(403);
    expect(
      (await admin.agent.post(resolve).send({ action: 'approve', identityVerified: true })).status,
    ).toBe(403);
    const approved = await admin.agent
      .post(resolve)
      .set(CSRF)
      .send({ action: 'approve', identityVerified: true });
    expect(approved.status).toBe(200);
    expect(approved.headers['cache-control']).toBe('no-store');
    expect(approved.body.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(approved.body.request).toMatchObject({
      status: 'APPROVED',
      identityVerified: true,
      resolvedById: admin.user.id,
    });
    expect(JSON.stringify(approved.body)).not.toContain('passwordHash');
    expect(await prisma.session.count({ where: { userId: target.user.id } })).toBe(0);
    expect(
      (
        await admin.agent
          .post(resolve)
          .set(CSRF)
          .send({ action: 'approve', identityVerified: true })
      ).status,
    ).toBe(409);
    const rows = await prisma.passwordRecoveryRequest.findMany();
    expect(JSON.stringify(rows)).not.toContain(approved.body.temporaryPassword);
    expect(JSON.stringify((await admin.agent.get(`${ROOT}/recovery-requests`)).body)).not.toContain(
      approved.body.temporaryPassword,
    );
    // The request lifetime does not impose any lifetime on the issued credential.
    const futureAccess = new AccessService(
      users,
      new SessionRepository(),
      () => new Date('2036-01-01'),
    );
    const recovered = await futureAccess.login({
      username: target.user.username,
      password: approved.body.temporaryPassword,
    });
    expect(recovered.user.mustChangePassword).toBe(true);
    await expect(
      access.login({ username: target.user.username, password: PASSWORD }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const changed = await target.agent
      .post('/api/auth/login')
      .send({ username: target.user.username, password: approved.body.temporaryPassword });
    expect(changed.status).toBe(200);
    expect(
      (
        await target.agent.patch('/api/auth/me').set(CSRF).send({
          name: target.user.name,
          currentPassword: approved.body.temporaryPassword,
          password: 'new-personal-password',
        })
      ).status,
    ).toBe(200);
    await expect(
      access.login({ username: target.user.username, password: approved.body.temporaryPassword }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects without modifying credentials and allows another administrator to resolve an admin request', async () => {
    const a = await fixture();
    const b = await fixture();
    const id = await pending(a.user.id);
    const rejected = await service.resolveRecovery(b.user.id, id, { action: 'reject' });
    expect(rejected).not.toHaveProperty('temporaryPassword');
    expect(rejected.request.status).toBe('REJECTED');
    expect(await users.findById(a.user.id)).toEqual(a.user);
    expect(await prisma.session.count({ where: { userId: a.user.id } })).toBe(1);
    const newId = await pending(a.user.id);
    expect(
      (
        await service.resolveRecovery(b.user.id, newId, {
          action: 'approve',
          identityVerified: true,
        })
      ).request.status,
    ).toBe('APPROVED');
  });

  it('expires requests at 24 hours, allows replacement, and refuses inactive recovery', async () => {
    const admin = await fixture();
    const target = await fixture('SELLER');
    const id = await pending(target.user.id);
    await prisma.passwordRecoveryRequest.update({
      where: { id },
      data: { expiresAt: new Date(0) },
    });
    await expect(
      service.resolveRecovery(admin.user.id, id, { action: 'approve', identityVerified: true }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await service.requestRecovery({ username: target.user.username });
    expect((await prisma.passwordRecoveryRequest.findUniqueOrThrow({ where: { id } })).status).toBe(
      'EXPIRED',
    );
    expect(
      await prisma.historyEvent.findMany({
        where: { subjectId: target.user.id, eventType: 'USER_RECOVERY_EXPIRED' },
      }),
    ).toMatchObject([{ actorType: 'SYSTEM', actorUserId: null, payload: { requestId: id } }]);
    expect(await prisma.passwordRecoveryRequest.count({ where: { status: 'PENDING' } })).toBe(1);
    const next = await pending(target.user.id);
    await service.update(admin.user.id, target.user.id, { active: false });
    await expect(
      service.resolveRecovery(admin.user.id, next, { action: 'approve', identityVerified: true }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await service.requestRecovery({ username: target.user.username });
    expect(await prisma.passwordRecoveryRequest.count({ where: { status: 'PENDING' } })).toBe(0);
  });

  it('commits only one concurrent approval and only one concurrent password change', async () => {
    const admin = await fixture();
    const target = await fixture('SELLER');
    const id = await pending(target.user.id);
    const approvals = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        service.resolveRecovery(admin.user.id, id, { action: 'approve', identityVerified: true }),
      ),
    );
    const succeeded = approvals.filter((r) => r.status === 'fulfilled');
    expect(succeeded).toHaveLength(1);
    const temporary = succeeded[0]!.value.temporaryPassword!;
    const changes = await Promise.allSettled(
      ['first-personal', 'second-personal'].map((password) =>
        access.updateOwnProfile(target.user.id, {
          name: 'Target',
          currentPassword: temporary,
          password,
        }),
      ),
    );
    expect(changes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await users.findById(target.user.id))!.mustChangePassword).toBe(false);
  });

  it('rolls back password, restriction and sessions if recovery resolution fails', async () => {
    const admin = await fixture();
    const target = await fixture('SELLER');
    const id = await pending(target.user.id);
    vi.spyOn(RecoveryRepository.prototype, 'resolve').mockRejectedValueOnce(
      new Error('simulated persistence failure'),
    );
    await expect(
      service.resolveRecovery(admin.user.id, id, { action: 'approve', identityVerified: true }),
    ).rejects.toThrow('simulated persistence failure');
    expect(await users.findById(target.user.id)).toEqual(target.user);
    expect(await prisma.session.count({ where: { userId: target.user.id } })).toBe(1);
    expect((await prisma.passwordRecoveryRequest.findUniqueOrThrow({ where: { id } })).status).toBe(
      'PENDING',
    );
  });

  it('rolls back deactivation and profile password changes when session revocation fails', async () => {
    const admin = await fixture();
    const target = await fixture('SELLER');
    vi.spyOn(SessionRepository.prototype, 'revokeAllByUserId').mockRejectedValue(
      new Error('revocation failed'),
    );
    await expect(service.update(admin.user.id, target.user.id, { active: false })).rejects.toThrow(
      'revocation failed',
    );
    await expect(
      access.updateOwnProfile(target.user.id, {
        name: 'N',
        currentPassword: PASSWORD,
        password: 'other-password',
      }),
    ).rejects.toThrow('revocation failed');
    expect(await users.findById(target.user.id)).toEqual(target.user);
    expect(await prisma.session.count({ where: { userId: target.user.id } })).toBe(1);
  });

  it('rechecks credentials when a reset wins the race before login session issuance', async () => {
    const target = await fixture('SELLER');
    const racing = new AccessService(
      users,
      new SessionRepository(),
      () => new Date(),
      async (work) => {
        await users.updateOwnProfile(target.user.id, {
          name: target.user.name,
          passwordHash: await hashPassword('new-password'),
        });
        return accountTransaction(work);
      },
    );
    await expect(
      racing.login({ username: target.user.username, password: PASSWORD }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(await prisma.session.count({ where: { userId: target.user.id } })).toBe(1);
  });
});
