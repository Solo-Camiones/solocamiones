import type OpenAI from 'openai';
import type { FunctionTool, ResponseStreamEvent } from 'openai/resources/responses/responses.js';

import type { AssistantConfig } from './config.js';
import { AssistantProviderError } from './errors.js';
import { mapOpenAiError } from './map-error.js';
import { logger } from '../logging/index.js';
import type {
  LanguageModelEvent,
  LanguageModelGateway,
  LanguageModelMessage,
  LanguageModelRequest,
  LanguageModelToolDefinition,
  LanguageModelUsage,
} from './types.js';

export type OpenAiResponsesClient = {
  responses: {
    create: (
      body: Record<string, unknown>,
      options?: { signal?: AbortSignal },
    ) => Promise<AsyncIterable<ResponseStreamEvent>>;
  };
};

export type OpenAiLanguageModelGatewayOptions = {
  client: OpenAiResponsesClient | OpenAI;
  config: Pick<AssistantConfig, 'chatModel' | 'maxOutputTokens' | 'apiKey'>;
};

export class OpenAiLanguageModelGateway implements LanguageModelGateway {
  private readonly client: OpenAiResponsesClient;
  private readonly chatModel: string;
  private readonly maxOutputTokens: number;
  private readonly apiKey: string | undefined;

  constructor(options: OpenAiLanguageModelGatewayOptions) {
    this.client = options.client as OpenAiResponsesClient;
    this.chatModel = options.config.chatModel;
    this.maxOutputTokens = options.config.maxOutputTokens;
    this.apiKey = options.config.apiKey;
  }

  streamCompletion(
    request: LanguageModelRequest,
    signal?: AbortSignal,
  ): AsyncIterable<LanguageModelEvent> {
    return this.iterate(request, signal);
  }

  private async *iterate(
    request: LanguageModelRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<LanguageModelEvent> {
    const body = {
      model: this.chatModel,
      store: false,
      stream: true,
      max_output_tokens: request.maxOutputTokens ?? this.maxOutputTokens,
      input: request.messages.flatMap(mapMessageToInput),
      ...(request.tools != null && request.tools.length > 0
        ? { tools: request.tools.map(mapToolDefinition) }
        : {}),
    };

    let stream: AsyncIterable<ResponseStreamEvent>;
    try {
      stream = await this.client.responses.create(body, { signal });
    } catch (error) {
      throw this.translateAndLog(error);
    }

    let providerResponseId: string | undefined;

    try {
      for await (const event of stream) {
        if (signal?.aborted) {
          throw AssistantProviderError.timeout('OpenAI request was aborted');
        }

        if (event.type === 'response.created') {
          providerResponseId = event.response?.id;
          continue;
        }

        if (event.type === 'response.output_text.delta') {
          if (typeof event.delta === 'string' && event.delta.length > 0) {
            yield { type: 'delta', text: event.delta };
          }
          continue;
        }

        if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
          const item = event.item;
          yield {
            type: 'tool_call',
            id: item.call_id,
            name: item.name,
            argumentsJson: item.arguments,
          };
          continue;
        }

        if (event.type === 'response.completed') {
          providerResponseId = event.response?.id ?? providerResponseId;
          const usage = mapUsage(event.response?.usage);
          if (usage != null) {
            yield { type: 'usage', usage };
          }
          yield { type: 'done', providerResponseId };
          return;
        }

        if (event.type === 'response.failed' || event.type === 'error') {
          throw AssistantProviderError.unavailable('OpenAI response stream failed');
        }
      }
    } catch (error) {
      if (error instanceof AssistantProviderError) {
        throw error;
      }
      throw this.translateAndLog(error);
    }

    throw AssistantProviderError.invalidResponse('OpenAI stream ended without completion');
  }

  private translateAndLog(error: unknown): AssistantProviderError {
    const mapped = mapOpenAiError(error);
    logger.warn(
      {
        code: mapped.code,
        retryable: mapped.retryable,
      },
      'OpenAI language model request failed',
    );
    // Ensure accidental message logging never retains the API key if callers stringify errors later.
    if (this.apiKey != null && mapped.message.includes(this.apiKey)) {
      return new AssistantProviderError(mapped.code, mapped.message.split(this.apiKey).join('[Redacted]'), {
        retryable: mapped.retryable,
        cause: mapped.cause,
      });
    }
    return mapped;
  }
}

function mapMessageToInput(message: LanguageModelMessage): Record<string, unknown>[] {
  if (message.role === 'tool') {
    return [
      {
        type: 'function_call_output',
        call_id: message.toolCallId,
        output: message.content,
      },
    ];
  }

  if (message.role === 'assistant' && message.toolCalls != null && message.toolCalls.length > 0) {
    return message.toolCalls.map((toolCall) => ({
      type: 'function_call',
      call_id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.argumentsJson,
    }));
  }

  return [
    {
      type: 'message',
      role: message.role,
      content: message.content,
    },
  ];
}

function mapToolDefinition(tool: LanguageModelToolDefinition): FunctionTool {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: null,
  };
}

function mapUsage(usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null | undefined): LanguageModelUsage | null {
  if (usage == null) return null;
  if (
    typeof usage.input_tokens !== 'number' ||
    typeof usage.output_tokens !== 'number' ||
    typeof usage.total_tokens !== 'number'
  ) {
    return null;
  }
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
  };
}
