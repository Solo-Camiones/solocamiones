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
    const events = await collect(
      streamFrom([
        'event: delta\ndata: {"text":"Hola"}\n\n',
      ]),
    );
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
    const events = await collect(
      streamFrom(['event: del', 'ta\ndata: {"text":"xy', 'z"}\n\n']),
    );
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
});
