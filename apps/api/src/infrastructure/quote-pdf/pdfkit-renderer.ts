import {
  COMMERCIAL_DOCUMENT_CONTACT_LAYOUT,
  renderCommercialDocument,
} from '../document-pdf/pdfkit-commercial-document.js';
import { QUOTE_PDF_THANK_YOU, QUOTE_PDF_TITLE } from './constants.js';
import type { QuotePdfRenderer } from './types.js';

export const pdfkitQuotePdfRenderer: QuotePdfRenderer = {
  render(facts) {
    if (facts.status !== 'QUOTE_ISSUED') {
      return Promise.reject(new Error(`Unsupported quote PDF status: ${String(facts.status)}`));
    }
    return renderCommercialDocument(
      {
        number: facts.quoteNumber,
        currency: facts.currency,
        customerName: facts.customerName,
        customerRnc: facts.customerRnc,
        customerPhone: facts.customerPhone,
        sellerName: facts.sellerName,
        issuedAt: facts.quoteIssuedAt,
        secondaryDate: facts.quoteExpiresAt,
        lines: facts.lines,
        totals: facts.totals,
      },
      {
        title: QUOTE_PDF_TITLE,
        subject: QUOTE_PDF_TITLE,
        customerLabel: 'CLIENTE',
        secondaryDateLabel: 'Vigente hasta',
        thankYou: QUOTE_PDF_THANK_YOU,
        contactLayout: COMMERCIAL_DOCUMENT_CONTACT_LAYOUT.quote,
      },
    );
  },
};
