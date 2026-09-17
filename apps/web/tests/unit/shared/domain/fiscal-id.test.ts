import { describe, expect, it } from 'vitest';

import {
  formatCedula,
  formatFiscalId,
  formatRnc,
  inferFiscalIdKind,
  maskFiscalIdInput,
} from '../../../../src/shared/domain/fiscal-id';

describe('fiscal id formatting', () => {
  it('formats a 9-digit RNC as 1-31-12345-6', () => {
    expect(formatFiscalId('131123456')).toBe('1-31-12345-6');
    expect(formatRnc('131123456')).toBe('1-31-12345-6');
    expect(inferFiscalIdKind('1-31-12345-6')).toBe('RNC');
  });

  it('formats an 11-digit cédula as 001-0123456-7', () => {
    expect(formatFiscalId('00101234567')).toBe('001-0123456-7');
    expect(formatCedula('00101234567')).toBe('001-0123456-7');
    expect(inferFiscalIdKind('00101234567')).toBe('CEDULA');
  });

  it('masks partial input for the selected kind', () => {
    expect(maskFiscalIdInput('RNC', '131')).toBe('1-31');
    expect(maskFiscalIdInput('CEDULA', '0010123')).toBe('001-0123');
  });
});
