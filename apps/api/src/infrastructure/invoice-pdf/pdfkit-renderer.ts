import {
  COMMERCIAL_DOCUMENT_CONTACT_LAYOUT,
  renderCommercialDocument,
} from '../document-pdf/pdfkit-commercial-document.js';
import {
  INVOICE_PDF_INTERNAL_NOTICE,
  INVOICE_PDF_NCF_FIELD,
  INVOICE_PDF_TEMPLATE_V4,
  INVOICE_PDF_THANK_YOU,
} from './constants.js';
import type { InvoicePdfFacts, InvoicePdfRenderer } from './types.js';

function renderInternalV4(facts: InvoicePdfFacts): Promise<Buffer> {
  return renderCommercialDocument(
    {
      number: facts.number,
      currency: facts.currency,
      customerName: facts.customerName,
      customerRnc: facts.customerRnc,
      customerPhone: facts.customerPhone,
      sellerName: facts.sellerName,
      issuedAt: facts.confirmedAt,
      secondaryDate: facts.dueDate,
      lines: facts.lines,
      totals: facts.totals,
      originQuoteNumber: facts.originQuoteNumber,
      cancellation:
        facts.status === 'CANCELLED'
          ? {
              cancelledAt: facts.cancelledAt,
              reason: facts.cancelReason,
              cancelledByName: facts.cancelledByName,
            }
          : undefined,
    },
    {
      title: 'FACTURA',
      subject: INVOICE_PDF_NCF_FIELD,
      customerLabel: 'FACTURAR A',
      secondaryDateLabel: 'Vencimiento',
      thankYou: INVOICE_PDF_THANK_YOU,
      internalNotice: INVOICE_PDF_INTERNAL_NOTICE,
      ncfField: INVOICE_PDF_NCF_FIELD,
      contactLayout: COMMERCIAL_DOCUMENT_CONTACT_LAYOUT.invoice,
    },
  );
}

export const pdfkitInvoicePdfRenderer: InvoicePdfRenderer = {
  render(facts) {
    if (facts.templateVersion !== INVOICE_PDF_TEMPLATE_V4) {
      return Promise.reject(
        new Error(`Unsupported invoice PDF template version: ${facts.templateVersion}`),
      );
    }
    return renderInternalV4(facts);
  },
};
