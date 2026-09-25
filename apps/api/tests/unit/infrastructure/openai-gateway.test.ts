import {
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  InternalServerError,
  RateLimitError,
} from 'openai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { logger } from '../../../src/infrastructure/logging/index.js';
import {
  AssistantProviderError,
  OpenAiLanguageModelGateway,
  createFakeLanguageModelGateway,
  createLanguageModelGateway,
  mapOpenAiError,
  parseAssistantConfig,
  type OpenAiResponsesClient,
} from '../../../src/infrastructure/openai/index.js';

async function collect(
  iterable: AsyncIterable<unknown>,
): Promise<unknown[]> {
  const items: unknown[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

describe('mapOpenAiError', () => {
  it('maps auth, rate limit, timeout, abort, and 5xx errors', () => {
    expect(mapOpenAiError(new AuthenticationError(401, undefined, 'auth', new Headers())).code).toBe(
      'AUTH',
    );
    expect(mapOpenAiError(new RateLimitError(429, undefined, 'rate', new Headers())).code).toBe(
      'RATE_LIMIT',
    );
    expect(mapOpenAiError(new APIConnectionTimeoutError()).code).toBe('TIMEOUT');
    expect(mapOpenAiError(new APIUserAbortError()).code).toBe('TIMEOUT');
    expect(mapOpenAiError(new InternalServerError(503, undefined, 'down', new Headers())).code).toBe(
      'UNAVAILABLE',
    );
    expect(mapOpenAiError(APIError.generate(500, undefined, 'boom', new Headers())).code).toBe(
      'UNAVAILABLE',
    );
    expect(mapOpenAiError(APIError.generate(400, undefined, 'bad', new Headers())).code).toBe(
      'INVALID_RESPONSE',
    );
  });

  it('maps streaming credit exhaustion (APIError without status) to non-retryable RATE_LIMIT', () => {
    // Mirrors OpenAI Responses streaming: create() succeeds, then mid-stream fails
    // with code/type set and status omitted — previously misclassified as INVALID_RESPONSE.
    const streamingQuotaError = new APIError(
      undefined,
      {
        message: 'You have no credits remaining.',
        type: 'insufficient_quota',
        code: 'credit_balance_exhausted',
      },
      'You have no credits remaining.',
      undefined,
    );

    const mapped = mapOpenAiError(streamingQuotaError);
    expect(mapped.code).toBe('RATE_LIMIT');
    expect(mapped.retryable).toBe(false);
    expect(mapped.message).toMatch(/quota or credits/i);
  });

  it('maps RateLimitError credit exhaustion to non-retryable RATE_LIMIT', () => {
    const rateLimitQuotaError = new RateLimitError(
      429,
      {
        message: 'You have no credits remaining.',
        type: 'insufficient_quota',
        code: 'credit_balance_exhausted',
      },
      'You have no credits remaining.',
      new Headers(),
    );

    const mapped = mapOpenAiError(rateLimitQuotaError);
    expect(mapped.code).toBe('RATE_LIMIT');
    expect(mapped.retryable).toBe(false);
  });
});

describe('OpenAiLanguageModelGateway', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends store:false, model, max tokens and streams domain events', async () => {
    const create = vi.fn(async (_body: Record<string, unknown>, _options?: { signal?: AbortSignal }) => {
      return (async function* () {
        yield {
          type: 'response.created',
          response: { id: 'resp_1' },
          sequence_number: 0,
        };
        yield {
          type: 'response.output_text.delta',
          delta: 'Hello',
          sequence_number: 1,
        };
        yield {
          type: 'response.output_item.done',
          item: {
            type: 'function_call',
            call_id: 'call_1',
            name: 'searchCustomers',
            arguments: '{"query":"acme"}',
          },
          sequence_number: 2,
        };
        yield {
          type: 'response.completed',
          response: {
            id: 'resp_1',
            usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
          },
          sequence_number: 3,
        };
      })();
    });

    const client = { responses: { create } } as unknown as OpenAiResponsesClient;
    const gateway = new OpenAiLanguageModelGateway({
      client,
      config: {
        chatModel: 'gpt-test-model',
        maxOutputTokens: 1200,
        apiKey: 'sk-secret-key',
      },
    });

    const events = await collect(
      gateway.streamCompletion({
        messages: [{ role: 'user', content: 'hi' }],
        tools: [
          {
            name: 'searchCustomers',
            description: 'Search',
            parameters: { type: 'object', properties: {} },
          },
        ],
      }),
    );

    expect(create).toHaveBeenCalledTimes(1);
    const [body, options] = create.mock.calls[0]!;
    expect(body.store).toBe(false);
    expect(body.stream).toBe(true);
    expect(body.model).toBe('gpt-test-model');
    expect(body.max_output_tokens).toBe(1200);
    expect(body.tools).toEqual([
      {
        type: 'function',
        name: 'searchCustomers',
        description: 'Search',
        parameters: { type: 'object', properties: {} },
        strict: null,
      },
    ]);
    expect(options).toEqual({ signal: undefined });
    expect(JSON.stringify(body)).not.toContain('sk-secret-key');

    expect(events).toEqual([
      { type: 'delta', text: 'Hello' },
      {
        type: 'tool_call',
        id: 'call_1',
        name: 'searchCustomers',
        argumentsJson: '{"query":"acme"}',
      },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } },
      { type: 'done', providerResponseId: 'resp_1' },
    ]);
  });

  it('propagates AbortSignal and maps abort to TIMEOUT', async () => {
    const controller = new AbortController();
    controller.abort();

    const create = vi.fn(async (_body: Record<string, unknown>, options?: { signal?: AbortSignal }) => {
      expect(options?.signal?.aborted).toBe(true);
      throw new APIUserAbortError();
    });

    const gateway = new OpenAiLanguageModelGateway({
      client: { responses: { create } },
      config: { chatModel: 'gpt-test', maxOutputTokens: 100, apiKey: undefined },
    });

    await expect(
      collect(gateway.streamCompletion({ messages: [{ role: 'user', content: 'x' }] }, controller.signal)),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('maps rate limit failures and does not log prompts or API keys', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const create = vi.fn(async () => {
      throw new RateLimitError(429, undefined, 'rate sk-secret-key', new Headers());
    });

    const gateway = new OpenAiLanguageModelGateway({
      client: { responses: { create } },
      config: { chatModel: 'gpt-test', maxOutputTokens: 100, apiKey: 'sk-secret-key' },
    });

    await expect(
      collect(
        gateway.streamCompletion({
          messages: [{ role: 'user', content: 'secret-prompt-should-not-log' }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT' });

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RATE_LIMIT', retryable: true }),
      'OpenAI language model request failed',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-prompt-should-not-log');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('sk-secret-key');
  });

  it('rejects streams that end without completion', async () => {
    const create = vi.fn(async () =>
      (async function* () {
        yield { type: 'response.output_text.delta', delta: 'partial', sequence_number: 1 };
      })(),
    );

    const gateway = new OpenAiLanguageModelGateway({
      client: { responses: { create } } as unknown as OpenAiResponsesClient,
      config: { chatModel: 'gpt-test', maxOutputTokens: 100, apiKey: undefined },
    });

    await expect(
      collect(gateway.streamCompletion({ messages: [{ role: 'user', content: 'x' }] })),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('language model fakes and factories', () => {
  it('provides deterministic fake events without network', async () => {
    const fake = createFakeLanguageModelGateway();
    const events = await collect(
      fake.streamCompletion({ messages: [{ role: 'user', content: 'ping' }] }),
    );
    expect(events[0]).toEqual({ type: 'delta', text: 'fake-response' });
  });

  it('returns disabled gateway when feature is off', async () => {
    const gateway = createLanguageModelGateway(parseAssistantConfig({ ASSISTANT_ENABLED: 'false' }));
    await expect(
      collect(gateway.streamCompletion({ messages: [{ role: 'user', content: 'x' }] })),
    ).rejects.toBeInstanceOf(AssistantProviderError);
    await expect(
      collect(gateway.streamCompletion({ messages: [{ role: 'user', content: 'x' }] })),
    ).rejects.toMatchObject({ code: 'DISABLED' });
  });
});
