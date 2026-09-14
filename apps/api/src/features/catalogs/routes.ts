import { Router } from 'express';

import { validate } from '../../infrastructure/http/validate.js';
import { requireAuth } from '../access/require-auth.js';
import { requireCsrfHeader } from '../access/require-csrf.js';
import { requireAdministrator, requireRole } from '../access/require-role.js';
import {
  getCatalogService,
  getCatalogServices,
  patchCatalogService,
  postCatalogService,
} from './controller.js';
import {
  catalogServiceIdSchema,
  createCatalogServiceSchema,
  updateCatalogServiceSchema,
} from './validation.js';

export const catalogsRouter = Router();
catalogsRouter.use(requireAuth, requireRole('ADMINISTRATOR', 'SELLER'));
catalogsRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
catalogsRouter.get('/', getCatalogServices);
catalogsRouter.get('/:id', validate({ params: catalogServiceIdSchema }), getCatalogService);
catalogsRouter.post(
  '/',
  requireCsrfHeader,
  requireAdministrator,
  validate({ body: createCatalogServiceSchema }),
  postCatalogService,
);
catalogsRouter.patch(
  '/:id',
  requireCsrfHeader,
  requireAdministrator,
  validate({ params: catalogServiceIdSchema, body: updateCatalogServiceSchema }),
  patchCatalogService,
);
