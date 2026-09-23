import type {
  AssistantConversation,
  AssistantKnowledgeDocument,
  AssistantKnowledgeStatus,
  AssistantMessage,
  AssistantMessageRole,
  AssistantMessageStatus,
  AssistantRun,
  AssistantRunStatus,
  AssistantSource,
  AssistantSourceType,
  Prisma,
} from '@prisma/client';

export type {
  AssistantConversation,
  AssistantKnowledgeDocument,
  AssistantMessage,
  AssistantRun,
  AssistantSource,
};

export type CreateConversationInput = {
  userId: string;
  retentionDays: number;
  title?: string;
  now?: Date;
};

export type ListOwnedConversationsQuery = {
  userId: string;
  page: number;
  pageSize?: number;
};

export type ListMessagesQuery = {
  conversationId: string;
  page: number;
  pageSize?: number;
};

export type CreateUserMessageWithRunInput = {
  conversationId: string;
  userId: string;
  content: string;
  clientRequestId: string;
  model: string;
  promptVersion: string;
  retentionDays: number;
  now?: Date;
};

export type CreateUserMessageWithRunResult = {
  message: AssistantMessage;
  run: AssistantRun;
  created: boolean;
};

export type CompleteRunInput = {
  runId: string;
  assistantMessageId?: string;
  providerResponseId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  toolCallCount?: number;
  toolCalls?: Prisma.InputJsonValue | null;
  latencyMs?: number | null;
  completedAt?: Date;
};

export type FailOrCancelRunInput = {
  runId: string;
  errorCode: string;
  errorId?: string | null;
  assistantMessageId?: string | null;
  providerResponseId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  toolCallCount?: number;
  toolCalls?: Prisma.InputJsonValue | null;
  latencyMs?: number | null;
  completedAt?: Date;
};

export type CreateAssistantMessageInput = {
  conversationId: string;
  content: string;
  status?: Extract<AssistantMessageStatus, 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'>;
  completedAt?: Date | null;
};

export type CreateSourceInput = {
  assistantMessageId: string;
  type: AssistantSourceType;
  sourceKey: string;
  title: string;
  locator?: string | null;
  sortOrder: number;
  appPath?: string | null;
  excerpt?: string | null;
  score?: number | null;
  asOf?: Date | null;
};

export type UpsertKnowledgeDocumentInput = {
  sourceKey: string;
  title: string;
  version: string;
  contentSha256: string;
  status?: AssistantKnowledgeStatus;
  providerFileId?: string | null;
  approvedAt?: Date | null;
  indexedAt?: Date | null;
  lastSyncedAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
  errorCode?: string | null;
  errorId?: string | null;
};

export type UpdateKnowledgeDocumentStatusInput = {
  sourceKey: string;
  status: AssistantKnowledgeStatus;
  providerFileId?: string | null;
  indexedAt?: Date | null;
  lastSyncedAt?: Date | null;
  errorCode?: string | null;
  errorId?: string | null;
};

export type PurgeExpiredConversationsInput = {
  now?: Date;
  batchSize?: number;
  dryRun?: boolean;
};

export type PurgeExpiredConversationsResult = {
  dryRun: boolean;
  candidateCount: number;
  deletedCount: number;
  conversationIds: string[];
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type AssistantMessageRoleValue = AssistantMessageRole;
export type AssistantMessageStatusValue = AssistantMessageStatus;
export type AssistantRunStatusValue = AssistantRunStatus;
