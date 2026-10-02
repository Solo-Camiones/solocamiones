import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../errors/app-error.js';

/**
 * Reject requests whose Host header is not an exact configured value.
 * Empty allow-list disables the check (local/test default).
 */
export function createAllowedHostsMiddleware(allowedHosts: readonly string[]) {
  if (allowedHosts.length === 0) {
    return function skipAllowedHosts(
      _req: Request,
      _res: Response,
      next: NextFunction,
    ): void {
      next();
    };
  }

  const allowed = new Set(allowedHosts);

  return function enforceAllowedHosts(req: Request, _res: Response, next: NextFunction): void {
    const host = req.headers.host;
    if (typeof host !== 'string' || !allowed.has(host)) {
      next(AppError.validation('Invalid host'));
      return;
    }
    next();
  };
}
