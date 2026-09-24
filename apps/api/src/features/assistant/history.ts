import {
  ASSISTANT_HISTORY_MAX_CHARS,
  ASSISTANT_HISTORY_MAX_MESSAGES,
} from './constants.js';

export type HistoryMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
};

/**
 * Keeps the newest COMPLETED messages within message and character caps.
 * Drops oldest user+assistant pairs as whole units (M5-T05/T06) — never mid-message.
 */
export function truncateAssistantHistory(
  messages: HistoryMessage[],
  options?: { maxMessages?: number; maxChars?: number },
): HistoryMessage[] {
  const maxMessages = options?.maxMessages ?? ASSISTANT_HISTORY_MAX_MESSAGES;
  const maxChars = options?.maxChars ?? ASSISTANT_HISTORY_MAX_CHARS;

  let selected = messages.slice(-maxMessages);
  while (selected.length > 0 && totalChars(selected) > maxChars) {
    const dropCount = pairDropCount(selected);
    if (dropCount <= 0) break;
    selected = selected.slice(dropCount);
  }
  return selected;
}

function totalChars(messages: HistoryMessage[]): number {
  return messages.reduce((sum, message) => sum + message.content.length, 0);
}

/** Drop the oldest complete pair when possible; otherwise drop a single leading message. */
function pairDropCount(messages: HistoryMessage[]): number {
  if (messages.length >= 2) {
    const [first, second] = messages;
    if (first.role === 'USER' && second.role === 'ASSISTANT') {
      return 2;
    }
  }
  return messages.length > 0 ? 1 : 0;
}
