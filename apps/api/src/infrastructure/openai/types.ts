export type LanguageModelRole = 'system' | 'user' | 'assistant' | 'tool';

export type LanguageModelMessage = {
  role: LanguageModelRole;
  content: string;
  /** Required when role is `tool`: correlates with a prior tool_call id. */
  toolCallId?: string;
};

export type LanguageModelToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema object for tool arguments. */
  parameters: Record<string, unknown>;
};

export type LanguageModelRequest = {
  messages: LanguageModelMessage[];
  tools?: LanguageModelToolDefinition[];
  /** Overrides config maxOutputTokens when set. */
  maxOutputTokens?: number;
};

export type LanguageModelUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type LanguageModelEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; argumentsJson: string }
  | { type: 'usage'; usage: LanguageModelUsage }
  | { type: 'done'; providerResponseId?: string };

export type LanguageModelGateway = {
  streamCompletion(
    request: LanguageModelRequest,
    signal?: AbortSignal,
  ): AsyncIterable<LanguageModelEvent>;
};

export type KnowledgeChunk = {
  sourceKey: string;
  title: string;
  locator: string;
  excerpt: string;
  score: number;
};

export type KnowledgeRetrieveOptions = {
  maxResults?: number;
  scoreThreshold?: number;
};

export type KnowledgeRetriever = {
  retrieve(
    query: string,
    options?: KnowledgeRetrieveOptions,
    signal?: AbortSignal,
  ): Promise<KnowledgeChunk[]>;
};
