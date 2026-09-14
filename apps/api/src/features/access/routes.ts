import { Router } from 'express';
import { postRecovery } from '../users/controller.js';
import { recoveryRequestSchema } from '../users/validation.js';
import { recoveryRateLimiter } from './recovery-rate-limit.js';

import { validate } from '../../infrastructure/http/validate.js';
import { accessReadRateLimiter } from './access-read-rate-limit.js';
import { ADMIN_AUTHORIZATION_PROBE_PATH } from './constants.js';
import { getAdminProbe, getMe, getSession, patchMe, postLogin, postLogout } from './controller.js';
import { loginRateLimiter } from './login-rate-limit.js';
import { profileMutationRateLimiter } from './profile-mutation-rate-limit.js';
import { requireAuth, requireProfileAuth } from './require-auth.js';
import { requireCsrfHeader } from './require-csrf.js';
import { requireAdministrator } from './require-role.js';
import { loginBodySchema, updateOwnProfileBodySchema } from './validation.js';

export const accessRouter = Router();
accessRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
accessRouter.post(
  '/recovery-requests',
  recoveryRateLimiter,
  validate({ body: recoveryRequestSchema }),
  postRecovery,
);

accessRouter.post('/login', loginRateLimiter, validate({ body: loginBodySchema }), postLogin);
accessRouter.post('/logout', requireCsrfHeader, postLogout);
accessRouter.get('/session', accessReadRateLimiter, requireProfileAuth, getSession);
accessRouter.get(
  ADMIN_AUTHORIZATION_PROBE_PATH,
  accessReadRateLimiter,
  requireAuth,
  requireAdministrator,
  getAdminProbe,
);
accessRouter.get('/me', accessReadRateLimiter, requireProfileAuth, getMe);
accessRouter.patch(
  '/me',
  profileMutationRateLimiter,
  requireCsrfHeader,
  requireProfileAuth,
  validate({ body: updateOwnProfileBodySchema }),
  patchMe,
);
