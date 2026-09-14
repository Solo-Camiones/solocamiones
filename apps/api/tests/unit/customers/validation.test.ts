import { describe, expect, it } from 'vitest';

import { satisfiesFiscalIdentity, fiscalIdDigits, isValidFiscalId } from '../../../src/features/customers/fiscal.js';
import { createCustomerSchema, updateCustomerSchema } from '../../../src/features/customers/validation.js';

describe('customer fiscal identity', () => {
  it('accepts 9-digit RNC and 11-digit Cédula after stripping separators', () => {
    expect(fiscalIdDigits('1-31-12345-6')).toBe('131123456');
    expect(isValidFiscalId('131123456')).toBe(true);
    expect(isValidFiscalId('00112345678')).toBe(true);
    expect(isValidFiscalId('12345678')).toBe(false);
    expect(isValidFiscalId('1234567890')).toBe(false);
  });

  it('never treats Cliente contado as fiscal even if an rnc were present', () => {
    expect(satisfiesFiscalIdentity({ isDefault: true, rnc: '131123456' })).toBe(false);
    expect(satisfiesFiscalIdentity({ isDefault: false, rnc: null })).toBe(false);
    expect(satisfiesFiscalIdentity({ isDefault: false, rnc: '131123456' })).toBe(true);
  });
});

describe('customer validation', () => {
  const valid = {
    name: '  Taller Norte  ',
    rnc: ' 1-31-12345-6 ',
    address: '  Calle 1  ',
    notes: '  VIP  ',
    contacts: [
      {
        id: 'ignored',
        name: ' Ana ',
        phone: ' 809-111-2222 ',
        email: ' Ana@example.com ',
        title: ' Compras ',
        isPrimary: true,
      },
    ],
  };

  it('normalizes identity, optional text and contacts while rejecting unknown fields', () => {
    expect(createCustomerSchema.parse(valid)).toEqual({
      name: 'Taller Norte',
      rnc: '131123456',
      address: 'Calle 1',
      notes: 'VIP',
      contacts: [
        {
          id: 'ignored',
          name: 'Ana',
          phone: '809-111-2222',
          email: 'Ana@example.com',
          title: 'Compras',
          isPrimary: true,
        },
      ],
    });
    expect(createCustomerSchema.parse({ name: 'Solo' })).toEqual({ name: 'Solo' });
    expect(createCustomerSchema.safeParse({ ...valid, isDefault: true }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
  });

  it('rejects invalid fiscal identifiers, empty names and contacts without phone or email', () => {
    expect(createCustomerSchema.safeParse({ name: ' ' }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ name: 'A', rnc: '123' }).success).toBe(false);
    expect(
      createCustomerSchema.safeParse({ name: 'A', contacts: [{ name: 'Only name' }] }).success,
    ).toBe(false);
    expect(
      createCustomerSchema.safeParse({
        name: 'A',
        contacts: [
          { phone: '8090000000', isPrimary: true },
          { email: 'b@example.com', isPrimary: true },
        ],
      }).success,
    ).toBe(false);
    expect(updateCustomerSchema.safeParse({}).success).toBe(false);
  });
});
