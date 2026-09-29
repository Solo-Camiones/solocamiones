import { describe, expect, it } from 'vitest';

import { parseAssistantSse } from '../../../src/api/client/parse-assistant-sse';

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index]));
      index += 1;
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const events = [];
  for await (const event of parseAssistantSse(stream)) {
    events.push(event);
  }
  return events;
}

describe('parseAssistantSse', () => {
  it('parses a single complete event', async () => {
    const events = await collect(streamFrom(['event: delta\ndata: {"text":"Hola"}\n\n']));
    expect(events).toEqual([{ type: 'delta', text: 'Hola' }]);
  });

  it('parses multiple events in one chunk', async () => {
    const events = await collect(
      streamFrom([
        'event: metadata\ndata: {"conversationId":"c1","userMessageId":"u1","runId":"r1"}\n\n' +
          'event: delta\ndata: {"text":"A"}\n\n' +
          'event: done\ndata: {"assistantMessageId":"a1","usage":{"inputTokens":1,"outputTokens":2,"totalTokens":3}}\n\n',
      ]),
    );
    expect(events.map((event) => event.type)).toEqual(['metadata', 'delta', 'done']);
  });

  it('reassembles events split across chunks', async () => {
    const events = await collect(streamFrom(['event: del', 'ta\ndata: {"text":"xy', 'z"}\n\n']));
    expect(events).toEqual([{ type: 'delta', text: 'xyz' }]);
  });

  it('ignores heartbeat comments', async () => {
    const events = await collect(
      streamFrom([': heartbeat\n\nevent: delta\ndata: {"text":"ok"}\n\n']),
    );
    expect(events).toEqual([{ type: 'delta', text: 'ok' }]);
  });

  it('skips invalid JSON and unknown event names', async () => {
    const events = await collect(
      streamFrom([
        'event: delta\ndata: {not-json}\n\n' +
          'event: mystery\ndata: {"text":"no"}\n\n' +
          'event: error\ndata: {"code":"X","message":"boom","retryable":true,"errorId":"e1"}\n\n',
      ]),
    );
    expect(events).toEqual([
      {
        type: 'error',
        code: 'X',
        message: 'boom',
        retryable: true,
        errorId: 'e1',
      },
    ]);
  });

  it('parses a final CRLF frame without a trailing separator', async () => {
    const events = await collect(streamFrom(['event: delta\r\ndata: {"text":"final"}\r\n']));

    expect(events).toEqual([{ type: 'delta', text: 'final' }]);
  });

  it('parses document and tool sources with nullable optional fields', async () => {
    const sources = [
      {
        type: 'DOCUMENT',
        sourceKey: 'guide',
        title: 'Guía',
        locator: null,
        sortOrder: 0,
        appPath: null,
        excerpt: 'Texto',
        score: 0.9,
        asOf: null,
      },
      {
        type: 'TOOL',
        sourceKey: 'tool:sales',
        title: 'Ventas',
        locator: '/sales',
        sortOrder: 1,
        appPath: '/sales',
        excerpt: null,
        score: null,
        asOf: '2026-09-29T00:00:00.000Z',
      },
    ];
    const events = await collect(
      streamFrom([`event: sources\ndata: ${JSON.stringify({ sources })}\n\n`]),
    );

    expect(events).toEqual([{ type: 'sources', sources }]);
  });

  it.each([
    ['message', { text: 'missing event name' }],
    ['metadata', null],
    ['metadata', { conversationId: 'c1', userMessageId: 'u1' }],
    ['delta', { text: 1 }],
    ['sources', { sources: {} }],
    ['sources', { sources: [{ type: 'UNKNOWN' }] }],
    [
      'sources',
      { sources: [{ type: 'DOCUMENT', sourceKey: 'x', title: 'X', sortOrder: Infinity }] },
    ],
    ['done', { assistantMessageId: 'a1', usage: [] }],
    [
      'done',
      {
        assistantMessageId: 'a1',
        usage: { inputTokens: 1, outputTokens: Number.NaN, totalTokens: 1 },
      },
    ],
    ['error', { code: 'FAILED', message: 'boom' }],
  ])('ignores invalid %s payloads', async (eventName, payload) => {
    const events = await collect(
      streamFrom([`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`]),
    );

    expect(events).toEqual([]);
  });
});
