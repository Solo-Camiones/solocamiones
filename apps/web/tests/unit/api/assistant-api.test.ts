import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAssistantConversationWithHttp,
  deleteAssistantConversationWithHttp,
  listAssistantConversationsWithHttp,
  listAssistantMessagesWithHttp,
  streamAssistantMessageWithHttp,
} from '../../../src/api/client/assistant-api';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function collectStream() {
  const events = [];
  for await (const event of streamAssistantMessageWithHttp({
    conversationId: 'conversation-1',
    content: '¿Qué es un conduce?',
    clientRequestId: 'request-1',
  })) {
    events.push(event);
  }
  return events;
}

afterEach(() => vi.unstubAllGlobals());

describe('assistant HTTP client', () => {
  it('maps conversation CRUD requests to the documented endpoints', async () => {
    const conversation = {
      id: 'conversation-1',
      title: 'Nueva conversación',
      createdAt: '2026-09-29T00:00:00.000Z',
      updatedAt: '2026-09-29T00:00:00.000Z',
      lastMessageAt: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(conversation, 201))
      .mockResolvedValueOnce(json({ items: [conversation], total: 1, page: 2, pageSize: 20 }))
      .mockResolvedValueOnce(json({ items: [], total: 0, page: 3, pageSize: 50 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createAssistantConversationWithHttp()).resolves.toEqual({
      ok: true,
      value: conversation,
    });
    await expect(listAssistantConversationsWithHttp(2)).resolves.toMatchObject({
      ok: true,
      value: { page: 2 },
    });
    await expect(listAssistantMessagesWithHttp('conversation-1', 3)).resolves.toMatchObject({
      ok: true,
      value: { page: 3 },
    });
    await expect(deleteAssistantConversationWithHttp('conversation-1')).resolves.toEqual({
      ok: true,
      value: undefined,
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/assistant/conversations',
      '/api/assistant/conversations?page=2',
      '/api/assistant/conversations/conversation-1/messages?page=3',
      '/api/assistant/conversations/conversation-1',
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Headers).get('X-Requested-With')).toBe(
      'XMLHttpRequest',
    );
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ method: 'DELETE' });
  });

  it('streams SSE events and sends the idempotency payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('event: delta\ndata: {"text":"Hola"}\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(collectStream()).resolves.toEqual([{ type: 'delta', text: 'Hola' }]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({
        content: '¿Qué es un conduce?',
        clientRequestId: 'request-1',
      }),
    });
  });

  it('maps pre-stream HTTP failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          json({ error: { code: 'RATE_LIMITED', message: 'Espere', errorId: 'error-1' } }, 429),
        ),
    );

    await expect(collectStream()).rejects.toMatchObject({
      status: 429,
      appError: { code: 'TOO_MANY_REQUESTS', errorId: 'error-1' },
    });
  });

  it('maps network failures and successful responses without a body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('offline')));
    await expect(collectStream()).rejects.toMatchObject({ code: 'NETWORK' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 200 })));
    await expect(collectStream()).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
