import type { Request, Response } from 'express';

import { AppError } from '../../infrastructure/errors/app-error.js';
import { catalogService } from './service.js';

function actor(req: Request): string {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth.userId;
}

function id(req: Request): string {
  return (req.validated?.params as { id: string }).id;
}

export async function postCatalogService(req: Request, res: Response) {
  res.status(201).json(await catalogService.create(actor(req), req.validated?.body));
}

export async function getCatalogServices(req: Request, res: Response) {
  res.json(await catalogService.list(actor(req)));
}

export async function getCatalogService(req: Request, res: Response) {
  res.json(await catalogService.getById(actor(req), id(req)));
}

export async function patchCatalogService(req: Request, res: Response) {
  res.json(await catalogService.update(actor(req), id(req), req.validated?.body));
}
