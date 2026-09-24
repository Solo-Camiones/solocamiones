import { describe, expect, it } from 'vitest';

import { toApprovedAppPath } from '../../../../src/features/assistant/approved-app-path';

describe('toApprovedAppPath', () => {
  it('allows approved internal paths', () => {
    expect(toApprovedAppPath('/customers')).toBe('/customers');
    expect(toApprovedAppPath('/receivables')).toBe('/receivables');
    expect(toApprovedAppPath('/profitability')).toBe('/profitability');
    expect(toApprovedAppPath('/sales/550e8400-e29b-41d4-a716-446655440000')).toBe(
      '/sales/550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('rejects external URLs and unknown paths', () => {
    expect(toApprovedAppPath('https://evil.example/customers')).toBeNull();
    expect(toApprovedAppPath('//evil.example/customers')).toBeNull();
    expect(toApprovedAppPath('/users')).toBeNull();
    expect(toApprovedAppPath('/sales/not-a-uuid')).toBeNull();
    expect(toApprovedAppPath('customers')).toBeNull();
  });
});
