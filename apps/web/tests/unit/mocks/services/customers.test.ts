import { describe, expect, it } from 'vitest';

import { DEFAULT_CASH_CUSTOMER_ID } from '../../../../src/api/contracts/customers';
import type { Invoice } from '../../../../src/api/contracts/entities';
import { createInitialState } from '../../../../src/mocks/data/seed';
import { INSUFFICIENT_PERMISSIONS_MESSAGE } from '../../../../src/mocks/services/customer-credit-messages';
import {
  buildCustomerDirectory,
  nextCustomerId,
  prepareCustomerSave,
} from '../../../../src/mocks/services/customers';

function adminContext(invoices: Invoice[] = createInitialState().invoices) {
  return { actorRole: 'ADMINISTRATOR' as const, invoices };
}

describe('buildCustomerDirectory', () => {
  it('puts Cliente Contado first without an invoice-count field', () => {
    const rows = buildCustomerDirectory(createInitialState());

    expect(rows.map((row) => row.id)).toEqual(['C0', 'C2', 'C1']);
    expect(rows.every((row) => !('invoiceCount' in row))).toBe(true);
    expect(rows[0]?.isDefault).toBe(true);
    expect(rows[0]?.name).toBe('Cliente Contado');
    expect(rows[0]?.customerType).toBe('CASH');
    expect(rows[0]?.contacts).toEqual([]);
  });

  it('searches by name or RNC without using other fields', () => {
    const state = createInitialState();

    expect(buildCustomerDirectory(state, 'caribe').map((row) => row.id)).toEqual(['C1']);
    expect(buildCustomerDirectory(state, '101-98765').map((row) => row.id)).toEqual(['C2']);
    expect(buildCustomerDirectory(state, '809-555-0200')).toEqual([]);
  });

  it('filters by customer type', () => {
    const state = createInitialState();

    expect(buildCustomerDirectory(state, '', 'CREDIT').map((row) => row.id)).toEqual(['C1']);
    expect(buildCustomerDirectory(state, '', 'CASH').map((row) => row.id)).toEqual(['C0', 'C2']);
  });
});

describe('prepareCustomerSave', () => {
  const seedCustomers = createInitialState().customers;
  const invoicesBefore = createInitialState().invoices;

  it('creates the next sequential id after C2 as CASH', () => {
    expect(nextCustomerId(seedCustomers)).toBe('C3');

    const result = prepareCustomerSave(
      seedCustomers,
      {
        name: '  Taller Sur  ',
        contacts: [{ name: 'Luis Soto', phone: '809-555-0400' }],
      },
      adminContext(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        id: 'C3',
        name: 'Taller Sur',
        customerType: 'CASH',
        contacts: [{ id: 'C3-CT1', name: 'Luis Soto', phone: '809-555-0400' }],
      });
      expect(result.value.isDefault).toBeUndefined();
      expect(result.value.creditLimitDop).toBeUndefined();
      expect(result.value.creditTermDays).toBeUndefined();
    }
  });

  it('edits an ordinary customer without rewriting invoices', () => {
    const result = prepareCustomerSave(
      seedCustomers,
      {
        id: 'C2',
        name: 'Logística Norte SA',
        rnc: '101-98765-4',
        notes: 'Cuenta corporativa',
      },
      adminContext(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.notes).toBe('Cuenta corporativa');
      expect(result.value.contacts).toHaveLength(1);
      expect(result.value.customerType).toBe('CASH');
    }
    expect(invoicesBefore).toEqual(createInitialState().invoices);
  });

  it('persists CREDIT classification with limit and term', () => {
    const result = prepareCustomerSave(
      seedCustomers,
      {
        name: 'Flota Crédito',
        customerType: 'CREDIT',
        creditLimitDop: '10000.00',
        creditTermDays: 60,
        rnc: '131000001',
      },
      adminContext(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        customerType: 'CREDIT',
        creditLimitDop: '10000.00',
        creditTermDays: 60,
      });
    }
  });

  it('persists multiple contacts and assigns stable ids', () => {
    const result = prepareCustomerSave(
      seedCustomers,
      {
        name: 'Flota Este',
        contacts: [
          { name: 'María Reyes', phone: '809-555-0100', email: 'maria@example.com', title: 'Compras', isPrimary: true },
          { name: 'Carlos Peña', email: 'carlos@example.com', title: 'Operaciones' },
        ],
      },
      adminContext(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.contacts).toEqual([
        {
          id: 'C3-CT1',
          name: 'María Reyes',
          phone: '809-555-0100',
          email: 'maria@example.com',
          title: 'Compras',
          isPrimary: true,
        },
        {
          id: 'C3-CT2',
          name: 'Carlos Peña',
          email: 'carlos@example.com',
          title: 'Operaciones',
        },
      ]);
    }
  });

  it('rejects edits to Cliente Contado', () => {
    const result = prepareCustomerSave(
      seedCustomers,
      {
        id: DEFAULT_CASH_CUSTOMER_ID,
        name: 'Otro nombre',
      },
      adminContext(),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('rejects empty customer name, invalid contact email, contact without phone or email, and multiple primaries', () => {
    const ctx = adminContext();
    expect(prepareCustomerSave(seedCustomers, { name: '   ' }, ctx).ok).toBe(false);
    expect(
      prepareCustomerSave(
        seedCustomers,
        {
          name: 'A',
          contacts: [{ name: 'Ana', email: 'no-es-correo' }],
        },
        ctx,
      ).ok,
    ).toBe(false);
    expect(
      prepareCustomerSave(
        seedCustomers,
        {
          name: 'A',
          contacts: [{ name: 'Ana' }],
        },
        ctx,
      ).ok,
    ).toBe(false);
    expect(
      prepareCustomerSave(
        seedCustomers,
        {
          name: 'A',
          contacts: [
            { name: 'Ana', phone: '809-555-0100', isPrimary: true },
            { name: 'Luis', phone: '809-555-0101', isPrimary: true },
          ],
        },
        ctx,
      ).ok,
    ).toBe(false);
  });

  it('allows a contact without name when phone or email is present', () => {
    const result = prepareCustomerSave(
      seedCustomers,
      {
        name: 'Juan Pérez',
        contacts: [{ phone: '809-555-0400' }],
      },
      adminContext(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.contacts).toEqual([{ id: 'C3-CT1', phone: '809-555-0400' }]);
    }
  });

  it('forbids sellers from creating CREDIT customers or sending credit fields', () => {
    const ctx = { actorRole: 'SELLER' as const, invoices: invoicesBefore };

    expect(
      prepareCustomerSave(
        seedCustomers,
        { name: 'Nuevo', customerType: 'CREDIT', creditLimitDop: '1.00', creditTermDays: 30, rnc: '131000001' },
        ctx,
      ),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN', message: INSUFFICIENT_PERMISSIONS_MESSAGE } });

    expect(
      prepareCustomerSave(seedCustomers, { name: 'Nuevo', creditLimitDop: '1.00' }, ctx),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });

    expect(prepareCustomerSave(seedCustomers, { id: 'C1', name: 'Transportes del Caribe SRL' }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
  });

  it('blocks CREDIT to CASH only when open receivable balance exists in DOP', () => {
    const usdOpenInvoice: Invoice = {
      id: 'INV-USD-OPEN',
      status: 'COMPLETED',
      customerId: 'C1',
      currency: 'USD',
      fiscal: false,
      lines: [
        {
          id: 'L-USD',
          type: 'QTY',
          description: 'Repuesto',
          qtyProductId: 'QTY-OIL-15W40',
          quantity: 1,
          unitPrice: 100,
          taxable: false,
        },
      ],
      payments: [],
      paymentState: 'UNPAID',
      createdAt: '2026-08-25T09:00:00.000Z',
      confirmedAt: '2026-08-25T09:05:00.000Z',
    };

    const ctxDop = adminContext(invoicesBefore);
    expect(
      prepareCustomerSave(
        seedCustomers,
        { id: 'C1', name: 'Transportes del Caribe SRL', customerType: 'CASH', rnc: '131-45678-9' },
        ctxDop,
      ).ok,
    ).toBe(false);

    const usdOnlyResult = prepareCustomerSave(
      seedCustomers,
      { id: 'C1', name: 'Transportes del Caribe SRL', customerType: 'CASH', rnc: '131-45678-9' },
      adminContext([usdOpenInvoice]),
    );
    expect(usdOnlyResult.ok).toBe(true);
  });

  it('rejects a CREDIT customer with an invalid fiscal identifier', () => {
    const result = prepareCustomerSave(
      seedCustomers,
      {
        name: 'Crédito inválido',
        customerType: 'CREDIT',
        creditLimitDop: '10000.00',
        creditTermDays: 60,
        rnc: 'abc',
      },
      adminContext(),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
  });
});
