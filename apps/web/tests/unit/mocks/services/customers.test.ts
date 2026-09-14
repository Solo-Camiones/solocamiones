import { describe, expect, it } from 'vitest';

import { DEFAULT_CASH_CUSTOMER_ID } from '../../../../src/api/contracts/customers';
import { createInitialState } from '../../../../src/mocks/data/seed';
import {
  buildCustomerDirectory,
  nextCustomerId,
  prepareCustomerSave,
} from '../../../../src/mocks/services/customers';

describe('buildCustomerDirectory', () => {
  it('puts Cliente Contado first without an invoice-count field', () => {
    const rows = buildCustomerDirectory(createInitialState());

    expect(rows.map((row) => row.id)).toEqual(['C0', 'C2', 'C1']);
    expect(rows.every((row) => !('invoiceCount' in row))).toBe(true);
    expect(rows[0]?.isDefault).toBe(true);
    expect(rows[0]?.name).toBe('Cliente Contado');
    expect(rows[0]?.contacts).toEqual([]);
  });

  it('searches by name or RNC without using other fields', () => {
    const state = createInitialState();

    expect(buildCustomerDirectory(state, 'caribe').map((row) => row.id)).toEqual(['C1']);
    expect(buildCustomerDirectory(state, '101-98765').map((row) => row.id)).toEqual(['C2']);
    expect(buildCustomerDirectory(state, '809-555-0200')).toEqual([]);
  });
});

describe('prepareCustomerSave', () => {
  const seedCustomers = createInitialState().customers;
  const invoicesBefore = createInitialState().invoices;

  it('creates the next sequential id after C2', () => {
    expect(nextCustomerId(seedCustomers)).toBe('C3');

    const result = prepareCustomerSave(seedCustomers, {
      name: '  Taller Sur  ',
      contacts: [{ name: 'Luis Soto', phone: '809-555-0400' }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        id: 'C3',
        name: 'Taller Sur',
        contacts: [{ id: 'C3-CT1', name: 'Luis Soto', phone: '809-555-0400' }],
      });
      expect(result.value.isDefault).toBeUndefined();
    }
  });

  it('edits an ordinary customer without rewriting invoices', () => {
    const result = prepareCustomerSave(seedCustomers, {
      id: 'C1',
      name: 'Transportes del Caribe SRL',
      rnc: '131-45678-9',
      notes: 'Cuenta corporativa',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.notes).toBe('Cuenta corporativa');
      expect(result.value.contacts).toHaveLength(2);
    }
    expect(invoicesBefore).toEqual(createInitialState().invoices);
  });

  it('persists multiple contacts and assigns stable ids', () => {
    const result = prepareCustomerSave(seedCustomers, {
      name: 'Flota Este',
      contacts: [
        { name: 'María Reyes', phone: '809-555-0100', email: 'maria@example.com', title: 'Compras', isPrimary: true },
        { name: 'Carlos Peña', email: 'carlos@example.com', title: 'Operaciones' },
      ],
    });

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
    const result = prepareCustomerSave(seedCustomers, {
      id: DEFAULT_CASH_CUSTOMER_ID,
      name: 'Otro nombre',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('rejects empty customer name, invalid contact email, contact without phone or email, and multiple primaries', () => {
    expect(prepareCustomerSave(seedCustomers, { name: '   ' }).ok).toBe(false);
    expect(
      prepareCustomerSave(seedCustomers, {
        name: 'A',
        contacts: [{ name: 'Ana', email: 'no-es-correo' }],
      }).ok,
    ).toBe(false);
    expect(
      prepareCustomerSave(seedCustomers, {
        name: 'A',
        contacts: [{ name: 'Ana' }],
      }).ok,
    ).toBe(false);
    expect(
      prepareCustomerSave(seedCustomers, {
        name: 'A',
        contacts: [
          { name: 'Ana', phone: '809-555-0100', isPrimary: true },
          { name: 'Luis', phone: '809-555-0101', isPrimary: true },
        ],
      }).ok,
    ).toBe(false);
  });

  it('allows a contact without name when phone or email is present', () => {
    const result = prepareCustomerSave(seedCustomers, {
      name: 'Juan Pérez',
      contacts: [{ phone: '809-555-0400' }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.contacts).toEqual([
        { id: 'C3-CT1', phone: '809-555-0400' },
      ]);
    }
  });
});
