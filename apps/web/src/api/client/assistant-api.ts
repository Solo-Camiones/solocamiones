import type {
  AssistantConversation,
  AssistantConversationPage,
  AssistantMessagePage,
  AssistantStreamEvent,
  StreamAssistantMessageInput,
} from '../contracts/assistant';
import type { Result } from '../../shared/auth/types';
import { HttpError, httpClient, mapResponseError, toAppError } from './http-client';
import { parseAssistantSse } from './parse-assistant-sse';
import { CSRF_HEADERS, request } from './http-result';

const ASSISTANT_PATH = '/api/assistant';

export async function createAssistantConversationWithHttp(): Promise<Result<AssistantConversation>> {
  return request(() =>
    httpClient<AssistantConversation>(`${ASSISTANT_PATH}/conversations`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: '{}',
    }),
  );
}

export async function listAssistantConversationsWithHttp(
  page: number,
): Promise<Result<AssistantConversationPage>> {
  const params = new URLSearchParams({ page: String(page) });
  return request(() =>
    httpClient<AssistantConversationPage>(`${ASSISTANT_PATH}/conversations?${params}`),
  );
}

export async function listAssistantMessagesWithHttp(
  conversationId: string,
  page: number,
): Promise<Result<AssistantMessagePage>> {
  const params = new URLSearchParams({ page: String(page) });
  return request(() =>
    httpClient<AssistantMessagePage>(
      `${ASSISTANT_PATH}/conversations/${conversationId}/messages?${params}`,
    ),
  );
}

export async function deleteAssistantConversationWithHttp(
  conversationId: string,
): Promise<Result<void>> {
  return request(() =>
    httpClient<void>(`${ASSISTANT_PATH}/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: CSRF_HEADERS,
      parseJson: false,
    }),
  );
}

/**
 * Opens the SSE message stream. Pre-stream failures use the normal HTTP envelope;
 * after the body starts, events come from {@link parseAssistantSse}.
 * Throws {@link AppError}-shaped values via {@link HttpError} / {@link toAppError}.
 */
export async function* streamAssistantMessageWithHttp(
  input: StreamAssistantMessageInput,
): AsyncIterable<AssistantStreamEvent> {
  let response: Response;
  try {
    response = await fetch(`${ASSISTANT_PATH}/conversations/${input.conversationId}/messages`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        ...CSRF_HEADERS,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        content: input.content,
        clientRequestId: input.clientRequestId,
      }),
      signal: input.signal,
    });
  } catch (error) {
    throw toAppError(error);
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new HttpError(response.status, mapResponseError(response.status, body));
  }

  if (!response.body) {
    throw toAppError(new TypeError('Missing response body'));
  }

  yield* parseAssistantSse(response.body);
}
