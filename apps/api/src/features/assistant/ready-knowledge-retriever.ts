import type { KnowledgeDocumentRepository } from './knowledge-document-repository.js';
import type {
  KnowledgeChunk,
  KnowledgeRetrieveOptions,
  KnowledgeRetriever,
} from '../../infrastructure/openai/types.js';

export type ReadyKnowledgeDocuments = Pick<KnowledgeDocumentRepository, 'findReadyProviderFileIds'>;

/**
 * Decorator over the provider retriever: PostgreSQL, not the vector store,
 * decides which files are servable. Drops chunks from orphaned uploads and from
 * superseded versions that stay attached while a replacement is indexing.
 */
export class ReadyKnowledgeRetriever implements KnowledgeRetriever {
  constructor(
    private readonly inner: KnowledgeRetriever,
    private readonly documents: ReadyKnowledgeDocuments,
  ) {}

  async retrieve(
    query: string,
    options?: KnowledgeRetrieveOptions,
    signal?: AbortSignal,
  ): Promise<KnowledgeChunk[]> {
    const chunks = await this.inner.retrieve(query, options, signal);
    if (chunks.length === 0) return [];

    const readyFileIds = await this.documents.findReadyProviderFileIds([
      ...new Set(chunks.map((chunk) => chunk.providerFileId)),
    ]);
    return chunks.filter((chunk) => readyFileIds.has(chunk.providerFileId));
  }
}
