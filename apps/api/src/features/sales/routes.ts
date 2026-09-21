import { Router } from 'express';

import { validate } from '../../infrastructure/http/validate.js';
import { requireAuth } from '../access/require-auth.js';
import { requireCsrfHeader } from '../access/require-csrf.js';
import { requireAdministrator, requireRole } from '../access/require-role.js';
import { getAccountStatement } from '../payments/controller.js';
import {
  deleteDraft,
  deleteDraftLine,
  getInvoice,
  getInvoicePdf,
  getInvoices,
  getReceivables,
  getSellerSalesReport,
  listSellerSalesReport,
  patchDraft,
  patchDraftLine,
  postConfirmInvoice,
  postDraft,
  postQuote,
  postIssueQuote,
  postDuplicateQuote,
  postConvertQuote,
  postIssueConduce,
  postConvertQuoteToConduce,
  postConvertConduceToInvoice,
  postDraftLine,
  postRegenerateInvoicePdf,
  postInvoicePayment,
  postCancelInvoice,
} from './controller.js';
import {
  addInvoiceLineSchema,
  confirmInvoiceSchema,
  convertConduceToInvoiceSchema,
  createDraftSchema,
  invoiceIdSchema,
  invoiceLineIdSchema,
  issueConduceSchema,
  listInvoicesSchema,
  listReceivablesSchema,
  sellerSalesReportQuerySchema,
  sellerSalesReportPdfQuerySchema,
  statementCustomerIdSchema,
  setLinePriceSchema,
  updateDraftMetaSchema,
  addPaymentSchema,
  cancelInvoiceSchema,
  emptyCommandSchema,
} from './validation.js';

export const salesRouter = Router();
salesRouter.use(requireAuth, requireRole('ADMINISTRATOR', 'SELLER'));
salesRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
salesRouter.get('/', validate({ query: listInvoicesSchema }), getInvoices);
salesRouter.get(
  '/receivables',
  requireAdministrator,
  validate({ query: listReceivablesSchema }),
  getReceivables,
);
salesRouter.get(
  '/receivables/:customerId/statement.pdf',
  requireAdministrator,
  validate({ params: statementCustomerIdSchema }),
  getAccountStatement,
);
salesRouter.get(
  '/reports/seller-sales',
  requireAdministrator,
  validate({ query: sellerSalesReportQuerySchema }),
  listSellerSalesReport,
);
salesRouter.get(
  '/reports/seller-sales.pdf',
  requireAdministrator,
  validate({ query: sellerSalesReportPdfQuerySchema }),
  getSellerSalesReport,
);
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
salesRouter.post('/quotes', requireCsrfHeader, validate({ body: createDraftSchema }), postQuote);
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
  '/:id/issue-quote',
  requireCsrfHeader,
  validate({ params: invoiceIdSchema, body: emptyCommandSchema }),
  postIssueQuote,
);
salesRouter.post(
  '/:id/duplicate-quote',
  requireCsrfHeader,
  validate({ params: invoiceIdSchema, body: emptyCommandSchema }),
  postDuplicateQuote,
);
salesRouter.post(
  '/:id/convert-quote',
  requireCsrfHeader,
  validate({ params: invoiceIdSchema, body: confirmInvoiceSchema }),
  postConvertQuote,
);
salesRouter.post(
  '/:id/issue-conduce',
  requireCsrfHeader,
  validate({ params: invoiceIdSchema, body: issueConduceSchema }),
  postIssueConduce,
);
salesRouter.post(
  '/:id/convert-quote-to-conduce',
  requireCsrfHeader,
  validate({ params: invoiceIdSchema, body: issueConduceSchema }),
  postConvertQuoteToConduce,
);
salesRouter.post(
  '/:id/convert-conduce-to-invoice',
  requireCsrfHeader,
  validate({ params: invoiceIdSchema, body: convertConduceToInvoiceSchema }),
  postConvertConduceToInvoice,
);
salesRouter.post(
  '/:id/payments',
  requireCsrfHeader,
  requireAdministrator,
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
