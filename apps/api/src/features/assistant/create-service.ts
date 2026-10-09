import { prisma } from '../../infrastructure/database/index.js';
import {
  createKnowledgeRetriever,
  createLanguageModelGateway,
  type AssistantConfig,
} from '../../infrastructure/openai/index.js';
import { ConversationRepository } from './conversation-repository.js';
import { KnowledgeDocumentRepository } from './knowledge-document-repository.js';
import { MessageRepository } from './message-repository.js';
import { ReadyKnowledgeRetriever } from './ready-knowledge-retriever.js';
import { RunRepository } from './run-repository.js';
import { AssistantService } from './service.js';
import { SourceRepository } from './source-repository.js';
import { createCommercialAssistantToolRegistry } from './tools/create-commercial-tools.js';
import { assistantTransaction } from './transaction.js';

/**
 * Composition root helper for the assistant module.
 * Production and tests inject config; OpenAI SDK stays behind factories.
 */
export function createAssistantService(config: AssistantConfig): AssistantService {
  const repositories = {
    conversations: new ConversationRepository(prisma),
    messages: new MessageRepository(prisma),
    runs: new RunRepository(prisma),
    sources: new SourceRepository(prisma),
    knowledgeDocuments: new KnowledgeDocumentRepository(prisma),
  };

  return new AssistantService({
    config,
    languageModel: createLanguageModelGateway(config),
    knowledgeRetriever: new ReadyKnowledgeRetriever(
      createKnowledgeRetriever(config),
      repositories.knowledgeDocuments,
    ),
    toolRegistry: createCommercialAssistantToolRegistry(),
    repositories,
    runTransaction: assistantTransaction,
  });
}
