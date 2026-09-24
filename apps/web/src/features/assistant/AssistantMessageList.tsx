import { useEffect, useRef } from 'react';

import { Button, Empty } from '../../shared/ui';
import { AssistantMarkdown } from './AssistantMarkdown';
import { AssistantSources } from './AssistantSources';
import {
  ASSISTANT_CONSULTING_SOURCES_LABEL,
  ASSISTANT_EMPTY_STATE_DESCRIPTION,
  ASSISTANT_EMPTY_STATE_TITLE,
  ASSISTANT_VERIFICATION_WARNING,
} from './constants';
import { useAssistant } from './AssistantProvider';

export function AssistantMessageList() {
  const {
    messages,
    messagesHasMore,
    messagesLoading,
    loadMoreMessages,
    streamPhase,
    streamingText,
    streamingSources,
    streamError,
    selectedConversationId,
  } = useAssistant();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = bottomRef.current;
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, streamingText, streamPhase]);

  const showEmpty =
    selectedConversationId != null &&
    messages.length === 0 &&
    streamPhase === 'idle' &&
    !messagesLoading;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="shrink-0 border-b border-navy-50 px-4 py-2 text-xs text-navy-400">
        {ASSISTANT_VERIFICATION_WARNING}
      </p>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3" role="log" aria-live="polite">
        {messagesHasMore ? (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              busy={messagesLoading}
              onClick={() => void loadMoreMessages()}
            >
              Cargar mensajes anteriores
            </Button>
          </div>
        ) : null}

        {showEmpty ? (
          <Empty title={ASSISTANT_EMPTY_STATE_TITLE} description={ASSISTANT_EMPTY_STATE_DESCRIPTION} />
        ) : null}

        {messages.map((message) => (
          <article
            key={message.id}
            className={
              message.role === 'USER'
                ? 'ml-6 rounded-xl bg-brand/10 px-3 py-2 text-sm text-navy'
                : 'mr-2 rounded-xl border border-navy-100 bg-white px-3 py-2 text-sm'
            }
          >
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-navy-400">
              {message.role === 'USER' ? 'Tú' : 'Asistente'}
            </p>
            {message.role === 'ASSISTANT' ? (
              <>
                <AssistantMarkdown content={message.content || '(Sin contenido)'} />
                <AssistantSources sources={message.sources} />
              </>
            ) : (
              <p className="whitespace-pre-wrap">{message.content}</p>
            )}
            {message.status === 'FAILED' || message.status === 'CANCELLED' ? (
              <p className="mt-1 text-xs text-red-600">Estado: {message.status}</p>
            ) : null}
          </article>
        ))}

        {streamPhase === 'consulting' ? (
          <p className="text-sm text-navy-400" aria-busy="true">
            {ASSISTANT_CONSULTING_SOURCES_LABEL}
          </p>
        ) : null}

        {streamPhase === 'streaming' || streamingText.length > 0 ? (
          <article className="mr-2 rounded-xl border border-navy-100 bg-white px-3 py-2 text-sm">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-navy-400">
              Asistente
            </p>
            <AssistantMarkdown content={streamingText || '…'} />
            <AssistantSources sources={streamingSources} />
          </article>
        ) : null}

        {streamError ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {streamError.message}
            {streamError.errorId ? ` (${streamError.errorId})` : null}
          </p>
        ) : null}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
