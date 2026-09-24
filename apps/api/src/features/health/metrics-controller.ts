import type { NextFunction, Request, Response } from 'express';

import {
  PROMETHEUS_CONTENT_TYPE,
  parseMetricsBearerToken,
  renderMetrics,
} from '../../infrastructure/metrics/index.js';

/**
 * Prometheus scrape endpoint. Disabled (404) when METRICS_BEARER_TOKEN is unset.
 * Never mount this behind a public edge without the bearer secret.
 */
export async function getMetrics(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const expected = parseMetricsBearerToken();
    if (expected == null) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
      return;
    }

    const header = req.headers.authorization;
    const provided =
      typeof header === 'string' && header.toLowerCase().startsWith('bearer ')
        ? header.slice('bearer '.length).trim()
        : undefined;

    if (provided == null || provided !== expected) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      return;
    }

    const body = await renderMetrics();
    res.status(200).type(PROMETHEUS_CONTENT_TYPE).send(body);
  } catch (error) {
    next(error);
  }
}
