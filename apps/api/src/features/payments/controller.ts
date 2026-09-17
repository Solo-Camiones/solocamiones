import type { Request, Response } from 'express';

import { AppError } from '../../infrastructure/errors/app-error.js';
import { AccountStatementService } from './account-statement-service.js';

function serviceOf(req: Request): AccountStatementService {
  const service = req.app.locals.accountStatementService as AccountStatementService | undefined;
  if (!service) throw new Error('accountStatementService is not configured on the app');
  return service;
}

export async function getAccountStatement(req: Request, res: Response) {
  if (!req.auth) throw AppError.unauthorized();
  const { customerId } = req.validated?.params as { customerId: string };
  const file = await serviceOf(req).download(req.auth.userId, customerId);
  res.status(200);
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.body);
}
