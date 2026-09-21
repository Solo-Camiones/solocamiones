import type { Request, Response } from 'express';

import { AppError } from '../../infrastructure/errors/app-error.js';
import { SalesService } from './service.js';
import { SellerSalesReportService } from './seller-sales-report-service.js';
import type { SellerSalesReportFilters, SellerSalesReportQuery } from './types.js';

function salesServiceOf(req: Request): SalesService {
  const service = req.app.locals.salesService as SalesService | undefined;
  if (!service) throw new Error('salesService is not configured on the app');
  return service;
}

function sellerSalesReportServiceOf(req: Request): SellerSalesReportService {
  const service = req.app.locals.sellerSalesReportService as SellerSalesReportService | undefined;
  if (!service) throw new Error('sellerSalesReportService is not configured on the app');
  return service;
}

function actor(req: Request): string {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth.userId;
}

function id(req: Request): string {
  return (req.validated?.params as { id: string }).id;
}

function lineId(req: Request): string {
  return (req.validated?.params as { id: string; lineId: string }).lineId;
}

export async function postDraft(req: Request, res: Response) {
  res
    .status(201)
    .json(await salesServiceOf(req).createDraft(actor(req), req.validated?.body ?? {}));
}

export async function postQuote(req: Request, res: Response) {
  res
    .status(201)
    .json(await salesServiceOf(req).createQuote(actor(req), req.validated?.body ?? {}));
}

export async function postIssueQuote(req: Request, res: Response) {
  res.json(await salesServiceOf(req).issueQuote(actor(req), id(req)));
}

export async function postDuplicateQuote(req: Request, res: Response) {
  res.status(201).json(await salesServiceOf(req).duplicateQuote(actor(req), id(req)));
}

export async function postConvertQuote(req: Request, res: Response) {
  res.json(await salesServiceOf(req).convertQuote(actor(req), id(req), req.validated?.body ?? {}));
}

export async function postIssueConduce(req: Request, res: Response) {
  res.json(await salesServiceOf(req).issueConduce(actor(req), id(req), req.validated?.body ?? {}));
}

export async function postConvertQuoteToConduce(req: Request, res: Response) {
  res.json(
    await salesServiceOf(req).convertQuoteToConduce(actor(req), id(req), req.validated?.body ?? {}),
  );
}

export async function postConvertConduceToInvoice(req: Request, res: Response) {
  res.json(
    await salesServiceOf(req).convertConduceToInvoice(
      actor(req),
      id(req),
      req.validated?.body ?? {},
    ),
  );
}

export async function getInvoices(req: Request, res: Response) {
  res.json(await salesServiceOf(req).list(actor(req), req.validated?.query));
}

export async function getReceivables(req: Request, res: Response) {
  res.json(await salesServiceOf(req).listReceivables(actor(req), req.validated?.query));
}

export async function listSellerSalesReport(req: Request, res: Response) {
  if (!req.auth) throw AppError.unauthorized();
  const query = req.validated?.query as SellerSalesReportQuery;
  res.json(await sellerSalesReportServiceOf(req).query(req.auth.userId, query));
}

export async function getSellerSalesReport(req: Request, res: Response) {
  if (!req.auth) throw AppError.unauthorized();
  const query = req.validated?.query as SellerSalesReportFilters;
  const file = await sellerSalesReportServiceOf(req).download(req.auth.userId, query);
  res.status(200);
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.body);
}

export async function getInvoice(req: Request, res: Response) {
  res.json(await salesServiceOf(req).getById(actor(req), id(req)));
}

export async function patchDraft(req: Request, res: Response) {
  res.json(await salesServiceOf(req).updateMeta(actor(req), id(req), req.validated?.body));
}

export async function deleteDraft(req: Request, res: Response) {
  await salesServiceOf(req).discard(actor(req), id(req));
  res.status(204).send();
}

export async function postConfirmInvoice(req: Request, res: Response) {
  res.json(await salesServiceOf(req).confirm(actor(req), id(req), req.validated?.body ?? {}));
}

export async function getInvoicePdf(req: Request, res: Response) {
  const file = await salesServiceOf(req).getPdf(actor(req), id(req));
  res.status(200);
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.body);
}

export async function postRegenerateInvoicePdf(req: Request, res: Response) {
  res.json(await salesServiceOf(req).regeneratePdf(actor(req), id(req)));
}

export async function postInvoicePayment(req: Request, res: Response) {
  res
    .status(201)
    .json(await salesServiceOf(req).addPayment(actor(req), id(req), req.validated?.body));
}

export async function postCancelInvoice(req: Request, res: Response) {
  res.json(await salesServiceOf(req).cancel(actor(req), id(req), req.validated?.body));
}

export async function postDraftLine(req: Request, res: Response) {
  res.status(201).json(await salesServiceOf(req).addLine(actor(req), id(req), req.validated?.body));
}

export async function patchDraftLine(req: Request, res: Response) {
  res.json(
    await salesServiceOf(req).setLinePrice(actor(req), id(req), lineId(req), req.validated?.body),
  );
}

export async function deleteDraftLine(req: Request, res: Response) {
  res.json(await salesServiceOf(req).removeLine(actor(req), id(req), lineId(req)));
}
