import { Router } from 'express';

import { validate } from '../../infrastructure/http/validate.js';
import { requireAuth } from '../access/require-auth.js';
import { requireCsrfHeader } from '../access/require-csrf.js';
import { requireAdministrator } from '../access/require-role.js';
import { postManualGrossProfit, postRetryUsd } from './controller.js';
import { profitabilityInvoiceIdSchema, recordManualGrossProfitSchema } from './validation.js';

export const profitabilityRouter = Router();
profitabilityRouter.use(requireAuth, requireAdministrator);
profitabilityRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
profitabilityRouter.post(
  '/:invoiceId/manual-gross-profit',
  requireCsrfHeader,
  validate({ params: profitabilityInvoiceIdSchema, body: recordManualGrossProfitSchema }),
  postManualGrossProfit,
);
profitabilityRouter.post(
  '/:invoiceId/retry',
  requireCsrfHeader,
  validate({ params: profitabilityInvoiceIdSchema }),
  postRetryUsd,
);
