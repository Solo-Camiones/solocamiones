import type { AssistantConversation, AssistantMessage, AssistantSource } from '@prisma/client';

import type { AssistantSourceView } from './evidence.js';

export type PublicAssistantConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

export type PublicAssistantMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  content: string;
  clientRequestId: string | null;
  createdAt: string;
  completedAt: string | null;
  sources: AssistantSourceView[];
};

export function toPublicConversation(
  conversation: AssistantConversation,
): PublicAssistantConversation {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    lastMessageAt: conversation.lastMessageAt.toISOString(),
  };
}

export function toPublicSource(source: AssistantSource): AssistantSourceView {
  return {
    type: source.type,
    sourceKey: source.sourceKey,
    title: source.title,
    locator: source.locator,
    sortOrder: source.sortOrder,
    appPath: source.appPath,
    excerpt: source.excerpt,
    score: source.score,
    asOf: source.asOf ? source.asOf.toISOString() : null,
  };
}

export function toPublicMessage(
  message: AssistantMessage,
  sources: AssistantSource[] = [],
): PublicAssistantMessage {
  return {
    id: message.id,
    role: message.role,
    status: message.status,
    content: message.content,
    clientRequestId: message.clientRequestId,
    createdAt: message.createdAt.toISOString(),
    completedAt: message.completedAt ? message.completedAt.toISOString() : null,
    sources: message.role === 'ASSISTANT' ? sources.map(toPublicSource) : [],
  };
}
