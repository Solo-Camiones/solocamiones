import type { ListPage } from './pagination';

export type AssistantConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

export type AssistantMessageStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type AssistantSource = {
  type: 'DOCUMENT' | 'TOOL';
  sourceKey: string;
  title: string;
  locator: string | null;
  sortOrder: number;
  appPath: string | null;
  excerpt: string | null;
  score: number | null;
  asOf: string | null;
};

export type AssistantMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  status: AssistantMessageStatus;
  content: string;
  clientRequestId: string | null;
  createdAt: string;
  completedAt: string | null;
  sources: AssistantSource[];
};

export type AssistantUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AssistantStreamEvent =
  | {
      type: 'metadata';
      conversationId: string;
      userMessageId: string;
      runId: string;
    }
  | { type: 'delta'; text: string }
  | { type: 'sources'; sources: AssistantSource[] }
  | {
      type: 'done';
      assistantMessageId: string;
      usage: AssistantUsage;
    }
  | {
      type: 'error';
      code: string;
      message: string;
      retryable: boolean;
      errorId: string;
    };

export type StreamAssistantMessageInput = {
  conversationId: string;
  content: string;
  clientRequestId: string;
  signal?: AbortSignal;
};

export type AssistantConversationPage = ListPage<AssistantConversation>;
export type AssistantMessagePage = ListPage<AssistantMessage>;
