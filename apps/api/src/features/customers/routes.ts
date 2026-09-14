import { Router } from 'express';

import { validate } from '../../infrastructure/http/validate.js';
import { requireAuth } from '../access/require-auth.js';
import { requireCsrfHeader } from '../access/require-csrf.js';
import { requireRole } from '../access/require-role.js';
import { getCustomer, getCustomers, patchCustomer, postCustomer } from './controller.js';
import {
  createCustomerSchema,
  customerIdSchema,
  searchCustomersSchema,
  updateCustomerSchema,
} from './validation.js';

export const customersRouter = Router();
customersRouter.use(requireAuth, requireRole('ADMINISTRATOR', 'SELLER'));
customersRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
customersRouter.get('/', validate({ query: searchCustomersSchema }), getCustomers);
customersRouter.get('/:id', validate({ params: customerIdSchema }), getCustomer);
customersRouter.post(
  '/',
  requireCsrfHeader,
  validate({ body: createCustomerSchema }),
  postCustomer,
);
customersRouter.patch(
  '/:id',
  requireCsrfHeader,
  validate({ params: customerIdSchema, body: updateCustomerSchema }),
  patchCustomer,
);
