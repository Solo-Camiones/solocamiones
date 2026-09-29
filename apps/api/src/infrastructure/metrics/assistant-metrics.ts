import { Counter, Histogram } from '@prometheus-io/client';

import { metricsRegistry } from './registry.js';

const runsTotal = new Counter({
  name: 'assistant_runs_total',
  help: 'Assistant runs finished by terminal status',
  labelNames: ['status'] as const,
  registers: [metricsRegistry],
});

const errorsTotal = new Counter({
  name: 'assistant_errors_total',
  help: 'Assistant run errors by safe error code',
  labelNames: ['code'] as const,
  registers: [metricsRegistry],
});

const quotaRejectionsTotal = new Counter({
  name: 'assistant_quota_rejections_total',
  help: 'Assistant quota rejections before provider calls',
  labelNames: ['scope'] as const,
  registers: [metricsRegistry],
});

const toolCallsTotal = new Counter({
  name: 'assistant_tool_calls_total',
  help: 'Allowlisted assistant tool executions',
  labelNames: ['tool'] as const,
  registers: [metricsRegistry],
});

const tokensTotal = new Counter({
  name: 'assistant_tokens_total',
  help: 'Assistant token usage reported by the provider',
  labelNames: ['direction'] as const,
  registers: [metricsRegistry],
});

const syncFailuresTotal = new Counter({
  name: 'assistant_knowledge_sync_failures_total',
  help: 'Knowledge sync step failures',
  registers: [metricsRegistry],
});

const latencySeconds = new Histogram({
  name: 'assistant_latency_seconds',
  help: 'End-to-end assistant run latency in seconds',
  buckets: [0.5, 1, 2, 5, 8, 15, 30, 45, 60],
  registers: [metricsRegistry],
});

const ttftSeconds = new Histogram({
  name: 'assistant_ttft_seconds',
  help: 'Time to first streamed assistant token in seconds',
  buckets: [0.25, 0.5, 1, 2, 4, 8, 15, 30],
  registers: [metricsRegistry],
});

export type AssistantRunMetricStatus = 'COMPLETED' | 'FAILED' | 'CANCELLED';

export function recordAssistantQuotaRejection(scope: 'user' | 'global'): void {
  quotaRejectionsTotal.inc({ scope });
}

export function recordAssistantToolCall(tool: string): void {
  toolCallsTotal.inc({ tool });
}

export function recordAssistantKnowledgeSyncFailure(): void {
  syncFailuresTotal.inc();
}

export function recordAssistantRunMetrics(input: {
  status: AssistantRunMetricStatus;
  latencyMs: number;
  ttftMs: number | null;
  inputTokens: number;
  outputTokens: number;
  errorCode?: string | null;
}): void {
  runsTotal.inc({ status: input.status });
  latencySeconds.observe(input.latencyMs / 1000);
  if (input.ttftMs != null && input.ttftMs >= 0) {
    ttftSeconds.observe(input.ttftMs / 1000);
  }
  if (input.inputTokens > 0) {
    tokensTotal.inc({ direction: 'input' }, input.inputTokens);
  }
  if (input.outputTokens > 0) {
    tokensTotal.inc({ direction: 'output' }, input.outputTokens);
  }
  if (input.errorCode) {
    errorsTotal.inc({ code: input.errorCode });
  }
}

/** Test helper: zeroes series without unregistering. */
export function resetAssistantMetricsForTests(): void {
  metricsRegistry.resetMetrics();
}
