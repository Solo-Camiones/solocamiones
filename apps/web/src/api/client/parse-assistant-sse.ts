import type { AssistantSource, AssistantStreamEvent, AssistantUsage } from '../contracts/assistant';

const KNOWN_EVENT_TYPES = new Set([
  'metadata',
  'delta',
  'sources',
  'done',
  'error',
]);

/**
 * Incremental SSE parser for assistant streams.
 * Accepts arbitrary chunk boundaries; ignores comment heartbeats (`: ...`).
 * Unknown event names are skipped so a newer server field does not break the client.
 */
export async function* parseAssistantSse(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<AssistantStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = splitCompleteFrames(buffer);
      buffer = frames.rest;
      for (const frame of frames.complete) {
        const event = parseFrame(frame);
        if (event) yield event;
      }
    }

    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const event = parseFrame(buffer);
      if (event) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

function splitCompleteFrames(buffer: string): { complete: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';
  return { complete: parts.filter((part) => part.length > 0), rest };
}

function parseFrame(frame: string): AssistantStreamEvent | null {
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const rawLine of frame.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.length === 0 || line.startsWith(':')) {
      continue;
    }
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }

  if (!KNOWN_EVENT_TYPES.has(eventName) || dataLines.length === 0) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(dataLines.join('\n'));
  } catch {
    return null;
  }

  return toStreamEvent(eventName, payload);
}

function toStreamEvent(type: string, payload: unknown): AssistantStreamEvent | null {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;

  switch (type) {
    case 'metadata': {
      const conversationId = asString(record.conversationId);
      const userMessageId = asString(record.userMessageId);
      const runId = asString(record.runId);
      if (!conversationId || !userMessageId || !runId) return null;
      return { type: 'metadata', conversationId, userMessageId, runId };
    }
    case 'delta': {
      const text = asString(record.text);
      if (text == null) return null;
      return { type: 'delta', text };
    }
    case 'sources': {
      const sources = asSources(record.sources);
      if (!sources) return null;
      return { type: 'sources', sources };
    }
    case 'done': {
      const assistantMessageId = asString(record.assistantMessageId);
      const usage = asUsage(record.usage);
      if (!assistantMessageId || !usage) return null;
      return { type: 'done', assistantMessageId, usage };
    }
    case 'error': {
      const code = asString(record.code);
      const message = asString(record.message);
      const errorId = asString(record.errorId);
      if (!code || !message || !errorId) return null;
      return {
        type: 'error',
        code,
        message,
        retryable: record.retryable === true,
        errorId,
      };
    }
    default:
      return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asUsage(value: unknown): AssistantUsage | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const inputTokens = asFiniteNumber(record.inputTokens);
  const outputTokens = asFiniteNumber(record.outputTokens);
  const totalTokens = asFiniteNumber(record.totalTokens);
  if (inputTokens == null || outputTokens == null || totalTokens == null) return null;
  return { inputTokens, outputTokens, totalTokens };
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asSources(value: unknown): AssistantSource[] | null {
  if (!Array.isArray(value)) return null;
  const sources: AssistantSource[] = [];
  for (const item of value) {
    const source = asSource(item);
    if (!source) return null;
    sources.push(source);
  }
  return sources;
}

function asSource(value: unknown): AssistantSource | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const type = record.type;
  if (type !== 'DOCUMENT' && type !== 'TOOL') return null;
  const sourceKey = asString(record.sourceKey);
  const title = asString(record.title);
  const sortOrder = asFiniteNumber(record.sortOrder);
  if (!sourceKey || !title || sortOrder == null) return null;
  return {
    type,
    sourceKey,
    title,
    locator: asNullableString(record.locator),
    sortOrder,
    appPath: asNullableString(record.appPath),
    excerpt: asNullableString(record.excerpt),
    score: asNullableNumber(record.score),
    asOf: asNullableString(record.asOf),
  };
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  return typeof value === 'string' ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
