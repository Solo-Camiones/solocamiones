import { randomUUID } from 'node:crypto';

import { AppError } from '../../infrastructure/errors/app-error.js';
import {
  INVOICE_PDF_TEMPLATE_VERSION,
  pdfkitInvoicePdfRenderer,
  type InvoicePdfRenderer,
} from '../../infrastructure/invoice-pdf/index.js';
import {
  pdfkitQuotePdfRenderer,
  quotePdfFilename,
  type QuotePdfRenderer,
} from '../../infrastructure/quote-pdf/index.js';
import { logger } from '../../infrastructure/logging/index.js';
import { invoiceIdSchema } from '../sales/validation.js';
import { requireInvoiceManager } from '../sales/policies.js';
import { salesTransaction, type SalesTransaction } from '../sales/transaction.js';
import type { InvoiceRecord, InvoiceViewer } from '../sales/types.js';
import { assertAdministrator } from '../users/policies.js';
import {
  PDF_COMPLETED_ONLY_MESSAGE,
  PDF_CONTENT_TYPE,
  PDF_FAILED_MESSAGE,
  PDF_NOT_READY_MESSAGE,
  PDF_REGENERATE_FAILED_ONLY_MESSAGE,
} from './constants.js';
import { toInvoicePdfFacts, toQuotePdfFacts } from './projection.js';
import { invoicePdfFilename } from './filename.js';
import type { InvoicePdfFile } from './types.js';

export class InvoiceDocumentService {
  constructor(
    private readonly transaction: SalesTransaction = salesTransaction,
    private readonly invoiceRenderer: InvoicePdfRenderer = pdfkitInvoicePdfRenderer,
    private readonly quoteRenderer: QuotePdfRenderer = pdfkitQuotePdfRenderer,
  ) {}

  /**
   * PDF is outside the commercial transaction. Failure leaves the sale committed
   * and records FAILED + errorId. A second confirm must not retry.
   */
  async recordInitialGeneration(actorId: string, invoice: InvoiceRecord): Promise<InvoiceRecord> {
    if (invoice.status !== 'COMPLETED' || invoice.pdfStatus != null) return invoice;
    const facts = toInvoicePdfFacts(invoice);
    if (facts == null) return invoice;

    try {
      await this.invoiceRenderer.render(facts);
      return await this.persistStatus(actorId, invoice.id, 'READY', null, null);
    } catch (error) {
      const errorId = randomUUID();
      logger.warn(
        {
          invoiceId: invoice.id,
          errorId,
          reason: error instanceof Error ? error.message : 'unknown',
        },
        'invoice PDF generation failed',
      );
      return await this.persistStatus(actorId, invoice.id, 'FAILED', errorId, null);
    }
  }

  async download(actorId: string, id: string): Promise<InvoicePdfFile> {
    invoiceIdSchema.parse({ id });
    const invoice = await this.transaction(async ({ sales, users }) => {
      requireInvoiceManager(await users.findById(actorId));
      const existing = await sales.findById(id);
      if (!existing) throw AppError.notFound('Invoice not found');
      return existing;
    });

    if (invoice.status === 'DRAFT' || invoice.status === 'QUOTE_DRAFT') {
      throw AppError.conflict(PDF_COMPLETED_ONLY_MESSAGE);
    }
    if (invoice.status === 'QUOTE_ISSUED') {
      return this.downloadQuote(invoice);
    }
    return this.downloadInvoice(invoice);
  }

  /**
   * Named ADMIN-002 recovery: re-render from the immutable snapshot without
   * reconfirming the sale. Eligible only while pdfStatus is FAILED.
   */
  async regenerate(
    actorId: string,
    id: string,
  ): Promise<{ invoice: InvoiceRecord; actor: InvoiceViewer }> {
    invoiceIdSchema.parse({ id });
    const loaded = await this.transaction(async ({ sales, users }) => {
      const actor = await users.findById(actorId);
      assertAdministrator(actor);
      if (actor == null) throw AppError.unauthorized();
      const existing = await sales.findById(id);
      if (!existing) throw AppError.notFound('Invoice not found');
      return { invoice: existing, actor: { role: actor.role } };
    });

    if (
      loaded.invoice.status === 'DRAFT' ||
      loaded.invoice.status === 'QUOTE_DRAFT' ||
      loaded.invoice.status === 'QUOTE_ISSUED'
    ) {
      throw AppError.conflict(PDF_COMPLETED_ONLY_MESSAGE);
    }
    if (loaded.invoice.pdfStatus !== 'FAILED') {
      throw AppError.conflict(PDF_REGENERATE_FAILED_ONLY_MESSAGE);
    }

    const facts = toInvoicePdfFacts(loaded.invoice);
    if (facts == null) throw AppError.conflict(PDF_NOT_READY_MESSAGE);

    let outcome: { status: 'READY'; errorId: null } | { status: 'FAILED'; errorId: string };
    try {
      await this.invoiceRenderer.render(facts);
      outcome = { status: 'READY', errorId: null };
    } catch (error) {
      const errorId = randomUUID();
      logger.warn(
        {
          invoiceId: loaded.invoice.id,
          errorId,
          reason: error instanceof Error ? error.message : 'unknown',
        },
        'invoice PDF regeneration failed',
      );
      outcome = { status: 'FAILED', errorId };
    }

    return {
      invoice: await this.persistStatus(
        actorId,
        loaded.invoice.id,
        outcome.status,
        outcome.errorId,
        'FAILED',
      ),
      actor: loaded.actor,
    };
  }

  private async downloadInvoice(invoice: InvoiceRecord): Promise<InvoicePdfFile> {
    if (invoice.status !== 'COMPLETED' && invoice.status !== 'CANCELLED') {
      throw AppError.conflict(PDF_COMPLETED_ONLY_MESSAGE);
    }
    if (invoice.pdfStatus === 'FAILED') {
      throw AppError.conflict(PDF_FAILED_MESSAGE, {
        ...(invoice.pdfErrorId ? { errorId: invoice.pdfErrorId } : {}),
      });
    }
    if (invoice.pdfStatus !== 'READY') {
      throw AppError.conflict(PDF_NOT_READY_MESSAGE);
    }

    const facts = toInvoicePdfFacts(invoice);
    if (facts == null) throw AppError.conflict(PDF_NOT_READY_MESSAGE);
    const body = await this.invoiceRenderer.render(facts);
    return {
      filename: invoicePdfFilename(facts.number),
      contentType: PDF_CONTENT_TYPE,
      body,
    };
  }

  /**
   * Quotes have no stored pdfStatus. Download renders from issued facts and
   * must not invent invoice-style FAILED/regenerate recovery.
   */
  private async downloadQuote(invoice: InvoiceRecord): Promise<InvoicePdfFile> {
    const facts = toQuotePdfFacts(invoice);
    if (facts == null) throw AppError.conflict(PDF_NOT_READY_MESSAGE);
    const body = await this.quoteRenderer.render(facts);
    return {
      filename: quotePdfFilename(facts.quoteNumber),
      contentType: PDF_CONTENT_TYPE,
      body,
    };
  }

  private persistStatus(
    actorId: string,
    invoiceId: string,
    status: 'READY' | 'FAILED',
    errorId: string | null,
    currentPdfStatus: 'FAILED' | null,
  ): Promise<InvoiceRecord> {
    const generatedAt = new Date();
    return this.transaction(async ({ sales, users, history }) => {
      // ADMIN-002 authorization is rechecked after rendering, in the same
      // transaction that mutates recovery state and appends its audit event.
      if (currentPdfStatus === 'FAILED') {
        assertAdministrator(await users.findById(actorId));
      }
      const recorded = await sales.recordPdfStatus({
        id: invoiceId,
        status,
        errorId,
        generatedAt,
        templateVersion: INVOICE_PDF_TEMPLATE_VERSION,
        currentPdfStatus,
      });
      if (recorded.recorded) {
        if (status === 'READY') {
          await history.append({
            actor: { actorType: 'USER', actorUserId: actorId },
            subjectType: 'INVOICE',
            subjectId: invoiceId,
            eventType: 'INVOICE_PDF_GENERATED',
            payload: {
              status: 'READY',
              errorId: null,
              templateVersion: INVOICE_PDF_TEMPLATE_VERSION,
            },
          });
        } else if (errorId != null) {
          await history.append({
            actor: { actorType: 'USER', actorUserId: actorId },
            subjectType: 'INVOICE',
            subjectId: invoiceId,
            eventType: 'INVOICE_PDF_FAILED',
            payload: { status: 'FAILED', errorId, templateVersion: INVOICE_PDF_TEMPLATE_VERSION },
          });
        }
      } else if (currentPdfStatus === 'FAILED') {
        throw AppError.conflict('Concurrent invoice change; retry the request');
      }
      if (!recorded.invoice) throw AppError.notFound('Invoice not found');
      return recorded.invoice;
    });
  }
}
