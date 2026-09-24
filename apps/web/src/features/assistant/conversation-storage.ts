import { ASSISTANT_CONVERSATION_STORAGE_KEY } from './constants';

export function readStoredConversationId(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const value = sessionStorage.getItem(ASSISTANT_CONVERSATION_STORAGE_KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredConversationId(conversationId: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (conversationId == null) {
      sessionStorage.removeItem(ASSISTANT_CONVERSATION_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(ASSISTANT_CONVERSATION_STORAGE_KEY, conversationId);
  } catch {
    // Ignore quota / private-mode failures; in-memory state still works.
  }
}
