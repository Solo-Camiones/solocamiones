import type { Role } from './entities';

/** Explicit Administrator-facing projection. Credentials never cross this boundary. */
export type ManagedUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  phone?: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SaveUserInput = {
  id?: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  phone?: string;
  email?: string;
};

/** Create may include the assigned plaintext once; list/update never do. */
export type SaveUserResult = ManagedUser & { initialPassword?: string };

export type PasswordRecoveryRequest = {
  id: string;
  userId: string;
  status: 'PENDING';
  createdAt: string;
  expiresAt: string;
  user: Pick<ManagedUser, 'id' | 'name' | 'username' | 'role' | 'active'>;
};

export type ResolveRecoveryInput =
  | { requestId: string; action: 'approve'; identityVerified: true }
  | { requestId: string; action: 'reject' };

export type ResolveRecoveryResult = {
  temporaryPassword?: string;
};
