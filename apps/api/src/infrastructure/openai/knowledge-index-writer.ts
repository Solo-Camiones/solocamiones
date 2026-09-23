import type OpenAI from 'openai';
import { NotFoundError, toFile } from 'openai';

import type { KnowledgeSyncConfig } from './config.js';
import { AssistantProviderError } from './errors.js';
import {
  buildKnowledgeFileAttributes,
  isCorpusFile,
  type KnowledgeFileAttributes,
} from './knowledge-attributes.js';
import { mapOpenAiError } from './map-error.js';
import { logger } from '../logging/index.js';
import type {
  KnowledgeIndexDocument,
  KnowledgeIndexedFile,
  KnowledgeIndexWriter,
} from './types.js';

const KNOWLEDGE_INDEX_POLL_INTERVAL_MS = 1_000;
const KNOWLEDGE_FILE_LIST_PAGE_SIZE = 100;
const KNOWLEDGE_FILE_PURPOSE = 'assistants';
const KNOWLEDGE_FILE_MIME_TYPE = 'text/markdown';
const COMPLETED_INDEX_STATUS = 'completed';

type UploadableFile = Awaited<ReturnType<typeof toFile>>;

export type OpenAiKnowledgeIndexClient = {
  files: {
    create: (body: { file: UploadableFile; purpose: typeof KNOWLEDGE_FILE_PURPOSE }) => Promise<{
      id: string;
    }>;
    delete: (fileId: string) => Promise<unknown>;
  };
  vectorStores: {
    files: {
      createAndPoll: (
        vectorStoreId: string,
        body: { file_id: string; attributes?: KnowledgeFileAttributes },
        options?: { pollIntervalMs?: number },
      ) => Promise<{ id: string; status: string }>;
      delete: (fileId: string, params: { vector_store_id: string }) => Promise<unknown>;
      list: (
        vectorStoreId: string,
        query?: { limit?: number },
      ) => AsyncIterable<{ id: string; attributes?: KnowledgeFileAttributes | null }>;
    };
  };
};

export type OpenAiKnowledgeIndexWriterOptions = {
  client: OpenAiKnowledgeIndexClient | OpenAI;
  config: Pick<KnowledgeSyncConfig, 'vectorStoreId'>;
};

/**
 * Writes the approved corpus into the OpenAI vector store. Never logs document
 * content; only sourceKey, provider file id, and safe error codes.
 */
export class OpenAiKnowledgeIndexWriter implements KnowledgeIndexWriter {
  private readonly client: OpenAiKnowledgeIndexClient;
  private readonly vectorStoreId: string;

  constructor(options: OpenAiKnowledgeIndexWriterOptions) {
    this.client = options.client as unknown as OpenAiKnowledgeIndexClient;
    this.vectorStoreId = options.config.vectorStoreId;
  }

  async indexDocument(document: KnowledgeIndexDocument): Promise<KnowledgeIndexedFile> {
    let uploadedFileId: string | undefined;
    try {
      const file = await toFile(Buffer.from(document.content, 'utf8'), `${document.sourceKey}.md`, {
        type: KNOWLEDGE_FILE_MIME_TYPE,
      });
      const uploaded = await this.client.files.create({ file, purpose: KNOWLEDGE_FILE_PURPOSE });
      uploadedFileId = uploaded.id;

      const attached = await this.client.vectorStores.files.createAndPoll(
        this.vectorStoreId,
        { file_id: uploaded.id, attributes: buildKnowledgeFileAttributes(document) },
        { pollIntervalMs: KNOWLEDGE_INDEX_POLL_INTERVAL_MS },
      );
      if (attached.status !== COMPLETED_INDEX_STATUS) {
        throw AssistantProviderError.invalidResponse(
          `Vector store indexing finished with status ${attached.status}`,
        );
      }
      return { providerFileId: uploaded.id };
    } catch (error) {
      // A half-indexed upload must not linger as retrievable content.
      if (uploadedFileId != null) {
        await this.discardQuietly(uploadedFileId);
      }
      const mapped = mapOpenAiError(error);
      logger.warn(
        { code: mapped.code, retryable: mapped.retryable, sourceKey: document.sourceKey },
        'OpenAI knowledge indexing failed',
      );
      throw mapped;
    }
  }

  async removeDocument(providerFileId: string): Promise<void> {
    try {
      await ignoreNotFound(() =>
        this.client.vectorStores.files.delete(providerFileId, {
          vector_store_id: this.vectorStoreId,
        }),
      );
      await ignoreNotFound(() => this.client.files.delete(providerFileId));
    } catch (error) {
      const mapped = mapOpenAiError(error);
      logger.warn(
        { code: mapped.code, retryable: mapped.retryable, providerFileId },
        'OpenAI knowledge file removal failed',
      );
      throw mapped;
    }
  }

  async listCorpusFileIds(): Promise<string[]> {
    try {
      const fileIds: string[] = [];
      for await (const file of this.client.vectorStores.files.list(this.vectorStoreId, {
        limit: KNOWLEDGE_FILE_LIST_PAGE_SIZE,
      })) {
        if (isCorpusFile(file.attributes)) {
          fileIds.push(file.id);
        }
      }
      return fileIds;
    } catch (error) {
      const mapped = mapOpenAiError(error);
      logger.warn(
        { code: mapped.code, retryable: mapped.retryable },
        'OpenAI knowledge file listing failed',
      );
      throw mapped;
    }
  }

  private async discardQuietly(providerFileId: string): Promise<void> {
    try {
      await this.removeDocument(providerFileId);
    } catch {
      // Orphan cleanup on the next sync removes anything left behind here.
    }
  }
}

async function ignoreNotFound(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof NotFoundError) return;
    throw error;
  }
}
