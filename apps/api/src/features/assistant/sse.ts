import type { Response } from 'express';

import type { AssistantDomainEvent } from './domain-events.js';
import { ASSISTANT_SSE_HEARTBEAT_INTERVAL_MS } from './constants.js';

export type SseWriter = {
  writeDomainEvent: (event: AssistantDomainEvent) => boolean;
  writeHeartbeat: () => boolean;
  end: () => void;
  get writableEnded(): boolean;
};

/**
 * Central SSE serializer for assistant streams.
 * Never writes after the response has ended (client disconnect or prior end).
 */
export function openAssistantSse(res: Response): SseWriter {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const writeRaw = (chunk: string): boolean => {
    if (res.writableEnded) return false;
    res.write(chunk);
    return true;
  };

  return {
    writeDomainEvent(event: AssistantDomainEvent): boolean {
      return writeRaw(formatSseEvent(event.type, eventPayload(event)));
    },
    writeHeartbeat(): boolean {
      // SSE comment — invisible to EventSource `event` handlers (decision 4A).
      return writeRaw(`: heartbeat\n\n`);
    },
    end(): void {
      if (!res.writableEnded) {
        res.end();
      }
    },
    get writableEnded(): boolean {
      return res.writableEnded;
    },
  };
}

export function startSseHeartbeat(
  writer: SseWriter,
  intervalMs: number = ASSISTANT_SSE_HEARTBEAT_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    if (!writer.writeHeartbeat()) {
      clearInterval(timer);
    }
  }, intervalMs);
  // Do not keep the process alive solely for heartbeats in tests.
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  return () => clearInterval(timer);
}

export function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function eventPayload(event: AssistantDomainEvent): unknown {
  switch (event.type) {
    case 'metadata':
      return {
        conversationId: event.conversationId,
        userMessageId: event.userMessageId,
        runId: event.runId,
      };
    case 'delta':
      return { text: event.text };
    case 'sources':
      return { sources: event.sources };
    case 'done':
      return {
        assistantMessageId: event.assistantMessageId,
        usage: event.usage,
      };
    case 'error':
      return {
        code: event.code,
        message: event.message,
        retryable: event.retryable,
        errorId: event.errorId,
      };
  }
}
