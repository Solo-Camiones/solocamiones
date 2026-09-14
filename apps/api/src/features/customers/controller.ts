import type { Request, Response } from 'express';

import { AppError } from '../../infrastructure/errors/app-error.js';
import { customerService } from './service.js';

function actor(req: Request): string {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth.userId;
}

function id(req: Request): string {
  return (req.validated?.params as { id: string }).id;
}

export async function postCustomer(req: Request, res: Response) {
  res.status(201).json(await customerService.create(actor(req), req.validated?.body));
}

export async function getCustomers(req: Request, res: Response) {
  res.json(await customerService.search(actor(req), req.validated?.query));
}

export async function getCustomer(req: Request, res: Response) {
  res.json(await customerService.getById(actor(req), id(req)));
}

export async function patchCustomer(req: Request, res: Response) {
  res.json(await customerService.update(actor(req), id(req), req.validated?.body));
}
