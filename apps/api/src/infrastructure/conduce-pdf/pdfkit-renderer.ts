import {
  COMMERCIAL_DOCUMENT_CONTACT_LAYOUT,
  renderCommercialDocument,
} from '../document-pdf/pdfkit-commercial-document.js';
import { CONDUCE_PDF_THANK_YOU, CONDUCE_PDF_TITLE } from './constants.js';
import type { ConducePdfRenderer } from './types.js';

/**
 * Conduce is never fiscal (CON-004): no NCF field, no payment state, no balance.
 * Secondary date is commercial due date only — not a CxC projection.
 */
export const pdfkitConducePdfRenderer: ConducePdfRenderer = {
  render(facts) {
    if (facts.status !== 'CONDUCE' && facts.status !== 'CANCELLED') {
      return Promise.reject(new Error(`Unsupported conduce PDF status: ${String(facts.status)}`));
    }
    return renderCommercialDocument(
      {
        number: facts.conduceNumber,
        currency: facts.currency,
        customerName: facts.customerName,
        customerRnc: facts.customerRnc,
        customerPhone: facts.customerPhone,
        sellerName: facts.sellerName,
        issuedAt: facts.conduceIssuedAt,
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
        title: CONDUCE_PDF_TITLE,
        subject: CONDUCE_PDF_TITLE,
        customerLabel: 'CLIENTE',
        secondaryDateLabel: 'Vencimiento',
        secondaryDateAsCalendarDate: true,
        thankYou: CONDUCE_PDF_THANK_YOU,
        contactLayout: COMMERCIAL_DOCUMENT_CONTACT_LAYOUT.quote,
      },
    );
  },
};
