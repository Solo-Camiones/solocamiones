import { Router } from 'express';

import { validate } from '../../infrastructure/http/validate.js';
import { requireAuth } from '../access/require-auth.js';
import { requireCsrfHeader } from '../access/require-csrf.js';
import { requireAdministrator, requireRole } from '../access/require-role.js';
import {
  deleteDraft,
  deleteDraftLine,
  getInvoice,
  getInvoicePdf,
  getInvoices,
  getReceivables,
  patchDraft,
  patchDraftLine,
  postConfirmInvoice,
  postDraft,
  postDraftLine,
  postRegenerateInvoicePdf,
  postInvoicePayment,
  postCancelInvoice,
} from './controller.js';
import {
  addInvoiceLineSchema,
  confirmInvoiceSchema,
  createDraftSchema,
  invoiceIdSchema,
  invoiceLineIdSchema,
  listInvoicesSchema,
  listReceivablesSchema,
  setLinePriceSchema,
  updateDraftMetaSchema,
  addPaymentSchema,
  cancelInvoiceSchema,
} from './validation.js';

export const salesRouter = Router();
salesRouter.use(requireAuth, requireRole('ADMINISTRATOR', 'SELLER'));
salesRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
salesRouter.get('/', validate({ query: listInvoicesSchema }), getInvoices);
salesRouter.get('/receivables', validate({ query: listReceivablesSchema }), getReceivables);
salesRouter.get('/:id/pdf', validate({ params: invoiceIdSchema }), getInvoicePdf);
salesRouter.post(
  '/:id/pdf/regenerate',
  requireCsrfHeader,
  requireAdministrator,
  validate({ params: invoiceIdSchema }),
  postRegenerateInvoicePdf,
);
salesRouter.get('/:id', validate({ params: invoiceIdSchema }), getInvoice);
salesRouter.post('/', requireCsrfHeader, validate({ body: createDraftSchema }), postDraft);
salesRouter.patch(
  '/:id',
  requireCsrfHeader,
  validate({ params: invoiceIdSchema, body: updateDraftMetaSchema }),
  patchDraft,
);
salesRouter.delete('/:id', requireCsrfHeader, validate({ params: invoiceIdSchema }), deleteDraft);
salesRouter.post(
  '/:id/confirm',
  requireCsrfHeader,
  validate({ params: invoiceIdSchema, body: confirmInvoiceSchema }),
  postConfirmInvoice,
);
salesRouter.post(
  '/:id/payments',
  requireCsrfHeader,
  validate({ params: invoiceIdSchema, body: addPaymentSchema }),
  postInvoicePayment,
);
salesRouter.post(
  '/:id/cancel',
  requireCsrfHeader,
  requireAdministrator,
  validate({ params: invoiceIdSchema, body: cancelInvoiceSchema }),
  postCancelInvoice,
);
salesRouter.post(
  '/:id/lines',
  requireCsrfHeader,
  validate({ params: invoiceIdSchema, body: addInvoiceLineSchema }),
  postDraftLine,
);
salesRouter.patch(
  '/:id/lines/:lineId',
  requireCsrfHeader,
  validate({ params: invoiceLineIdSchema, body: setLinePriceSchema }),
  patchDraftLine,
);
salesRouter.delete(
  '/:id/lines/:lineId',
  requireCsrfHeader,
  validate({ params: invoiceLineIdSchema }),
  deleteDraftLine,
);
