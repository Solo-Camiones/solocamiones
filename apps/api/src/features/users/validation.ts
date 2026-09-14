import { Role } from '@prisma/client';
import { z } from 'zod';

import { passwordSchema } from '../access/password-policy.js';

export const usernameSchema = z.string().trim().toLowerCase().min(1, 'Username is required');
export const nameSchema = z.string().trim().min(1, 'Name is required');
export const roleSchema = z.enum(Role);

// Preserve omitted values; represent explicitly blank optional contact fields as null.
function normalizeContact(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.trim() || null;
}

export const phoneSchema = z.preprocess(normalizeContact, z.string().nullable().optional());
export const emailSchema = z.preprocess(normalizeContact, z.email().nullable().optional());

// Shared creation input for future services; database fields are never client input.
export const createUserSchema = z.strictObject({
  name: nameSchema,
  username: usernameSchema,
  phone: phoneSchema,
  email: emailSchema,
  role: roleSchema,
  password: passwordSchema,
});

// Bootstrap/internal creation retains its password input; HTTP administration never accepts it.
export const createAdministrativeUserSchema = createUserSchema.omit({ password: true });
export const updateAdministrativeUserSchema = createAdministrativeUserSchema
  .partial()
  .extend({
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const userIdSchema = z.strictObject({ id: z.uuid() });
export const paginationSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
export const recoveryRequestSchema = z.strictObject({ username: usernameSchema });
export const recoveryResolutionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('approve'), identityVerified: z.literal(true) }),
  z.strictObject({ action: z.literal('reject') }),
]);
