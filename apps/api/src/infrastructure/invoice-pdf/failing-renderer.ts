import { SIMULATED_PDF_FAILURE_REASON } from './constants.js';
import type { InvoicePdfRenderer } from './types.js';

/** Test double: never writes a document. Used to prove SALE-004 failure does not roll back the sale. */
export const failingInvoicePdfRenderer: InvoicePdfRenderer = {
  render() {
    return Promise.reject(new Error(SIMULATED_PDF_FAILURE_REASON));
  },
};
