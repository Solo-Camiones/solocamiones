import type { KeyboardEvent } from 'react';

import { ASSISTANT_MAX_INPUT_CHARS } from './constants';
import { useAssistant } from './AssistantProvider';
import { Button, Textarea } from '../../shared/ui';

export function AssistantComposer() {
  const {
    draft,
    setDraft,
    sendMessage,
    stopStreaming,
    retryLast,
    canRetry,
    streamPhase,
  } = useAssistant();

  const trimmed = draft.trim();
  const overLimit = draft.length > ASSISTANT_MAX_INPUT_CHARS;
  const busy = streamPhase !== 'idle';
  const canSend = trimmed.length > 0 && !overLimit && !busy;

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (canSend) void sendMessage();
    }
  }

  return (
    <div className="shrink-0 space-y-2 border-t border-navy-100 bg-white p-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={busy}
          placeholder="Escribe tu pregunta…"
          aria-label="Mensaje para el asistente"
          className="min-h-11 flex-1 resize-none"
        />
        {busy ? (
          <Button variant="secondary" onClick={stopStreaming} className="shrink-0">
            Detener
          </Button>
        ) : (
          <Button onClick={() => void sendMessage()} disabled={!canSend} className="shrink-0">
            Enviar
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-navy-400">
        <span className={overLimit ? 'text-red-600' : undefined}>
          {draft.length}/{ASSISTANT_MAX_INPUT_CHARS}
        </span>
        {canRetry && !busy ? (
          <Button variant="ghost" size="sm" onClick={() => void retryLast()}>
            Reintentar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
