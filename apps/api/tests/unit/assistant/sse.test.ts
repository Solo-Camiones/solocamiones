import { describe, expect, it, vi } from 'vitest';

import type { AssistantDomainEvent } from '../../../src/features/assistant/domain-events.js';
import {
  formatSseEvent,
  openAssistantSse,
  startSseHeartbeat,
} from '../../../src/features/assistant/sse.js';

function createMockResponse() {
  const chunks: string[] = [];
  let ended = false;
  const res = {
    statusCode: 200,
    writableEnded: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write(chunk: string) {
      if (ended) return false;
      chunks.push(chunk);
      return true;
    },
    end() {
      ended = true;
      this.writableEnded = true;
    },
  };
  return { res, chunks, get ended() { return ended; } };
}

describe('assistant SSE serializer', () => {
  it('formats domain events as SSE frames', () => {
    const metadata: AssistantDomainEvent = {
      type: 'metadata',
      conversationId: 'c1',
      userMessageId: 'm1',
      runId: 'r1',
    };
    expect(formatSseEvent('metadata', {
      conversationId: 'c1',
      userMessageId: 'm1',
      runId: 'r1',
    })).toBe(
      'event: metadata\ndata: {"conversationId":"c1","userMessageId":"m1","runId":"r1"}\n\n',
    );

    const mock = createMockResponse();
    const writer = openAssistantSse(mock.res as never);
    expect(writer.writeDomainEvent(metadata)).toBe(true);
    expect(mock.chunks.join('')).toContain('event: metadata');
    expect(mock.res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/event-stream; charset=utf-8',
    );
    expect(mock.res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('writes heartbeat comments and stops writing after end', () => {
    const mock = createMockResponse();
    const writer = openAssistantSse(mock.res as never);
    expect(writer.writeHeartbeat()).toBe(true);
    expect(mock.chunks.at(-1)).toBe(': heartbeat\n\n');
    writer.end();
    expect(writer.writeDomainEvent({ type: 'delta', text: 'x' })).toBe(false);
    expect(writer.writeHeartbeat()).toBe(false);
  });

  it('starts and clears heartbeat interval', () => {
    vi.useFakeTimers();
    const mock = createMockResponse();
    const writer = openAssistantSse(mock.res as never);
    const stop = startSseHeartbeat(writer, 15_000);
    vi.advanceTimersByTime(15_000);
    expect(mock.chunks.some((chunk) => chunk === ': heartbeat\n\n')).toBe(true);
    stop();
    const count = mock.chunks.length;
    vi.advanceTimersByTime(30_000);
    expect(mock.chunks.length).toBe(count);
    vi.useRealTimers();
  });
});
