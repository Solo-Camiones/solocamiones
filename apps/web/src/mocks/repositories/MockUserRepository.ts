import type { UserRepository } from '../../api/contracts/repositories';
import { toListPage } from '../../api/contracts/pagination';
import type { ResolveRecoveryInput, SaveUserInput } from '../../api/contracts/users';
import { err, ok } from '../../shared/auth/types';
import { requirePermission } from '../services/require-permission';
import {
  INITIAL_USER_PASSWORD,
  prepareUserSave,
  sortManagedUsers,
  toManagedUser,
} from '../services/users';
import { cloneForRead, getMockState } from '../state';

export class MockUserRepository implements UserRepository {
  async list(page = 1) {
    const permission = requirePermission('users.manage');
    if (!permission.ok) {
      return permission;
    }

    return ok(toListPage(cloneForRead(sortManagedUsers(getMockState().users.map(toManagedUser))), page));
  }

  async save(input: SaveUserInput) {
    const permission = requirePermission('users.manage');
    if (!permission.ok) {
      return permission;
    }

    const state = getMockState();
    const prepared = prepareUserSave(state.users, input, permission.value.id);
    if (!prepared.ok) {
      return prepared;
    }

    const user = prepared.value;
    const index = state.users.findIndex((entry) => entry.id === user.id);
    if (index >= 0) {
      state.users[index] = user;
    } else {
      state.users.push(user);
    }

    const saved = cloneForRead(toManagedUser(user));
    if (!input.id) {
      return ok({ ...saved, initialPassword: INITIAL_USER_PASSWORD });
    }
    return ok(saved);
  }

  async listRecoveryRequests() {
    const permission = requirePermission('users.manage');
    if (!permission.ok) return permission;
    return ok([]);
  }

  async resolveRecovery(_input: ResolveRecoveryInput) {
    const permission = requirePermission('users.manage');
    if (!permission.ok) return permission;
    return err({
      code: 'NOT_FOUND',
      message: 'Las solicitudes de recuperación se administran con la API real.',
    });
  }
}

export const mockUserRepository = new MockUserRepository();
