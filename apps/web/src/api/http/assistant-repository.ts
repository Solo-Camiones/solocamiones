import type { AssistantRepository } from '../contracts/repositories';
import {
  createAssistantConversationWithHttp,
  deleteAssistantConversationWithHttp,
  listAssistantConversationsWithHttp,
  listAssistantMessagesWithHttp,
  streamAssistantMessageWithHttp,
} from '../client/assistant-api';

export const httpAssistantRepository: AssistantRepository = {
  createConversation: createAssistantConversationWithHttp,
  listConversations: listAssistantConversationsWithHttp,
  listMessages: listAssistantMessagesWithHttp,
  streamMessage: streamAssistantMessageWithHttp,
  deleteConversation: deleteAssistantConversationWithHttp,
};
