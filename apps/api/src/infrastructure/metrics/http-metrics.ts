import { Counter, Histogram } from '@prometheus-io/client';
import type { NextFunction, Request, Response } from 'express';

import { metricsRegistry } from './registry.js';

const NANOSECONDS_PER_SECOND = 1_000_000_000n;

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'HTTP requests completed by method, route group, and status class',
  labelNames: ['method', 'route_group', 'status_class'] as const,
  registers: [metricsRegistry],
});

const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds by method and route group',
  labelNames: ['method', 'route_group'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [metricsRegistry],
});

const httpRateLimitRejectionsTotal = new Counter({
  name: 'http_rate_limit_rejections_total',
  help: 'HTTP 429 responses attributed to rate limiting',
  labelNames: ['route_group'] as const,
  registers: [metricsRegistry],
});

/**
 * Coarse path buckets keep Prometheus cardinality bounded.
 * Never label with raw URLs, query strings, or resource IDs.
 */
export function classifyHttpRouteGroup(path: string): string {
  if (path === '/metrics') return 'metrics';
  if (path.startsWith('/api/health')) return 'health';
  if (path.startsWith('/api/auth')) return 'auth';
  if (path.startsWith('/api/admin')) return 'admin';
  if (path.startsWith('/api/customers')) return 'customers';
  if (path.startsWith('/api/catalogs')) return 'catalogs';
  if (path.startsWith('/api/sales')) return 'sales';
  if (path.startsWith('/api/profitability')) return 'profitability';
  if (path.startsWith('/api/assistant')) return 'assistant';
  if (path.startsWith('/api/')) return 'api_other';
  return 'other';
}

function statusClass(statusCode: number): string {
  if (statusCode >= 500) return '5xx';
  if (statusCode >= 400) return '4xx';
  if (statusCode >= 300) return '3xx';
  if (statusCode >= 200) return '2xx';
  return '1xx';
}

/** Records request duration, status class, and 429 rate-limit rejections. */
export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  // Capture before routing: Express may change req.path while the request is handled.
  const routeGroup = classifyHttpRouteGroup(req.requestPath || req.path);
  const method = req.method.toUpperCase();

  res.on('finish', () => {
    const durationSeconds =
      Number(process.hrtime.bigint() - startedAt) / Number(NANOSECONDS_PER_SECOND);
    const code = res.statusCode;

    httpRequestsTotal.inc({
      method,
      route_group: routeGroup,
      status_class: statusClass(code),
    });
    httpRequestDurationSeconds.observe({ method, route_group: routeGroup }, durationSeconds);

    if (code === 429) {
      httpRateLimitRejectionsTotal.inc({ route_group: routeGroup });
    }
  });

  next();
}
