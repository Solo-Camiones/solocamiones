import type { NextFunction, Request, Response } from 'express';

import { logger } from '../logging/logger.js';

const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number((process.hrtime.bigint() - startedAt) / NANOSECONDS_PER_MILLISECOND);

    logger.info(
      {
        requestId: req.requestId,
        method: req.method,
        path: req.requestPath,
        statusCode: res.statusCode,
        durationMs,
        release: process.env.APP_RELEASE,
      },
      'request completed',
    );
  });

  next();
}
