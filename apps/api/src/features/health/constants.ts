/** Generous enough for Prometheus scrapes (~15s) and a small HA pair; still caps bearer guessing. */
export const METRICS_RATE_LIMIT_MAX_REQUESTS = 60;
export const METRICS_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
