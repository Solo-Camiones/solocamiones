import { randomBytes } from 'node:crypto';

import { AppError } from '../../infrastructure/errors/app-error.js';
import { hashPassword } from '../access/password.js';
import { toPublicProfile } from '../access/projection.js';
import { assertAdministrator } from './policies.js';
import {
  appendProfileChange,
  appendRecoveryCancellations,
  appendRecoveryExpirations,
  profileSnapshot,
} from '../history/service.js';
import { accountTransaction, type AccountTransaction } from './transaction.js';
import {
  createAdministrativeUserSchema,
  paginationSchema,
  recoveryRequestSchema,
  recoveryResolutionSchema,
  updateAdministrativeUserSchema,
  userIdSchema,
} from './validation.js';

/** Read at use/boot time so importing this module does not require the env var. */
export function getInitialPassword(): string {
  const value = process.env.INITIAL_PASSWORD;
  if (!value) {
    throw new Error('INITIAL_PASSWORD is required');
  }
  return value;
}

export const RECOVERY_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
export const RECOVERY_REQUEST_MESSAGE =
  'If the account is eligible, its recovery request will be available to an administrator.';

export class UserService {
  constructor(
    private readonly transaction: AccountTransaction = accountTransaction,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(actorId: string, input: unknown) {
    const profile = createAdministrativeUserSchema.parse(input);
    const initialPassword = getInitialPassword();
    const passwordHash = await hashPassword(initialPassword);
    return this.transaction(async ({ users, history }) => {
      assertAdministrator(await users.findById(actorId));
      const user = await users.create({ ...profile, passwordHash, mustChangePassword: true });
      await history.append({
        actor: { actorType: 'USER', actorUserId: actorId },
        subjectType: 'USER',
        subjectId: user.id,
        eventType: 'USER_CREATED',
        payload: {
          ...profileSnapshot(user),
          role: user.role,
          active: user.active,
          mustChangePassword: user.mustChangePassword,
          source: 'ADMINISTRATION',
        },
      });
      // Plaintext exists only in this 201 body; history and later reads stay hash-only.
      return { ...toPublicProfile(user), initialPassword };
    });
  }

  async list(actorId: string, query: unknown) {
    const { page, pageSize } = paginationSchema.parse(query);
    return this.transaction(async ({ users }) => {
      assertAdministrator(await users.findById(actorId));
      const result = await users.list(page, pageSize);
      return { ...result, items: result.items.map(toPublicProfile) };
    });
  }

  async update(actorId: string, id: string, input: unknown) {
    userIdSchema.parse({ id });
    const patch = updateAdministrativeUserSchema.parse(input);
    return this.transaction(async ({ users, sessions, recoveries, history }) => {
      assertAdministrator(await users.findById(actorId));
      const target = await users.findById(id);
      if (!target) throw AppError.notFound('User not found');
      const removesAdministrator =
        patch.active === false || (patch.role !== undefined && patch.role !== 'ADMINISTRATOR');
      if (id === actorId && removesAdministrator) {
        throw AppError.forbidden('Another administrator must deactivate or change your role');
      }
      if (
        target.active &&
        target.role === 'ADMINISTRATOR' &&
        removesAdministrator &&
        (await users.countActiveAdministrators()) <= 1
      ) {
        throw AppError.conflict('At least one active administrator is required');
      }
      const updated = await users.updateAdministrative(id, patch);
      const actor = { actorType: 'USER' as const, actorUserId: actorId };
      await appendProfileChange(history, actorId, target, updated);
      if (target.role !== updated.role) {
        await history.append({
          actor,
          subjectType: 'USER',
          subjectId: id,
          eventType: 'USER_ROLE_CHANGED',
          payload: { before: target.role, after: updated.role },
        });
      }
      if (target.active !== updated.active) {
        await history.append(
          updated.active
            ? {
                actor,
                subjectType: 'USER',
                subjectId: id,
                eventType: 'USER_ACTIVATED',
                payload: { before: false, after: true },
              }
            : {
                actor,
                subjectType: 'USER',
                subjectId: id,
                eventType: 'USER_DEACTIVATED',
                payload: { before: true, after: false },
              },
        );
      }
      if (patch.active === false) {
        await sessions.revokeAllByUserId(id);
        await appendRecoveryCancellations(
          history,
          await recoveries.cancelForUser(id, this.now()),
          actor,
          'USER_DEACTIVATED',
        );
      }
      return toPublicProfile(updated);
    });
  }

  async requestRecovery(input: unknown): Promise<{ message: string }> {
    const { username } = recoveryRequestSchema.parse(input);
    try {
      await this.transaction(async ({ users, recoveries, history }) => {
        const user = await users.findByUsername(username);
        if (!user?.active) return;
        const now = this.now();
        await appendRecoveryExpirations(history, await recoveries.expire(now, user.id));
        if (!(await recoveries.findPending(user.id))) {
          const recovery = await recoveries.create(
            user.id,
            new Date(now.getTime() + RECOVERY_REQUEST_TTL_MS),
          );
          await history.append({
            actor: { actorType: 'ANONYMOUS', actorUserId: null },
            subjectType: 'USER',
            subjectId: user.id,
            eventType: 'USER_RECOVERY_REQUESTED',
            payload: {
              requestId: recovery.id,
              after: 'PENDING',
              expiresAt: recovery.expiresAt.toISOString(),
            },
          });
        }
      });
    } catch (error) {
      // A simultaneous duplicate is indistinguishable from an existing request to public callers.
      if (!(error instanceof AppError && error.code === 'CONFLICT')) throw error;
    }
    return { message: RECOVERY_REQUEST_MESSAGE };
  }

  async listRecoveries(actorId: string, query: unknown) {
    const { page, pageSize } = paginationSchema.parse(query);
    return this.transaction(async ({ users, recoveries, history }) => {
      assertAdministrator(await users.findById(actorId));
      await appendRecoveryExpirations(history, await recoveries.expire(this.now()));
      return recoveries.list(page, pageSize);
    });
  }

  async resolveRecovery(actorId: string, id: string, input: unknown) {
    userIdSchema.parse({ id });
    const resolution = recoveryResolutionSchema.parse(input);
    // 192 random bits, no expiration. Plaintext exists only for this one response.
    const temporaryPassword =
      resolution.action === 'approve' ? randomBytes(24).toString('base64url') : undefined;
    const passwordHash = temporaryPassword ? await hashPassword(temporaryPassword) : undefined;
    return this.transaction(async ({ users, sessions, recoveries, history }) => {
      assertAdministrator(await users.findById(actorId));
      const recovery = await recoveries.findById(id);
      if (!recovery) throw AppError.notFound('Recovery request not found');
      if (recovery.userId === actorId)
        throw AppError.forbidden('Cannot resolve your own recovery request');
      const now = this.now();
      if (recovery.status !== 'PENDING' || recovery.expiresAt <= now) {
        throw AppError.conflict('Recovery request is no longer pending or has expired');
      }
      const user = await users.findById(recovery.userId);
      if (!user?.active) throw AppError.conflict('Recovery cannot reactivate an inactive account');
      if (passwordHash) {
        await users.updateOwnProfile(user.id, {
          name: user.name,
          passwordHash,
          mustChangePassword: true,
        });
        await sessions.revokeAllByUserId(user.id);
      }
      const result = await recoveries.resolve(
        id,
        resolution.action === 'approve' ? 'APPROVED' : 'REJECTED',
        actorId,
        now,
        resolution.action === 'approve',
      );
      const envelope = {
        actor: { actorType: 'USER' as const, actorUserId: actorId },
        subjectType: 'USER' as const,
        subjectId: user.id,
      };
      await history.append(
        resolution.action === 'approve'
          ? {
              ...envelope,
              eventType: 'USER_RECOVERY_APPROVED',
              payload: {
                requestId: id,
                before: 'PENDING',
                after: 'APPROVED',
                identityVerified: true,
                mustChangePassword: true,
              },
            }
          : {
              ...envelope,
              eventType: 'USER_RECOVERY_REJECTED',
              payload: { requestId: id, before: 'PENDING', after: 'REJECTED' },
            },
      );
      return { request: result, ...(temporaryPassword ? { temporaryPassword } : {}) };
    });
  }
}

export const userService = new UserService();
