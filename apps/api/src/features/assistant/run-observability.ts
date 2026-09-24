import { logger } from '../../infrastructure/logging/logger.js';
import {
  recordAssistantRunMetrics,
  type AssistantRunMetricStatus,
} from '../../infrastructure/metrics/index.js';

/**
 * Safe operational fields for an assistant run.
 * Never include prompts, completions, retrieval chunks, or tool payloads.
 */
export type AssistantRunObservation = {
  requestId?: string;
  runId: string;
  conversationId: string;
  userId: string;
  model: string;
  promptVersion: string;
  status: AssistantRunMetricStatus;
  latencyMs: number;
  ttftMs: number | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCallCount: number;
  toolNames: string[];
  errorCode?: string | null;
  errorId?: string | null;
};

const FORBIDDEN_OBSERVATION_KEYS = [
  'content',
  'prompt',
  'completion',
  'chunk',
  'chunks',
  'payload',
  'argumentsJson',
  'messages',
] as const;

export function assertSafeRunObservation(
  observation: Record<string, unknown>,
): void {
  for (const key of FORBIDDEN_OBSERVATION_KEYS) {
    if (key in observation) {
      throw new Error(`Assistant run observation must not include "${key}"`);
    }
  }
}

/** Structured log + Prometheus counters/histograms for a finished run. */
export function recordAssistantRunObservation(observation: AssistantRunObservation): void {
  const payload: Record<string, unknown> = {
    requestId: observation.requestId,
    runId: observation.runId,
    conversationId: observation.conversationId,
    userId: observation.userId,
    model: observation.model,
    promptVersion: observation.promptVersion,
    status: observation.status,
    latencyMs: observation.latencyMs,
    ttftMs: observation.ttftMs,
    inputTokens: observation.inputTokens,
    outputTokens: observation.outputTokens,
    totalTokens: observation.totalTokens,
    toolCallCount: observation.toolCallCount,
    toolNames: observation.toolNames,
    errorCode: observation.errorCode ?? undefined,
    errorId: observation.errorId ?? undefined,
  };
  assertSafeRunObservation(payload);

  logger.info(payload, 'assistant run finished');
  recordAssistantRunMetrics({
    status: observation.status,
    latencyMs: observation.latencyMs,
    ttftMs: observation.ttftMs,
    inputTokens: observation.inputTokens,
    outputTokens: observation.outputTokens,
    errorCode: observation.errorCode,
  });
}
