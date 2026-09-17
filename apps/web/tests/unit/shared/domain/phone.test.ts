import { describe, expect, it } from 'vitest';

import { formatDominicanPhone } from '../../../../src/shared/domain/phone';

describe('Dominican phone formatting', () => {
  it('masks 10 digits as 809-555-0100', () => {
    expect(formatDominicanPhone('8095550100')).toBe('809-555-0100');
    expect(formatDominicanPhone('809-555-0100')).toBe('809-555-0100');
  });

  it('masks while typing', () => {
    expect(formatDominicanPhone('8')).toBe('8');
    expect(formatDominicanPhone('8095')).toBe('809-5');
    expect(formatDominicanPhone('8095550')).toBe('809-555-0');
  });

  it('normalizes the Dominican country prefix without truncating unsupported values', () => {
    expect(formatDominicanPhone('+1 809-555-0100')).toBe('809-555-0100');
    expect(formatDominicanPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
  });
});
