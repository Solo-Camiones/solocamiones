import { describe, expect, it } from 'vitest';

import {
  COST_AMOUNT_REQUIRED_MESSAGE,
  COST_PROVENANCE_REQUIRED_MESSAGE,
  formatInvoiceNumber,
  UNKNOWN_COST_AMOUNT_MESSAGE,
} from '../../../src/features/sales/constants.js';
import {
  addInvoiceLineSchema,
  addPaymentSchema,
  cancelInvoiceSchema,
  confirmInvoiceSchema,
  createDraftSchema,
  deliveryDraftLineSchema,
  externalDraftLineSchema,
  genericDraftLineSchema,
  serviceDraftLineSchema,
  lineNotesSchema,
  listInvoicesSchema,
  setLinePriceSchema,
  updateDraftMetaSchema,
} from '../../../src/features/sales/validation.js';

describe('draft HTTP validation', () => {
  it('accepts an empty create body and optional overrides', () => {
    expect(createDraftSchema.parse({})).toEqual({});
    expect(
      createDraftSchema.parse({
        currency: 'USD',
        fiscal: false,
        customerId: '11111111-1111-4111-8111-111111111111',
      }),
    ).toEqual({
      currency: 'USD',
      fiscal: false,
      customerId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('rejects empty meta patches and unknown fields', () => {
    expect(updateDraftMetaSchema.safeParse({}).success).toBe(false);
    expect(createDraftSchema.safeParse({ currency: 'EUR' }).success).toBe(false);
    expect(createDraftSchema.safeParse({ extra: true }).success).toBe(false);
  });

  it('accepts an optional trimmed list search query', () => {
    expect(listInvoicesSchema.parse({})).toEqual({ page: 1, pageSize: 10 });
    expect(listInvoicesSchema.parse({ q: '  FAC-000099  ', page: '2' })).toEqual({
      q: 'FAC-000099',
      page: 2,
      pageSize: 10,
    });
  });

  it('accepts an empty confirm body and rejects payment or unknown fields', () => {
    expect(confirmInvoiceSchema.parse({})).toEqual({});
    expect(confirmInvoiceSchema.safeParse({ payment: { amount: '10.00' } }).success).toBe(false);
    expect(confirmInvoiceSchema.safeParse({ extra: true }).success).toBe(false);
    expect(formatInvoiceNumber(1)).toBe('FAC-000001');
    expect(formatInvoiceNumber(12)).toBe('FAC-000012');
  });
});

describe('draft GENERIC line validation', () => {
  it('accepts GENERIC with string money and UNKNOWN without an amount', () => {
    expect(
      genericDraftLineSchema.parse({
        type: 'GENERIC',
        description: 'Filtro',
        unitPrice: '118.00',
        costProvenance: 'UNKNOWN',
      }),
    ).toEqual({
      type: 'GENERIC',
      description: 'Filtro',
      unitPrice: '118.00',
      costProvenance: 'UNKNOWN',
    });
    expect(addInvoiceLineSchema.parse({ type: 'ITEM' })).toEqual({ type: 'ITEM' });
    expect(setLinePriceSchema.parse({ unitPrice: '50.00' })).toEqual({ unitPrice: '50.00' });
    expect(setLinePriceSchema.parse({ quantity: '3.00' })).toEqual({ quantity: '3.00' });
    expect(setLinePriceSchema.parse({ description: 'Filtro de aire' })).toEqual({
      description: 'Filtro de aire',
    });
    expect(setLinePriceSchema.parse({ notes: '  Se instaló bomba  ' })).toEqual({
      notes: 'Se instaló bomba',
    });
    expect(setLinePriceSchema.parse({ notes: '   ' })).toEqual({ notes: null });
    expect(setLinePriceSchema.parse({ notes: null })).toEqual({ notes: null });
    expect(setLinePriceSchema.parse({ unitPrice: '50.00', quantity: '2.00' })).toEqual({
      unitPrice: '50.00',
      quantity: '2.00',
    });
    expect(
      setLinePriceSchema.parse({
        acquisitionCostDop: '75.00',
        costProvenance: 'ESTIMATED',
      }),
    ).toEqual({ acquisitionCostDop: '75.00', costProvenance: 'ESTIMATED' });
    expect(
      setLinePriceSchema.parse({ acquisitionCostDop: null, costProvenance: 'UNKNOWN' }),
    ).toEqual({ acquisitionCostDop: null, costProvenance: 'UNKNOWN' });
  });

  it('rejects numeric money, UNKNOWN with amount, missing actual cost, and extra fields', () => {
    expect(
      genericDraftLineSchema.safeParse({
        type: 'GENERIC',
        description: 'Filtro',
        unitPrice: 118,
        costProvenance: 'UNKNOWN',
      }).success,
    ).toBe(false);
    expect(
      genericDraftLineSchema.safeParse({
        type: 'GENERIC',
        description: 'Filtro',
        unitPrice: '118.00',
        costProvenance: 'UNKNOWN',
        acquisitionCostDop: '0.00',
      }).error?.issues[0]?.message,
    ).toBe(UNKNOWN_COST_AMOUNT_MESSAGE);
    expect(
      genericDraftLineSchema.safeParse({
        type: 'GENERIC',
        description: 'Filtro',
        unitPrice: '118.00',
        costProvenance: 'ACTUAL',
      }).error?.issues[0]?.message,
    ).toBe(COST_AMOUNT_REQUIRED_MESSAGE);
    expect(addInvoiceLineSchema.safeParse({ type: 'GENERIC', itemId: 'x' }).success).toBe(false);
    expect(setLinePriceSchema.safeParse({ unitPrice: '10', extra: true }).success).toBe(false);
    expect(setLinePriceSchema.safeParse({}).success).toBe(false);
    expect(setLinePriceSchema.safeParse({ quantity: '0.00' }).success).toBe(false);
    expect(
      setLinePriceSchema.safeParse({ acquisitionCostDop: '75.00' }).error?.issues[0]?.message,
    ).toBe(COST_PROVENANCE_REQUIRED_MESSAGE);
    expect(
      setLinePriceSchema.safeParse({ costProvenance: 'ACTUAL' }).error?.issues[0]?.message,
    ).toBe(COST_AMOUNT_REQUIRED_MESSAGE);
    expect(
      setLinePriceSchema.safeParse({
        acquisitionCostDop: '75.00',
        costProvenance: 'UNKNOWN',
      }).error?.issues[0]?.message,
    ).toBe(UNKNOWN_COST_AMOUNT_MESSAGE);
    expect(
      setLinePriceSchema.safeParse({ acquisitionCostDop: null, costProvenance: 'ESTIMATED' }).error
        ?.issues[0]?.message,
    ).toBe(COST_AMOUNT_REQUIRED_MESSAGE);
    expect(lineNotesSchema.safeParse('x'.repeat(101)).success).toBe(false);
    expect(lineNotesSchema.parse('a\nb')).toBe('a\nb');
    expect(lineNotesSchema.parse('  \n  ')).toBe(null);
    expect(lineNotesSchema.parse(undefined)).toBeUndefined();
    expect(lineNotesSchema.safeParse(1).success).toBe(false);
  });

  it('rejects values that cannot be stored as DECIMAL(12,2)', () => {
    const line = {
      type: 'GENERIC' as const,
      description: 'Filtro',
      unitPrice: '118.00',
      costProvenance: 'UNKNOWN' as const,
    };

    expect(genericDraftLineSchema.safeParse({ ...line, quantity: '0.001' }).success).toBe(false);
    expect(genericDraftLineSchema.safeParse({ ...line, quantity: '0.00' }).success).toBe(false);
    expect(genericDraftLineSchema.safeParse({ ...line, unitPrice: '10000000000.00' }).success).toBe(
      false,
    );
    expect(setLinePriceSchema.safeParse({ unitPrice: '1e3' }).success).toBe(false);
    expect(setLinePriceSchema.safeParse({ unitPrice: '9999999999.99' }).success).toBe(true);
  });
});

describe('draft EXTERNAL line validation', () => {
  it('accepts EXTERNAL with string money and UNKNOWN without an amount', () => {
    expect(
      externalDraftLineSchema.parse({
        type: 'EXTERNAL',
        description: 'Bomba externa',
        unitPrice: '300.00',
        costProvenance: 'UNKNOWN',
      }),
    ).toEqual({
      type: 'EXTERNAL',
      description: 'Bomba externa',
      unitPrice: '300.00',
      costProvenance: 'UNKNOWN',
    });
  });

  it('rejects numeric money, UNKNOWN with amount, missing actual cost, and extra fields', () => {
    expect(
      externalDraftLineSchema.safeParse({
        type: 'EXTERNAL',
        description: 'Bomba externa',
        unitPrice: 300,
        costProvenance: 'UNKNOWN',
      }).success,
    ).toBe(false);
    expect(
      externalDraftLineSchema.safeParse({
        type: 'EXTERNAL',
        description: 'Bomba externa',
        unitPrice: '300.00',
        costProvenance: 'UNKNOWN',
        acquisitionCostDop: '0.00',
      }).error?.issues[0]?.message,
    ).toBe(UNKNOWN_COST_AMOUNT_MESSAGE);
    expect(
      externalDraftLineSchema.safeParse({
        type: 'EXTERNAL',
        description: 'Bomba externa',
        unitPrice: '300.00',
        costProvenance: 'ACTUAL',
      }).error?.issues[0]?.message,
    ).toBe(COST_AMOUNT_REQUIRED_MESSAGE);
    expect(
      externalDraftLineSchema.safeParse({
        type: 'EXTERNAL',
        description: 'Bomba externa',
        unitPrice: '300.00',
        costProvenance: 'UNKNOWN',
        serviceId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(false);
  });
});

describe('draft SERVICE line validation', () => {
  const serviceId = '11111111-1111-4111-8111-111111111111';

  it('accepts serviceId plus unitPrice, including zero, and optional description', () => {
    expect(
      serviceDraftLineSchema.parse({
        type: 'SERVICE',
        serviceId,
        unitPrice: '0.00',
      }),
    ).toEqual({
      type: 'SERVICE',
      serviceId,
      unitPrice: '0.00',
    });
    expect(
      serviceDraftLineSchema.parse({
        type: 'SERVICE',
        serviceId,
        unitPrice: '500.00',
        description: 'Instalación expres',
      }),
    ).toEqual({
      type: 'SERVICE',
      serviceId,
      unitPrice: '500.00',
      description: 'Instalación expres',
    });
  });

  it('rejects quantity, cost, numeric money, and extra fields', () => {
    expect(
      serviceDraftLineSchema.safeParse({
        type: 'SERVICE',
        serviceId,
        unitPrice: '100.00',
        quantity: '2',
      }).success,
    ).toBe(false);
    expect(
      serviceDraftLineSchema.safeParse({
        type: 'SERVICE',
        serviceId,
        unitPrice: '100.00',
        costProvenance: 'UNKNOWN',
      }).success,
    ).toBe(false);
    expect(
      serviceDraftLineSchema.safeParse({
        type: 'SERVICE',
        serviceId,
        unitPrice: 500,
      }).success,
    ).toBe(false);
    expect(
      serviceDraftLineSchema.safeParse({
        type: 'SERVICE',
        unitPrice: '100.00',
      }).success,
    ).toBe(false);
  });
});

describe('draft DELIVERY line validation', () => {
  it('accepts zero or positive unitPrice with a nonempty description', () => {
    expect(
      deliveryDraftLineSchema.parse({
        type: 'DELIVERY',
        unitPrice: '0.00',
        description: 'Entrega incluida',
      }),
    ).toEqual({
      type: 'DELIVERY',
      unitPrice: '0.00',
      description: 'Entrega incluida',
    });
    expect(
      deliveryDraftLineSchema.parse({
        type: 'DELIVERY',
        unitPrice: '200.00',
        description: 'Envío',
      }),
    ).toEqual({
      type: 'DELIVERY',
      unitPrice: '200.00',
      description: 'Envío',
    });
  });

  it('rejects missing or empty description, quantity, cost, numeric money, and extra fields', () => {
    expect(
      deliveryDraftLineSchema.safeParse({ type: 'DELIVERY', unitPrice: '10.00' }).success,
    ).toBe(false);
    expect(
      deliveryDraftLineSchema.safeParse({
        type: 'DELIVERY',
        unitPrice: '10.00',
        description: '   ',
      }).success,
    ).toBe(false);
    expect(
      deliveryDraftLineSchema.safeParse({
        type: 'DELIVERY',
        description: 'Envío',
        unitPrice: '10.00',
        quantity: '1',
      }).success,
    ).toBe(false);
    expect(
      deliveryDraftLineSchema.safeParse({
        type: 'DELIVERY',
        description: 'Envío',
        unitPrice: '10.00',
        costProvenance: 'UNKNOWN',
      }).success,
    ).toBe(false);
    expect(
      deliveryDraftLineSchema.safeParse({ type: 'DELIVERY', description: 'Envío', unitPrice: 0 })
        .success,
    ).toBe(false);
    expect(deliveryDraftLineSchema.safeParse({ type: 'DELIVERY' }).success).toBe(false);
    expect(addInvoiceLineSchema.safeParse({ type: 'DELIVERY', extra: true }).success).toBe(false);
  });
});

describe('payment and cancellation HTTP validation', () => {
  it('accepts a confirm payment with optional reference and idempotency key', () => {
    expect(
      confirmInvoiceSchema.parse({
        payment: {
          amount: '50.00',
          method: 'CASH',
          reference: '  REC-1  ',
          idempotencyKey: 'confirm-key',
        },
      }),
    ).toEqual({
      payment: {
        amount: '50.00',
        method: 'CASH',
        reference: 'REC-1',
        idempotencyKey: 'confirm-key',
      },
    });
  });

  it.each(['0', '0.00', '9999999999.991', '10000000000.00', '-1', '10.1.0', 'abc'])(
    'rejects confirm or later payment amount %s',
    (amount) => {
      expect(
        confirmInvoiceSchema.safeParse({ payment: { amount, method: 'CASH' } }).success,
      ).toBe(false);
      expect(
        addPaymentSchema.safeParse({
          amount,
          method: 'CASH',
          effectiveDate: '2026-09-11',
          idempotencyKey: 'pay-key',
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    {
      name: 'optional null reference',
      input: {
        amount: '18.00',
        method: 'TRANSFER' as const,
        effectiveDate: '2026-09-11',
        reference: null,
        idempotencyKey: 'pay-key',
      },
    },
    {
      name: 'omitted optional reference',
      input: {
        amount: '18.00',
        method: 'CHECK' as const,
        effectiveDate: '2026-09-11',
        idempotencyKey: 'pay-key',
      },
    },
  ])('accepts a later payment with $name', ({ input }) => {
    expect(addPaymentSchema.parse(input)).toEqual(input);
  });

  it.each([
    { idempotencyKey: '', effectiveDate: '2026-09-11' },
    { idempotencyKey: 'x'.repeat(101), effectiveDate: '2026-09-11' },
    { idempotencyKey: 'pay-key', effectiveDate: '13-09-2026' },
    { idempotencyKey: 'pay-key', effectiveDate: '2026-09-11T12:00:00.000Z' },
    { idempotencyKey: 'pay-key', effectiveDate: '2026-13-01' },
  ])('rejects a later payment with invalid identity or date %#', (fields) => {
    expect(
      addPaymentSchema.safeParse({
        amount: '10.00',
        method: 'CASH',
        ...fields,
      }).success,
    ).toBe(false);
  });

  it('accepts cancellation with optional refund fields and requires an idempotency key', () => {
    expect(
      cancelInvoiceSchema.parse({
        reason: 'Cliente devolvió las piezas',
        refundMethod: 'TRANSFER',
        refundReference: '  CHK-1  ',
        idempotencyKey: 'cancel-key',
      }),
    ).toEqual({
      reason: 'Cliente devolvió las piezas',
      refundMethod: 'TRANSFER',
      refundReference: 'CHK-1',
      idempotencyKey: 'cancel-key',
    });
    expect(cancelInvoiceSchema.parse({ reason: 'Duplicada', idempotencyKey: 'cancel-key' })).toEqual(
      { reason: 'Duplicada', idempotencyKey: 'cancel-key' },
    );
  });

  it.each([
    { reason: '', idempotencyKey: 'cancel-key' },
    { reason: 'Duplicada', idempotencyKey: '' },
    { reason: 'Duplicada' },
    { reason: 'Duplicada', idempotencyKey: 'cancel-key', refundMethod: 'CARD' },
  ])('rejects cancellation payload %#', (input) => {
    expect(cancelInvoiceSchema.safeParse(input).success).toBe(false);
  });
});
