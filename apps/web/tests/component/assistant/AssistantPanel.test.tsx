// @vitest-environment jsdom

import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssistantRepository } from '../../../src/api/contracts/repositories';
import type { StreamAssistantMessageInput } from '../../../src/api/contracts/assistant';
import {
  AssistantLauncher,
  AssistantPanel,
  AssistantProvider,
} from '../../../src/features/assistant';
import { CAPABILITY_PRESETS } from '../../../src/shared/config/capabilities';
import { ok } from '../../../src/shared/auth/types';
import { createAuthValue, renderWithProviders } from '../../support/render';
import '../../support/dom';

function createFakeRepository(overrides: Partial<AssistantRepository> = {}): AssistantRepository {
  return {
    createConversation: vi.fn(async () =>
      ok({
        id: 'c1',
        title: 'Nueva conversación',
        createdAt: '2026-09-24T00:00:00.000Z',
        updatedAt: '2026-09-24T00:00:00.000Z',
        lastMessageAt: '2026-09-24T00:00:00.000Z',
      }),
    ),
    listConversations: vi.fn(async () =>
      ok({
        items: [
          {
            id: 'c1',
            title: 'Consulta FAC',
            createdAt: '2026-09-24T00:00:00.000Z',
            updatedAt: '2026-09-24T00:00:00.000Z',
            lastMessageAt: '2026-09-24T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ),
    listMessages: vi.fn(async () => ok({ items: [], total: 0, page: 1, pageSize: 50 })),
    streamMessage: vi.fn(async function* () {
      yield {
        type: 'metadata' as const,
        conversationId: 'c1',
        userMessageId: 'u1',
        runId: 'r1',
      };
      yield { type: 'delta' as const, text: 'Respuesta de prueba' };
      yield {
        type: 'sources' as const,
        sources: [
          {
            type: 'DOCUMENT' as const,
            sourceKey: 'guide-customers',
            title: 'Clientes',
            locator: '§1',
            sortOrder: 0,
            appPath: null,
            excerpt: null,
            score: 0.9,
            asOf: null,
          },
        ],
      };
      yield {
        type: 'done' as const,
        assistantMessageId: 'a1',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      };
    }),
    deleteConversation: vi.fn(async () => ok(undefined)),
    ...overrides,
  };
}

function renderAssistantShell(repository: AssistantRepository = createFakeRepository()) {
  const capabilities = {
    ...CAPABILITY_PRESETS.prototype,
    assistant: true,
  };
  const auth = createAuthValue('ADMINISTRATOR');

  return {
    repository,
    ...renderWithProviders(
      <AssistantProvider repository={repository}>
        <AssistantLauncher />
        <AssistantPanel />
      </AssistantProvider>,
      { auth, capabilities },
    ),
  };
}

describe('Assistant panel streaming', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('opens for Administrator, streams a reply, and shows sources', async () => {
    const user = userEvent.setup();
    renderAssistantShell();

    await user.click(screen.getByRole('button', { name: 'Abrir asistente' }));
    expect(await screen.findByRole('dialog', { name: 'Asistente' })).toBeVisible();

    const input = screen.getByLabelText('Mensaje para el asistente');
    await user.type(input, '¿Cómo busco un cliente?');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Respuesta de prueba')).toBeVisible();
    expect(screen.getByText('Clientes')).toBeVisible();
    expect(screen.getByText(/Verifica datos críticos/i)).toBeVisible();
  });

  it('stops an in-flight stream via AbortSignal', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const repository = createFakeRepository({
      streamMessage: vi.fn(async function* (input: StreamAssistantMessageInput) {
        yield {
          type: 'metadata' as const,
          conversationId: 'c1',
          userMessageId: 'u1',
          runId: 'r1',
        };
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
          if (input.signal?.aborted) {
            onAbort();
            return;
          }
          input.signal?.addEventListener('abort', onAbort, { once: true });
          void gate.then(() => {
            input.signal?.removeEventListener('abort', onAbort);
            resolve();
          });
        });
        yield { type: 'delta' as const, text: 'tarde' };
        yield {
          type: 'done' as const,
          assistantMessageId: 'a1',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        };
      }),
    });

    renderAssistantShell(repository);
    await user.click(screen.getByRole('button', { name: 'Abrir asistente' }));
    await user.type(screen.getByLabelText('Mensaje para el asistente'), 'hola');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('button', { name: 'Detener' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Detener' }));
    release();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Enviar' })).toBeVisible();
    });
    expect(screen.queryByText('tarde')).not.toBeInTheDocument();
  });

  it.each([
    {
      navigation: 'cambiar de conversación',
      navigate: async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole('button', { name: 'Segunda conversación' }));
        expect(await screen.findByText('Mensaje exclusivo de c2')).toBeVisible();
      },
      expectedStoredConversationId: 'c2',
    },
    {
      navigation: 'crear una conversación',
      navigate: async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole('button', { name: 'Nueva' }));
        await waitFor(() => {
          expect(sessionStorage.getItem('solocamiones.assistant.conversationId')).toBe('c3');
        });
      },
      expectedStoredConversationId: 'c3',
    },
    {
      navigation: 'eliminar la conversación activa',
      navigate: async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(
          screen.getByRole('button', { name: 'Eliminar conversación Primera conversación' }),
        );
        await user.click(screen.getByRole('button', { name: 'Eliminar' }));
        await waitFor(() => {
          expect(sessionStorage.getItem('solocamiones.assistant.conversationId')).toBeNull();
        });
      },
      expectedStoredConversationId: null,
    },
  ])(
    'desacopla el stream al $navigation aunque el repositorio ignore AbortSignal',
    async ({ navigate, expectedStoredConversationId }) => {
      const user = userEvent.setup();
      sessionStorage.setItem('solocamiones.assistant.conversationId', 'c1');

      let releaseStream!: () => void;
      const streamGate = new Promise<void>((resolve) => {
        releaseStream = resolve;
      });
      let finishStream!: () => void;
      const streamFinished = new Promise<void>((resolve) => {
        finishStream = resolve;
      });
      let streamSignal: AbortSignal | undefined;

      const conversations = [
        {
          id: 'c1',
          title: 'Primera conversación',
          createdAt: '2026-09-24T00:00:00.000Z',
          updatedAt: '2026-09-24T00:00:00.000Z',
          lastMessageAt: '2026-09-24T00:00:00.000Z',
        },
        {
          id: 'c2',
          title: 'Segunda conversación',
          createdAt: '2026-09-24T00:01:00.000Z',
          updatedAt: '2026-09-24T00:01:00.000Z',
          lastMessageAt: '2026-09-24T00:01:00.000Z',
        },
      ];

      const repository = createFakeRepository({
        createConversation: vi.fn(async () =>
          ok({
            id: 'c3',
            title: 'Nueva conversación',
            createdAt: '2026-09-24T00:02:00.000Z',
            updatedAt: '2026-09-24T00:02:00.000Z',
            lastMessageAt: '2026-09-24T00:02:00.000Z',
          }),
        ),
        listConversations: vi.fn(async () =>
          ok({ items: conversations, total: conversations.length, page: 1, pageSize: 20 }),
        ),
        listMessages: vi.fn(async (conversationId: string) =>
          ok({
            items:
              conversationId === 'c2'
                ? [
                    {
                      id: 'c2-user',
                      role: 'USER' as const,
                      status: 'COMPLETED' as const,
                      content: 'Mensaje exclusivo de c2',
                      clientRequestId: 'request-c2',
                      createdAt: '2026-09-24T00:01:00.000Z',
                      completedAt: '2026-09-24T00:01:00.000Z',
                      sources: [],
                    },
                  ]
                : [],
            total: conversationId === 'c2' ? 1 : 0,
            page: 1,
            pageSize: 50,
          }),
        ),
        streamMessage: vi.fn(async function* (input: StreamAssistantMessageInput) {
          streamSignal = input.signal;
          try {
            yield {
              type: 'metadata' as const,
              conversationId: 'c1',
              userMessageId: 'u1',
              runId: 'r1',
            };
            await streamGate;
            // Deliberately ignore the aborted signal to verify the provider-level ownership guard.
            yield { type: 'delta' as const, text: 'Respuesta tardía de c1' };
            yield {
              type: 'done' as const,
              assistantMessageId: 'a1',
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            };
          } finally {
            finishStream();
          }
        }),
      });

      renderAssistantShell(repository);
      await user.click(screen.getByRole('button', { name: 'Abrir asistente' }));
      await user.type(screen.getByLabelText('Mensaje para el asistente'), 'consulta en c1');
      await user.click(screen.getByRole('button', { name: 'Enviar' }));
      expect(await screen.findByRole('button', { name: 'Detener' })).toBeVisible();

      await navigate(user);

      expect(streamSignal?.aborted).toBe(true);
      expect(sessionStorage.getItem('solocamiones.assistant.conversationId')).toBe(
        expectedStoredConversationId,
      );

      await act(async () => {
        releaseStream();
        await streamFinished;
      });

      expect(screen.queryByText('Respuesta tardía de c1')).not.toBeInTheDocument();
    },
  );
});
