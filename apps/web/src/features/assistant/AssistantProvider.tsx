import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type {
  AssistantConversation,
  AssistantMessage,
  AssistantSource,
  AssistantStreamEvent,
} from '../../api/contracts/assistant';
import type { AssistantRepository } from '../../api/contracts/repositories';
import { HttpError, toAppError } from '../../api/client/http-client';
import type { AppError } from '../../shared/auth/types';

import { ASSISTANT_MAX_INPUT_CHARS } from './constants';
import { readStoredConversationId, writeStoredConversationId } from './conversation-storage';

type StreamPhase = 'idle' | 'streaming' | 'consulting';

type LastAttempt = {
  content: string;
  clientRequestId: string;
  /** True when the client never saw a terminal SSE done/error — id may be reused. */
  ambiguous: boolean;
};

type AssistantContextValue = {
  open: boolean;
  openPanel: () => void;
  closePanel: () => void;
  conversations: AssistantConversation[];
  conversationsPage: number;
  conversationsHasMore: boolean;
  conversationsLoading: boolean;
  loadMoreConversations: () => Promise<void>;
  selectedConversationId: string | null;
  selectConversation: (id: string) => Promise<void>;
  createConversation: () => Promise<void>;
  deleteConversation: (id: string) => Promise<ResultLike>;
  messages: AssistantMessage[];
  messagesPage: number;
  messagesHasMore: boolean;
  messagesLoading: boolean;
  loadMoreMessages: () => Promise<void>;
  draft: string;
  setDraft: (value: string) => void;
  sendMessage: () => Promise<void>;
  stopStreaming: () => void;
  retryLast: () => Promise<void>;
  canRetry: boolean;
  streamPhase: StreamPhase;
  streamingText: string;
  streamingSources: AssistantSource[];
  streamError: AppError | null;
  panelError: AppError | null;
};

type ResultLike = { ok: true } | { ok: false; error: AppError };

const AssistantContext = createContext<AssistantContextValue | null>(null);

export type AssistantProviderProps = {
  children: ReactNode;
  /** Required: composition root only exports this in HTTP mode. */
  repository: AssistantRepository;
};

export function AssistantProvider({ children, repository }: AssistantProviderProps) {
  const repo = repository;
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [conversationsPage, setConversationsPage] = useState(0);
  const [conversationsTotal, setConversationsTotal] = useState(0);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    () => readStoredConversationId(),
  );
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [messagesOldestPage, setMessagesOldestPage] = useState(0);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [streamPhase, setStreamPhase] = useState<StreamPhase>('idle');
  const [streamingText, setStreamingText] = useState('');
  const [streamingSources, setStreamingSources] = useState<AssistantSource[]>([]);
  const [streamError, setStreamError] = useState<AppError | null>(null);
  const [panelError, setPanelError] = useState<AppError | null>(null);
  const [lastAttempt, setLastAttempt] = useState<LastAttempt | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const streamPhaseRef = useRef(streamPhase);
  streamPhaseRef.current = streamPhase;

  const conversationsHasMore =
    conversations.length > 0 && conversations.length < conversationsTotal;
  // Messages API is ascending; we open on the last page and prepend older pages.
  const messagesHasMore = messagesOldestPage > 1;

  const openPanel = useCallback(() => setOpen(true), []);
  const closePanel = useCallback(() => setOpen(false), []);

  const refreshConversations = useCallback(async () => {
    setConversationsLoading(true);
    setPanelError(null);
    const result = await repo.listConversations(1);
    setConversationsLoading(false);
    if (!result.ok) {
      setPanelError(result.error);
      return;
    }
    setConversations(result.value.items);
    setConversationsPage(1);
    setConversationsTotal(result.value.total);
  }, [repo]);

  const loadMoreConversations = useCallback(async () => {
    if (conversationsLoading || !conversationsHasMore) return;
    const nextPage = conversationsPage + 1;
    setConversationsLoading(true);
    const result = await repo.listConversations(nextPage);
    setConversationsLoading(false);
    if (!result.ok) {
      setPanelError(result.error);
      return;
    }
    setConversations((prev) => [...prev, ...result.value.items]);
    setConversationsPage(nextPage);
    setConversationsTotal(result.value.total);
  }, [conversationsHasMore, conversationsLoading, conversationsPage, repo]);

  const loadLatestMessages = useCallback(
    async (conversationId: string) => {
      setMessagesLoading(true);
      const first = await repo.listMessages(conversationId, 1);
      if (!first.ok) {
        setMessagesLoading(false);
        setPanelError(first.error);
        return;
      }
      const pageSize = first.value.pageSize;
      const totalPages = Math.max(1, Math.ceil(first.value.total / pageSize));
      if (totalPages === 1) {
        setMessages(first.value.items);
        setMessagesOldestPage(1);
        setMessagesLoading(false);
        return;
      }
      const last = await repo.listMessages(conversationId, totalPages);
      setMessagesLoading(false);
      if (!last.ok) {
        setPanelError(last.error);
        return;
      }
      setMessages(last.value.items);
      setMessagesOldestPage(totalPages);
    },
    [repo],
  );

  const selectConversation = useCallback(
    async (id: string) => {
      setSelectedConversationId(id);
      writeStoredConversationId(id);
      setMessages([]);
      setMessagesOldestPage(0);
      setStreamError(null);
      setStreamingText('');
      setStreamingSources([]);
      setCanRetry(false);
      setLastAttempt(null);
      await loadLatestMessages(id);
    },
    [loadLatestMessages],
  );

  const loadMoreMessages = useCallback(async () => {
    if (!selectedConversationId || messagesLoading || !messagesHasMore) return;
    const previousPage = messagesOldestPage - 1;
    setMessagesLoading(true);
    const result = await repo.listMessages(selectedConversationId, previousPage);
    setMessagesLoading(false);
    if (!result.ok) {
      setPanelError(result.error);
      return;
    }
    setMessages((prev) => [...result.value.items, ...prev]);
    setMessagesOldestPage(previousPage);
  }, [
    messagesHasMore,
    messagesLoading,
    messagesOldestPage,
    repo,
    selectedConversationId,
  ]);

  const createConversation = useCallback(async () => {
    setPanelError(null);
    const result = await repo.createConversation();
    if (!result.ok) {
      setPanelError(result.error);
      return;
    }
    setConversations((prev) => [result.value, ...prev]);
    setConversationsTotal((total) => total + 1);
    await selectConversation(result.value.id);
  }, [repo, selectConversation]);

  const deleteConversation = useCallback(
    async (id: string): Promise<ResultLike> => {
      const result = await repo.deleteConversation(id);
      if (!result.ok) return result;
      setConversations((prev) => prev.filter((item) => item.id !== id));
      setConversationsTotal((total) => Math.max(0, total - 1));
      if (selectedConversationId === id) {
        setSelectedConversationId(null);
        writeStoredConversationId(null);
        setMessages([]);
        setMessagesOldestPage(0);
      }
      return { ok: true };
    },
    [repo, selectedConversationId],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runStream = useCallback(
    async (conversationId: string, content: string, clientRequestId: string) => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      setStreamPhase('consulting');
      setStreamingText('');
      setStreamingSources([]);
      setStreamError(null);
      setCanRetry(false);
      setLastAttempt({ content, clientRequestId, ambiguous: true });

      let sawTerminal = false;
      let assembled = '';
      let sources: AssistantSource[] = [];
      let assistantMessageId: string | null = null;
      let userMessageId: string | null = null;

      try {
        for await (const event of repo.streamMessage({
          conversationId,
          content,
          clientRequestId,
          signal: abort.signal,
        })) {
          applyStreamEvent(event, {
            onMetadata(metadata) {
              userMessageId = metadata.userMessageId;
              setStreamPhase('streaming');
            },
            onDelta(text) {
              assembled += text;
              setStreamingText(assembled);
              setStreamPhase('streaming');
            },
            onSources(next) {
              sources = next;
              setStreamingSources(next);
            },
            onDone(done) {
              sawTerminal = true;
              assistantMessageId = done.assistantMessageId;
            },
            onError(errorEvent) {
              sawTerminal = true;
              setStreamError({
                code: 'INTERNAL',
                message: errorEvent.message,
                errorId: errorEvent.errorId,
                details: { code: errorEvent.code, retryable: errorEvent.retryable },
              });
              setCanRetry(true);
              setLastAttempt({ content, clientRequestId, ambiguous: false });
            },
          });
        }

        if (sawTerminal && assistantMessageId) {
          const now = new Date().toISOString();
          const userMessage: AssistantMessage = {
            id: userMessageId ?? `local-user-${clientRequestId}`,
            role: 'USER',
            status: 'COMPLETED',
            content,
            clientRequestId,
            createdAt: now,
            completedAt: now,
            sources: [],
          };
          const assistantMessage: AssistantMessage = {
            id: assistantMessageId,
            role: 'ASSISTANT',
            status: 'COMPLETED',
            content: assembled,
            clientRequestId: null,
            createdAt: now,
            completedAt: now,
            sources,
          };
          setMessages((prev) => [...prev, userMessage, assistantMessage]);
          setStreamingText('');
          setStreamingSources([]);
          setLastAttempt(null);
          setCanRetry(false);
          void refreshConversations();
        } else if (!sawTerminal) {
          // Stream ended without done/error — treat as ambiguous for idempotent retry.
          setCanRetry(true);
          setLastAttempt({ content, clientRequestId, ambiguous: true });
          setStreamError({
            code: 'NETWORK',
            message: 'La respuesta se interrumpió. Puede reintentar de forma segura.',
          });
        }
      } catch (error) {
        const appError = error instanceof HttpError ? error.appError : toAppError(error);
        const aborted = abort.signal.aborted;
        if (aborted) {
          setStreamError({
            code: 'INTERNAL',
            message: 'Consulta detenida.',
          });
          setCanRetry(true);
          setLastAttempt({ content, clientRequestId, ambiguous: false });
        } else if (!sawTerminal) {
          setStreamError(appError);
          setCanRetry(true);
          setLastAttempt({ content, clientRequestId, ambiguous: true });
        } else {
          setStreamError(appError);
          setCanRetry(true);
          setLastAttempt({ content, clientRequestId, ambiguous: false });
        }
      } finally {
        if (abortRef.current === abort) {
          abortRef.current = null;
        }
        setStreamPhase('idle');
      }
    },
    [refreshConversations, repo],
  );

  const sendMessage = useCallback(async () => {
    const content = draft.trim();
    if (!content || content.length > ASSISTANT_MAX_INPUT_CHARS) return;
    if (streamPhaseRef.current !== 'idle') return;

    let conversationId = selectedConversationId;
    if (!conversationId) {
      const created = await repo.createConversation();
      if (!created.ok) {
        setPanelError(created.error);
        return;
      }
      conversationId = created.value.id;
      setConversations((prev) => [created.value, ...prev]);
      setSelectedConversationId(conversationId);
      writeStoredConversationId(conversationId);
      // Mark the empty thread as loaded so the restore effect does not wipe the stream.
      setMessages([]);
      setMessagesOldestPage(1);
    }

    setDraft('');
    const clientRequestId = crypto.randomUUID();
    await runStream(conversationId, content, clientRequestId);
  }, [draft, repo, runStream, selectedConversationId]);

  const retryLast = useCallback(async () => {
    if (!lastAttempt || !selectedConversationId || streamPhaseRef.current !== 'idle') return;
    const clientRequestId = lastAttempt.ambiguous
      ? lastAttempt.clientRequestId
      : crypto.randomUUID();
    await runStream(selectedConversationId, lastAttempt.content, clientRequestId);
  }, [lastAttempt, runStream, selectedConversationId]);

  useEffect(() => {
    if (!open) return;
    void refreshConversations();
  }, [open, refreshConversations]);

  useEffect(() => {
    if (!open || !selectedConversationId) return;
    if (messagesOldestPage > 0) return;
    void loadLatestMessages(selectedConversationId);
  }, [loadLatestMessages, messagesOldestPage, open, selectedConversationId]);

  const value = useMemo<AssistantContextValue>(
    () => ({
      open,
      openPanel,
      closePanel,
      conversations,
      conversationsPage,
      conversationsHasMore,
      conversationsLoading,
      loadMoreConversations,
      selectedConversationId,
      selectConversation,
      createConversation,
      deleteConversation,
      messages,
      messagesPage: messagesOldestPage,
      messagesHasMore,
      messagesLoading,
      loadMoreMessages,
      draft,
      setDraft,
      sendMessage,
      stopStreaming,
      retryLast,
      canRetry,
      streamPhase,
      streamingText,
      streamingSources,
      streamError,
      panelError,
    }),
    [
      open,
      openPanel,
      closePanel,
      conversations,
      conversationsPage,
      conversationsHasMore,
      conversationsLoading,
      loadMoreConversations,
      selectedConversationId,
      selectConversation,
      createConversation,
      deleteConversation,
      messages,
      messagesOldestPage,
      messagesHasMore,
      messagesLoading,
      loadMoreMessages,
      draft,
      sendMessage,
      stopStreaming,
      retryLast,
      canRetry,
      streamPhase,
      streamingText,
      streamingSources,
      streamError,
      panelError,
    ],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const value = useContext(AssistantContext);
  if (!value) {
    throw new Error('useAssistant must be used within AssistantProvider');
  }
  return value;
}

function applyStreamEvent(
  event: AssistantStreamEvent,
  handlers: {
    onMetadata: (event: Extract<AssistantStreamEvent, { type: 'metadata' }>) => void;
    onDelta: (text: string) => void;
    onSources: (sources: AssistantSource[]) => void;
    onDone: (event: Extract<AssistantStreamEvent, { type: 'done' }>) => void;
    onError: (event: Extract<AssistantStreamEvent, { type: 'error' }>) => void;
  },
): void {
  switch (event.type) {
    case 'metadata':
      handlers.onMetadata(event);
      break;
    case 'delta':
      handlers.onDelta(event.text);
      break;
    case 'sources':
      handlers.onSources(event.sources);
      break;
    case 'done':
      handlers.onDone(event);
      break;
    case 'error':
      handlers.onError(event);
      break;
  }
}
