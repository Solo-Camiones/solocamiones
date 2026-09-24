import type { LanguageModelUsage } from '../../infrastructure/openai/types.js';
import type { AssistantSourceView } from './evidence.js';

/**
 * Domain stream events produced by AssistantService (M5).
 * M6 maps these 1:1 onto SSE event names.
 */
export type AssistantDomainEvent =
  | {
      type: 'metadata';
      conversationId: string;
      userMessageId: string;
      runId: string;
    }
  | { type: 'delta'; text: string }
  | { type: 'sources'; sources: AssistantSourceView[] }
  | {
      type: 'done';
      assistantMessageId: string;
      usage: LanguageModelUsage;
    }
  | {
      type: 'error';
      code: string;
      message: string;
      retryable: boolean;
      errorId: string;
    };

export type StreamMessageInput = {
  conversationId: string;
  userId: string;
  content: string;
  clientRequestId: string;
  signal?: AbortSignal;
  now?: Date;
};
