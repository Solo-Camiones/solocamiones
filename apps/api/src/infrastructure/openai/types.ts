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
  /** Provider file that produced the chunk; used to verify it is the READY version. */
  providerFileId: string;
  sourceKey: string;
  title: string;
  version: string | null;
  locator: string;
  excerpt: string;
  score: number;
  sourceRequirements: string[];
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

export type KnowledgeIndexDocument = {
  sourceKey: string;
  title: string;
  version: string;
  locator: string;
  sha256: string;
  sourceRequirements: string[];
  /** Normalized Markdown; the uploaded bytes are exactly what was checksummed. */
  content: string;
};

export type KnowledgeIndexedFile = {
  providerFileId: string;
};

export type KnowledgeIndexWriter = {
  /** Uploads and attaches a document, resolving only once the provider finished indexing it. */
  indexDocument(document: KnowledgeIndexDocument): Promise<KnowledgeIndexedFile>;
  /** Detaches and deletes a provider file. Missing files are treated as already removed. */
  removeDocument(providerFileId: string): Promise<void>;
  /** Lists provider files that carry the corpus marker. */
  listCorpusFileIds(): Promise<string[]>;
};
