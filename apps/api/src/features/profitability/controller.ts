import type { Request, Response } from 'express';

import { AppError } from '../../infrastructure/errors/app-error.js';
import { ProfitabilityService } from './service.js';

function profitabilityServiceOf(req: Request): ProfitabilityService {
  const service = req.app.locals.profitabilityService as ProfitabilityService | undefined;
  if (!service) throw new Error('profitabilityService is not configured on the app');
  return service;
}

function actor(req: Request): string {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth.userId;
}

function invoiceId(req: Request): string {
  return (req.validated?.params as { invoiceId: string }).invoiceId;
}

export async function postManualGrossProfit(req: Request, res: Response) {
  res.json(
    await profitabilityServiceOf(req).recordManualGrossProfit(actor(req), invoiceId(req), req.validated?.body),
  );
}

export async function postRetryUsd(req: Request, res: Response) {
  res.json(await profitabilityServiceOf(req).retryUsdProfitability(actor(req), invoiceId(req)));
}
