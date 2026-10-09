import { describe, expect, it } from 'vitest';

import { invoicePdfFilename } from '../../../src/features/invoice-documents/filename.js';
import { quotePdfFilename } from '../../../src/infrastructure/quote-pdf/index.js';

describe('document PDF filenames', () => {
  it('returns FAC-xxxxxx.pdf for invoices', () => {
    expect(invoicePdfFilename('FAC-000002')).toBe('FAC-000002.pdf');
  });

  it('returns COT-xxxxxx.pdf for quotes', () => {
    expect(quotePdfFilename('COT-000001')).toBe('COT-000001.pdf');
  });
});
