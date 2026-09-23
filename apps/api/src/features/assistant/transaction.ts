import { Prisma } from '@prisma/client';

import { prisma } from '../../infrastructure/database/index.js';
import { AppError } from '../../infrastructure/errors/app-error.js';
import { ASSISTANT_ACTIVE_RUN_CONFLICT_MESSAGE } from './constants.js';
import { ConversationRepository } from './conversation-repository.js';
import { KnowledgeDocumentRepository } from './knowledge-document-repository.js';
import { MessageRepository } from './message-repository.js';
import { RunRepository } from './run-repository.js';
import { SourceRepository } from './source-repository.js';

export type AssistantRepositories = {
  conversations: ConversationRepository;
  messages: MessageRepository;
  runs: RunRepository;
  sources: SourceRepository;
  knowledgeDocuments: KnowledgeDocumentRepository;
};

export type AssistantTransaction = <T>(
  work: (repositories: AssistantRepositories) => Promise<T>,
) => Promise<T>;

function createRepositories(database: Prisma.TransactionClient): AssistantRepositories {
  return {
    conversations: new ConversationRepository(database),
    messages: new MessageRepository(database),
    runs: new RunRepository(database),
    sources: new SourceRepository(database),
    knowledgeDocuments: new KnowledgeDocumentRepository(database),
  };
}

export const assistantTransaction: AssistantTransaction = async (work) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => work(createRepositories(tx)),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2034' && attempt < 3) continue;
        if (error.code === 'P2002') {
          const target = Array.isArray(error.meta?.target)
            ? error.meta.target.map(String)
            : [String(error.meta?.target ?? '')];
          const constraint = String(error.meta?.constraint ?? '');
          const isPendingRunConflict =
            constraint.includes('AssistantRun_one_pending_per_conversation') ||
            (target.includes('conversationId') &&
              !target.includes('clientRequestId') &&
              target.length === 1);
          if (isPendingRunConflict) {
            throw AppError.conflict(ASSISTANT_ACTIVE_RUN_CONFLICT_MESSAGE);
          }
          throw AppError.conflict('Assistant persistence conflict');
        }
        if (error.code === 'P2025') throw AppError.notFound();
        if (error.code === 'P2034') {
          throw AppError.conflict('Concurrent assistant change; retry the request');
        }
      }
      throw error;
    }
  }
};
