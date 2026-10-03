import * as jose from 'jose';
import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../errors/app-error.js';
import type { CloudflareAccessConfig } from '../config/runtime-config.js';

export const CF_ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';

export type CloudflareAccessJwtVerifyInput = {
  teamDomain: string;
  audience: string;
};

export type CloudflareAccessJwtVerifier = (
  token: string,
  options: CloudflareAccessJwtVerifyInput,
) => Promise<unknown>;

/**
 * Cryptographically verifies Cloudflare Access JWTs (signature, iss, exp, aud).
 * JWKS is fetched from the team domain; callers should inject a fake in tests.
 */
export async function verifyCloudflareAccessJwt(
  token: string,
  options: CloudflareAccessJwtVerifyInput,
): Promise<jose.JWTPayload> {
  const jwksUrl = new URL(`https://${options.teamDomain}/cdn-cgi/access/certs`);
  const jwks = jose.createRemoteJWKSet(jwksUrl);
  const { payload } = await jose.jwtVerify(token, jwks, {
    issuer: `https://${options.teamDomain}`,
    audience: options.audience,
  });
  return payload;
}

export type CloudflareAccessMiddlewareOptions = {
  /** When null/undefined, Access checks are skipped (local/test). */
  config: CloudflareAccessConfig | null | undefined;
  verifyJwt?: CloudflareAccessJwtVerifier;
};

/**
 * Internal Prometheus scrape path. Bearer auth is enforced by the metrics controller.
 * Must never be published on the public Nginx edge (Compose keeps /metrics off edge).
 */
export function isMetricsScrapePath(req: Pick<Request, 'method' | 'path'>): boolean {
  return req.method === 'GET' && req.path === '/metrics';
}

/**
 * Perimeter gate only. Does not establish Solo Camiones sessions or roles.
 * Applies to mounted routes when enabled, including health probes.
 * Exempts GET /metrics so in-network scrapers can authenticate with METRICS_BEARER_TOKEN only.
 */
export function createCloudflareAccessMiddleware(
  options: CloudflareAccessMiddlewareOptions,
) {
  const accessConfig = options.config;
  if (accessConfig == null) {
    return function skipCloudflareAccess(
      _req: Request,
      _res: Response,
      next: NextFunction,
    ): void {
      next();
    };
  }

  const verifyJwt = options.verifyJwt ?? verifyCloudflareAccessJwt;

  return async function enforceCloudflareAccess(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    // M4.1: scrape stays on the Docker/Tailscale network; public edge does not proxy /metrics.
    if (isMetricsScrapePath(req)) {
      next();
      return;
    }

    const headerValue = req.headers[CF_ACCESS_JWT_HEADER];
    const token =
      typeof headerValue === 'string' && headerValue.trim().length > 0
        ? headerValue.trim()
        : undefined;

    if (token == null) {
      next(AppError.unauthorized());
      return;
    }

    try {
      await verifyJwt(token, {
        teamDomain: accessConfig.teamDomain,
        audience: accessConfig.audience,
      });
      next();
    } catch {
      // Generic 401: do not leak JWT validation details to clients.
      next(AppError.unauthorized());
    }
  };
}
