import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../infrastructure/errors/app-error.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { classifyAssistantError } from './classify-error.js';
import { AssistantService } from './service.js';
import { openAssistantSse, startSseHeartbeat } from './sse.js';

function assistantServiceOf(req: Request): AssistantService {
  const service = req.app.locals.assistantService as AssistantService | undefined;
  if (!service) {
    throw new Error('assistantService is not configured on the app');
  }
  return service;
}

function actor(req: Request): string {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth.userId;
}

function conversationId(req: Request): string {
  return (req.validated?.params as { id: string }).id;
}

function page(req: Request): number {
  return (req.validated?.query as { page: number } | undefined)?.page ?? 1;
}

export async function postConversation(req: Request, res: Response): Promise<void> {
  const conversation = await assistantServiceOf(req).createConversation(actor(req));
  res.status(201).json(conversation);
}

export async function getConversations(req: Request, res: Response): Promise<void> {
  res.json(await assistantServiceOf(req).listConversations(actor(req), page(req)));
}

export async function getMessages(req: Request, res: Response): Promise<void> {
  res.json(
    await assistantServiceOf(req).listMessages(actor(req), conversationId(req), page(req)),
  );
}

export async function deleteConversation(req: Request, res: Response): Promise<void> {
  await assistantServiceOf(req).deleteConversation(actor(req), conversationId(req));
  res.status(204).send();
}

/**
 * Persist question and stream the assistant run.
 * Preflight AppErrors use the normal HTTP envelope; after the first domain event, errors use SSE.
 */
export async function postMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const service = assistantServiceOf(req);
  const body = req.validated?.body as { content: string; clientRequestId: string };
  const input = {
    conversationId: conversationId(req),
    userId: actor(req),
    content: body.content,
    clientRequestId: body.clientRequestId,
    requestId: req.requestId,
  };

  let prepared;
  try {
    prepared = await service.prepareStreamMessage(input);
  } catch (error) {
    next(error);
    return;
  }

  const abort = new AbortController();
  // Abort only on client disconnect while the SSE response is still open.
  // `req` 'close' can fire after the body is consumed and must not cancel an active run.
  const onResponseClose = () => {
    if (!res.writableEnded) {
      abort.abort();
    }
  };
  res.on('close', onResponseClose);

  const iterator = service
    .streamPrepared(prepared, { ...input, signal: abort.signal })
    [Symbol.asyncIterator]();

  let first;
  try {
    first = await iterator.next();
  } catch (error) {
    res.off('close', onResponseClose);
    next(error);
    return;
  }

  const writer = openAssistantSse(res);
  const stopHeartbeat = startSseHeartbeat(writer);
  let runId: string | undefined;
  let terminal: 'done' | 'error' | 'aborted' | 'empty' = first.done ? 'empty' : 'done';

  try {
    if (!first.done) {
      if (first.value.type === 'metadata') {
        runId = first.value.runId;
      }
      if (first.value.type === 'error') {
        terminal = 'error';
      }
      writer.writeDomainEvent(first.value);

      for (;;) {
        const nextEvent = await iterator.next();
        if (nextEvent.done) break;
        if (nextEvent.value.type === 'metadata') {
          runId = nextEvent.value.runId;
        }
        if (nextEvent.value.type === 'error') {
          terminal = 'error';
        }
        if (nextEvent.value.type === 'done') {
          terminal = 'done';
        }
        writer.writeDomainEvent(nextEvent.value);
      }
    }
  } catch (error) {
    terminal = abort.signal.aborted ? 'aborted' : 'error';
    if (!writer.writableEnded) {
      const classified = classifyAssistantError(error);
      writer.writeDomainEvent({
        type: 'error',
        code: classified.code,
        message: classified.message,
        retryable: classified.retryable,
        errorId: randomUUID(),
      });
    }
  } finally {
    stopHeartbeat();
    res.off('close', onResponseClose);
    writer.end();
    logger.info(
      {
        requestId: req.requestId,
        runId,
        conversationId: input.conversationId,
        result: terminal,
      },
      'assistant stream finished',
    );
  }
}
