import {
  ASSISTANT_CONVERSATION_TITLE_MAX_LENGTH,
  ASSISTANT_TITLE_FROM_CONTENT_CHARS,
} from './constants.js';

/** Local title from the first user message — no provider call (M5-T21). */
export function titleFromUserContent(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return '';

  const sliced = normalized.slice(0, ASSISTANT_TITLE_FROM_CONTENT_CHARS);
  const capped =
    sliced.length > ASSISTANT_CONVERSATION_TITLE_MAX_LENGTH
      ? sliced.slice(0, ASSISTANT_CONVERSATION_TITLE_MAX_LENGTH)
      : sliced;
  return capped;
}
