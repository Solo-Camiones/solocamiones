/**
 * Bearer token required to scrape GET /metrics.
 * When unset/empty, the metrics endpoint responds 404 (disabled).
 */
export function parseMetricsBearerToken(
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const raw = environment.METRICS_BEARER_TOKEN;
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
