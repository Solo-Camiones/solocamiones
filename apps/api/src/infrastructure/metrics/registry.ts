import {
  Registry,
  collectDefaultMetrics,
  type RegistryContentType,
} from '@prometheus-io/client';

/** Prometheus text exposition (0.0.4) — standard scrape format. */
export const PROMETHEUS_CONTENT_TYPE =
  'text/plain; version=0.0.4; charset=utf-8' as const satisfies RegistryContentType;

/**
 * Process-wide registry for Solo Camiones metrics.
 * Assistant custom series register here; default Node metrics are optional.
 */
export const metricsRegistry = new Registry(PROMETHEUS_CONTENT_TYPE);

let defaultMetricsStarted = false;

/** Idempotent: enables process/runtime collectors once per process. */
export function ensureDefaultMetrics(): void {
  if (defaultMetricsStarted) return;
  collectDefaultMetrics({ register: metricsRegistry });
  defaultMetricsStarted = true;
}

export async function renderMetrics(): Promise<string> {
  ensureDefaultMetrics();
  return metricsRegistry.metrics();
}
