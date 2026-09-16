import { describe, expect, it } from 'vitest';

import {
  CASH_CUSTOMER_CREDIT_FIELDS_FORBIDDEN_MESSAGE,
  CREDIT_CUSTOMER_REQUIRES_FISCAL_ID_MESSAGE,
  CREDIT_CUSTOMER_REQUIRES_LIMIT_MESSAGE,
  CREDIT_CUSTOMER_REQUIRES_TERM_MESSAGE,
} from '../../../src/features/customers/constants.js';
import {
  assertCustomerCreditProfile,
  resolveCreateCreditProfile,
  resolveUpdateCreditProfile,
} from '../../../src/features/customers/credit-rules.js';
import { satisfiesFiscalIdentity, fiscalIdDigits, isValidFiscalId } from '../../../src/features/customers/fiscal.js';
import {
  createCustomerSchema,
  searchCustomersSchema,
  updateCustomerSchema,
} from '../../../src/features/customers/validation.js';

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

  it('accepts CREDIT payloads with limit and term for route-level parsing', () => {
    expect(
      createCustomerSchema.parse({
        name: 'Crédito SA',
        rnc: '00112345678',
        customerType: 'CREDIT',
        creditLimitDop: '15000.50',
        creditTermDays: 90,
      }),
    ).toMatchObject({
      customerType: 'CREDIT',
      creditLimitDop: '15000.50',
      creditTermDays: 90,
    });
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

  it('rejects zero credit limits and invalid terms at the HTTP boundary', () => {
    expect(
      createCustomerSchema.safeParse({
        name: 'A',
        customerType: 'CREDIT',
        creditLimitDop: '0',
        creditTermDays: 30,
      }).success,
    ).toBe(false);
    expect(
      createCustomerSchema.safeParse({
        name: 'A',
        customerType: 'CREDIT',
        creditLimitDop: '100.00',
        creditTermDays: 31,
      }).success,
    ).toBe(false);
  });

  it('accepts optional customerType filter on search', () => {
    expect(searchCustomersSchema.parse({ customerType: 'CREDIT' })).toMatchObject({
      customerType: 'CREDIT',
      page: 1,
      pageSize: 10,
    });
    expect(searchCustomersSchema.safeParse({ customerType: 'WHOLESALE' }).success).toBe(false);
  });
});

describe('customer credit profile rules', () => {
  it('rejects CASH customers with credit fields and incomplete CREDIT profiles', () => {
    expect(() =>
      assertCustomerCreditProfile({
        customerType: 'CASH',
        creditLimitDop: '100.00',
        creditTermDays: null,
        rnc: null,
        isDefault: false,
      }),
    ).toThrow(CASH_CUSTOMER_CREDIT_FIELDS_FORBIDDEN_MESSAGE);

    expect(() =>
      assertCustomerCreditProfile({
        customerType: 'CREDIT',
        creditLimitDop: '100.00',
        creditTermDays: 60,
        rnc: null,
        isDefault: false,
      }),
    ).toThrow(CREDIT_CUSTOMER_REQUIRES_FISCAL_ID_MESSAGE);

    expect(() =>
      assertCustomerCreditProfile({
        customerType: 'CREDIT',
        creditLimitDop: null,
        creditTermDays: 60,
        rnc: '00112345678',
        isDefault: false,
      }),
    ).toThrow(CREDIT_CUSTOMER_REQUIRES_LIMIT_MESSAGE);

    expect(() =>
      assertCustomerCreditProfile({
        customerType: 'CREDIT',
        creditLimitDop: '100.00',
        creditTermDays: null,
        rnc: '00112345678',
        isDefault: false,
      }),
    ).toThrow(CREDIT_CUSTOMER_REQUIRES_TERM_MESSAGE);
  });

  it('accepts a complete CREDIT profile', () => {
    expect(() =>
      assertCustomerCreditProfile({
        customerType: 'CREDIT',
        creditLimitDop: '10000.00',
        creditTermDays: 45,
        rnc: '00112345678',
        isDefault: false,
      }),
    ).not.toThrow();
  });

  it('does not strip invalid CASH credit fields before validation', () => {
    expect(() =>
      assertCustomerCreditProfile(
        resolveCreateCreditProfile({
          customerType: 'CASH',
          creditLimitDop: '100.00',
          creditTermDays: 30,
        }),
      ),
    ).toThrow(CASH_CUSTOMER_CREDIT_FIELDS_FORBIDDEN_MESSAGE);
  });

  it('clears credit terms on an explicit CREDIT to CASH change unless the patch resends them', () => {
    const existing = {
      customerType: 'CREDIT' as const,
      creditLimitDop: '10000.00',
      creditTermDays: 60,
      rnc: '00112345678',
      isDefault: false,
    };
    expect(resolveUpdateCreditProfile(existing, { customerType: 'CASH' })).toMatchObject({
      customerType: 'CASH',
      creditLimitDop: null,
      creditTermDays: null,
    });
    expect(() =>
      assertCustomerCreditProfile(
        resolveUpdateCreditProfile(existing, {
          customerType: 'CASH',
          creditLimitDop: '100.00',
        }),
      ),
    ).toThrow(CASH_CUSTOMER_CREDIT_FIELDS_FORBIDDEN_MESSAGE);
  });
});
