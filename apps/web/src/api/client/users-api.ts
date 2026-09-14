import type {
  ManagedUser,
  PasswordRecoveryRequest,
  ResolveRecoveryInput,
  ResolveRecoveryResult,
  SaveUserInput,
  SaveUserResult,
} from '../contracts/users';
import { LIST_PAGE_SIZE, type ListPage } from '../contracts/pagination';
import { err, ok, type Result } from '../../shared/auth/types';
import { httpClient, toAppError } from './http-client';

const USERS_PATH = '/api/admin/users';
const CSRF_HEADERS = { 'X-Requested-With': 'XMLHttpRequest' };

type ApiUser = Omit<ManagedUser, 'phone' | 'email'> & {
  phone: string | null;
  email: string | null;
};

type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

type ApiRecoveryRequest = Omit<PasswordRecoveryRequest, 'user'> & {
  user: PasswordRecoveryRequest['user'] & { passwordHash?: string };
};

async function request<T>(operation: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await operation());
  } catch (error) {
    return err(toAppError(error));
  }
}

function toManagedUser(user: ApiUser): ManagedUser {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    phone: user.phone ?? undefined,
    email: user.email ?? undefined,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function toRecoveryRequest(request: ApiRecoveryRequest): PasswordRecoveryRequest {
  return {
    id: request.id,
    userId: request.userId,
    status: 'PENDING',
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    user: {
      id: request.user.id,
      name: request.user.name,
      username: request.user.username,
      role: request.user.role,
      active: request.user.active,
    },
  };
}

/** Preserve the existing complete-list/search UI while respecting the paginated API. */
async function loadAllPages<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  let total = 0;

  do {
    const response = await httpClient<Page<T>>(`${path}?page=${page}&pageSize=${LIST_PAGE_SIZE}`);
    items.push(...response.items);
    total = response.total;
    if (response.items.length === 0) break;
    page += 1;
  } while (items.length < total);

  return items;
}

export function listUsersWithHttp(page = 1): Promise<Result<ListPage<ManagedUser>>> {
  return request(async () => {
    const response = await httpClient<Page<ApiUser>>(
      `${USERS_PATH}?page=${page}&pageSize=${LIST_PAGE_SIZE}`,
    );
    return {
      items: response.items.map(toManagedUser),
      total: response.total,
      page: response.page,
      pageSize: response.pageSize,
    };
  });
}

function toAdministrativeProfile(input: SaveUserInput) {
  return {
    name: input.name,
    username: input.username,
    role: input.role,
    phone: input.phone,
    email: input.email,
  };
}

export function saveUserWithHttp(input: SaveUserInput): Promise<Result<SaveUserResult>> {
  const profile = toAdministrativeProfile(input);
  // POST schema is strict and always creates an active account; `active` is PATCH-only.
  const body = input.id ? { ...profile, active: input.active } : profile;
  return request(async () => {
    const response = await httpClient<ApiUser & { initialPassword?: string }>(
      input.id ? `${USERS_PATH}/${input.id}` : USERS_PATH,
      {
        method: input.id ? 'PATCH' : 'POST',
        headers: CSRF_HEADERS,
        body: JSON.stringify(body),
      },
    );
    const user = toManagedUser(response);
    if (!input.id && typeof response.initialPassword === 'string') {
      return { ...user, initialPassword: response.initialPassword };
    }
    return user;
  });
}

export function listRecoveryRequestsWithHttp(): Promise<Result<PasswordRecoveryRequest[]>> {
  return request(async () =>
    (await loadAllPages<ApiRecoveryRequest>(`${USERS_PATH}/recovery-requests`)).map(
      toRecoveryRequest,
    ),
  );
}

export function resolveRecoveryWithHttp(
  input: ResolveRecoveryInput,
): Promise<Result<ResolveRecoveryResult>> {
  return request(async () => {
    const response = await httpClient<{ temporaryPassword?: string }>(
      `${USERS_PATH}/recovery-requests/${input.requestId}/resolve`,
      {
        method: 'POST',
        headers: CSRF_HEADERS,
        body: JSON.stringify(
          input.action === 'approve'
            ? { action: 'approve', identityVerified: input.identityVerified }
            : { action: 'reject' },
        ),
      },
    );
    return response.temporaryPassword ? { temporaryPassword: response.temporaryPassword } : {};
  });
}
