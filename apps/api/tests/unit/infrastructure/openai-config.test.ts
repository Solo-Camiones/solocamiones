import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ASSISTANT_DAILY_MESSAGE_LIMIT,
  DEFAULT_ASSISTANT_MAX_INPUT_CHARS,
  DEFAULT_ASSISTANT_MAX_OUTPUT_TOKENS,
  DEFAULT_ASSISTANT_MAX_RETRIEVAL_RESULTS,
  DEFAULT_ASSISTANT_MAX_TOOL_CALLS,
  DEFAULT_ASSISTANT_REQUEST_TIMEOUT_MS,
  DEFAULT_ASSISTANT_RETENTION_DAYS,
  DEFAULT_ASSISTANT_RETRIEVAL_SCORE_THRESHOLD,
  DEFAULT_OPENAI_CHAT_MODEL,
  parseAssistantConfig,
} from '../../../src/infrastructure/openai/index.js';

describe('parseAssistantConfig', () => {
  it('returns defaults with feature disabled and no credentials', () => {
    const config = parseAssistantConfig({});

    expect(config).toEqual({
      enabled: false,
      apiKey: undefined,
      chatModel: DEFAULT_OPENAI_CHAT_MODEL,
      vectorStoreId: undefined,
      retentionDays: DEFAULT_ASSISTANT_RETENTION_DAYS,
      dailyMessageLimit: DEFAULT_ASSISTANT_DAILY_MESSAGE_LIMIT,
      maxInputChars: DEFAULT_ASSISTANT_MAX_INPUT_CHARS,
      maxOutputTokens: DEFAULT_ASSISTANT_MAX_OUTPUT_TOKENS,
      maxToolCalls: DEFAULT_ASSISTANT_MAX_TOOL_CALLS,
      maxRetrievalResults: DEFAULT_ASSISTANT_MAX_RETRIEVAL_RESULTS,
      retrievalScoreThreshold: DEFAULT_ASSISTANT_RETRIEVAL_SCORE_THRESHOLD,
      requestTimeoutMs: DEFAULT_ASSISTANT_REQUEST_TIMEOUT_MS,
    });
  });

  it('parses enabled configuration with required credentials', () => {
    const config = parseAssistantConfig({
      ASSISTANT_ENABLED: 'true',
      OPENAI_API_KEY: 'sk-test',
      OPENAI_VECTOR_STORE_ID: 'vs_test',
      OPENAI_CHAT_MODEL: 'gpt-test',
      ASSISTANT_MAX_OUTPUT_TOKENS: '800',
      ASSISTANT_RETRIEVAL_SCORE_THRESHOLD: '0.7',
    });

    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBe('sk-test');
    expect(config.vectorStoreId).toBe('vs_test');
    expect(config.chatModel).toBe('gpt-test');
    expect(config.maxOutputTokens).toBe(800);
    expect(config.retrievalScoreThreshold).toBe(0.7);
  });

  it('allows missing credentials when disabled', () => {
    expect(() =>
      parseAssistantConfig({
        ASSISTANT_ENABLED: 'false',
      }),
    ).not.toThrow();
  });

  it('requires credentials when enabled', () => {
    expect(() => parseAssistantConfig({ ASSISTANT_ENABLED: '1' })).toThrow(
      /OPENAI_API_KEY is required/,
    );
    expect(() =>
      parseAssistantConfig({
        ASSISTANT_ENABLED: 'true',
        OPENAI_API_KEY: 'sk-test',
      }),
    ).toThrow(/OPENAI_VECTOR_STORE_ID is required/);
  });

  it('rejects invalid present values even when disabled', () => {
    expect(() =>
      parseAssistantConfig({
        ASSISTANT_ENABLED: 'false',
        ASSISTANT_MAX_OUTPUT_TOKENS: '-1',
      }),
    ).toThrow(/ASSISTANT_MAX_OUTPUT_TOKENS/);

    expect(() =>
      parseAssistantConfig({
        ASSISTANT_RETENTION_DAYS: '999',
      }),
    ).toThrow(/ASSISTANT_RETENTION_DAYS/);

    expect(() =>
      parseAssistantConfig({
        ASSISTANT_RETRIEVAL_SCORE_THRESHOLD: '1.5',
      }),
    ).toThrow(/ASSISTANT_RETRIEVAL_SCORE_THRESHOLD/);

    expect(() =>
      parseAssistantConfig({
        ASSISTANT_ENABLED: 'maybe',
      }),
    ).toThrow(/ASSISTANT_ENABLED/);
  });
});
