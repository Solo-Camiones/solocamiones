import type { Request, Response } from 'express';

import { AppError } from '../../infrastructure/errors/app-error.js';
import { userService } from './service.js';

function actor(req: Request): string {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth.userId;
}

function id(req: Request): string {
  return (req.validated?.params as { id: string }).id;
}

export async function postUser(req: Request, res: Response) {
  // The create response is the only delivery of the assigned initial credential.
  res.setHeader('Cache-Control', 'no-store');
  res.status(201).json(await userService.create(actor(req), req.validated?.body));
}
export async function getUsers(req: Request, res: Response) {
  res.json(await userService.list(actor(req), req.validated?.query));
}
export async function patchUser(req: Request, res: Response) {
  res.json(await userService.update(actor(req), id(req), req.validated?.body));
}
export async function postRecovery(req: Request, res: Response) {
  res.status(202).json(await userService.requestRecovery(req.validated?.body));
}
export async function getRecoveries(req: Request, res: Response) {
  res.json(await userService.listRecoveries(actor(req), req.validated?.query));
}
export async function resolveRecovery(req: Request, res: Response) {
  // The approval response is the only delivery of the temporary credential.
  res.setHeader('Cache-Control', 'no-store');
  res.json(await userService.resolveRecovery(actor(req), id(req), req.validated?.body));
}
