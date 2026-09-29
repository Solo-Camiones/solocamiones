-- Assistant persistence: conversations, messages, runs, sources, knowledge documents.
-- Commercial tables are intentionally untouched.

CREATE TYPE "AssistantMessageRole" AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE "AssistantMessageStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "AssistantRunStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "AssistantSourceType" AS ENUM ('DOCUMENT', 'TOOL');
CREATE TYPE "AssistantKnowledgeStatus" AS ENUM ('SYNC_PENDING', 'INDEXING', 'READY', 'FAILED', 'REMOVED');

CREATE TABLE "AssistantConversation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastMessageAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssistantConversation_title_length_check" CHECK (char_length("title") <= 120)
);

CREATE TABLE "AssistantMessage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversationId" UUID NOT NULL,
    "role" "AssistantMessageRole" NOT NULL,
    "status" "AssistantMessageStatus" NOT NULL,
    "content" TEXT NOT NULL,
    "clientRequestId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssistantMessage_content_check" CHECK (length(btrim("content")) > 0),
    CONSTRAINT "AssistantMessage_client_request_id_check" CHECK (
        (
            "role" = 'USER'
            AND "clientRequestId" IS NOT NULL
            AND length(btrim("clientRequestId")) > 0
        )
        OR (
            "role" = 'ASSISTANT'
            AND "clientRequestId" IS NULL
        )
    ),
    CONSTRAINT "AssistantMessage_status_completed_at_check" CHECK (
        (
            "status" = 'PENDING'
            AND "completedAt" IS NULL
        )
        OR (
            "status" IN ('COMPLETED', 'FAILED', 'CANCELLED')
            AND "completedAt" IS NOT NULL
        )
    )
);

CREATE TABLE "AssistantRun" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversationId" UUID NOT NULL,
    "userMessageId" UUID NOT NULL,
    "assistantMessageId" UUID,
    "status" "AssistantRunStatus" NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "providerResponseId" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "toolCallCount" INTEGER NOT NULL DEFAULT 0,
    "toolCalls" JSONB,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "latencyMs" INTEGER,
    "errorCode" TEXT,
    "errorId" TEXT,

    CONSTRAINT "AssistantRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssistantRun_model_check" CHECK (length(btrim("model")) > 0),
    CONSTRAINT "AssistantRun_prompt_version_check" CHECK (length(btrim("promptVersion")) > 0),
    CONSTRAINT "AssistantRun_tool_call_count_check" CHECK ("toolCallCount" >= 0),
    CONSTRAINT "AssistantRun_token_check" CHECK (
        ("inputTokens" IS NULL OR "inputTokens" >= 0)
        AND ("outputTokens" IS NULL OR "outputTokens" >= 0)
    ),
    CONSTRAINT "AssistantRun_latency_check" CHECK ("latencyMs" IS NULL OR "latencyMs" >= 0),
    CONSTRAINT "AssistantRun_status_fields_check" CHECK (
        (
            "status" = 'PENDING'
            AND "completedAt" IS NULL
            AND "latencyMs" IS NULL
            AND "errorCode" IS NULL
            AND "errorId" IS NULL
        )
        OR (
            "status" = 'COMPLETED'
            AND "completedAt" IS NOT NULL
            AND "errorCode" IS NULL
            AND "errorId" IS NULL
        )
        OR (
            "status" IN ('FAILED', 'CANCELLED')
            AND "completedAt" IS NOT NULL
            AND "errorCode" IS NOT NULL
            AND length(btrim("errorCode")) > 0
        )
    )
);

CREATE TABLE "AssistantSource" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assistantMessageId" UUID NOT NULL,
    "type" "AssistantSourceType" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "locator" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "appPath" TEXT,
    "excerpt" TEXT,
    "score" DOUBLE PRECISION,
    "asOf" TIMESTAMPTZ(3),

    CONSTRAINT "AssistantSource_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssistantSource_source_key_check" CHECK (length(btrim("sourceKey")) > 0),
    CONSTRAINT "AssistantSource_title_check" CHECK (length(btrim("title")) > 0),
    CONSTRAINT "AssistantSource_sort_order_check" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "AssistantKnowledgeDocument" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sourceKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "status" "AssistantKnowledgeStatus" NOT NULL DEFAULT 'SYNC_PENDING',
    "providerFileId" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "indexedAt" TIMESTAMPTZ(3),
    "lastSyncedAt" TIMESTAMPTZ(3),
    "metadata" JSONB,
    "errorCode" TEXT,
    "errorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AssistantKnowledgeDocument_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssistantKnowledgeDocument_source_key_check" CHECK (length(btrim("sourceKey")) > 0),
    CONSTRAINT "AssistantKnowledgeDocument_title_check" CHECK (length(btrim("title")) > 0),
    CONSTRAINT "AssistantKnowledgeDocument_version_check" CHECK (length(btrim("version")) > 0),
    CONSTRAINT "AssistantKnowledgeDocument_sha_check" CHECK (length(btrim("contentSha256")) > 0)
);

CREATE INDEX "AssistantConversation_userId_lastMessageAt_idx" ON "AssistantConversation"("userId", "lastMessageAt");
CREATE INDEX "AssistantConversation_expiresAt_idx" ON "AssistantConversation"("expiresAt");

CREATE UNIQUE INDEX "AssistantMessage_conversationId_clientRequestId_key"
ON "AssistantMessage"("conversationId", "clientRequestId");
CREATE INDEX "AssistantMessage_conversationId_createdAt_id_idx"
ON "AssistantMessage"("conversationId", "createdAt", "id");

CREATE UNIQUE INDEX "AssistantRun_userMessageId_key" ON "AssistantRun"("userMessageId");
CREATE UNIQUE INDEX "AssistantRun_assistantMessageId_key" ON "AssistantRun"("assistantMessageId");
CREATE INDEX "AssistantRun_conversationId_startedAt_idx" ON "AssistantRun"("conversationId", "startedAt");
-- At most one in-flight run per conversation (PENDING == active).
CREATE UNIQUE INDEX "AssistantRun_one_pending_per_conversation"
ON "AssistantRun"("conversationId")
WHERE "status" = 'PENDING';

CREATE INDEX "AssistantSource_assistantMessageId_sortOrder_idx"
ON "AssistantSource"("assistantMessageId", "sortOrder");

CREATE UNIQUE INDEX "AssistantKnowledgeDocument_sourceKey_key"
ON "AssistantKnowledgeDocument"("sourceKey");
CREATE INDEX "AssistantKnowledgeDocument_status_idx"
ON "AssistantKnowledgeDocument"("status");

ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssistantRun" ADD CONSTRAINT "AssistantRun_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantRun" ADD CONSTRAINT "AssistantRun_userMessageId_fkey"
FOREIGN KEY ("userMessageId") REFERENCES "AssistantMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantRun" ADD CONSTRAINT "AssistantRun_assistantMessageId_fkey"
FOREIGN KEY ("assistantMessageId") REFERENCES "AssistantMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssistantSource" ADD CONSTRAINT "AssistantSource_assistantMessageId_fkey"
FOREIGN KEY ("assistantMessageId") REFERENCES "AssistantMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
