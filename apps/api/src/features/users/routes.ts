import { Router } from 'express';

import { validate } from '../../infrastructure/http/validate.js';
import { requireAuth } from '../access/require-auth.js';
import { requireCsrfHeader } from '../access/require-csrf.js';
import { requireAdministrator } from '../access/require-role.js';
import { getRecoveries, getUsers, patchUser, postUser, resolveRecovery } from './controller.js';
import { usersMutationRateLimiter } from './users-mutation-rate-limit.js';
import { usersReadRateLimiter } from './users-read-rate-limit.js';
import {
  createAdministrativeUserSchema,
  paginationSchema,
  recoveryResolutionSchema,
  updateAdministrativeUserSchema,
  userIdSchema,
} from './validation.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireAdministrator);
usersRouter.use(usersReadRateLimiter);
usersRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
usersRouter.get('/', validate({ query: paginationSchema }), getUsers);
usersRouter.post(
  '/',
  usersMutationRateLimiter,
  requireCsrfHeader,
  validate({ body: createAdministrativeUserSchema }),
  postUser,
);
usersRouter.patch(
  '/:id',
  requireCsrfHeader,
  validate({ params: userIdSchema, body: updateAdministrativeUserSchema }),
  patchUser,
);
usersRouter.get('/recovery-requests', validate({ query: paginationSchema }), getRecoveries);
usersRouter.post(
  '/recovery-requests/:id/resolve',
  usersMutationRateLimiter,
  requireCsrfHeader,
  validate({ params: userIdSchema, body: recoveryResolutionSchema }),
  resolveRecovery,
);
