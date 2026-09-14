import { describe, expect, it } from 'vitest';

import { presentAppError, presentError } from '../../../../src/shared/errors/present-app-error';

const GENERIC_VALIDATION = 'Revise los datos ingresados.';

describe('presentError', () => {
  it('maps a fiscal identifier issue to the RNC field without exposing English', () => {
    const presented = presentError({
      fallbackMessage: GENERIC_VALIDATION,
      serverMessage: 'Request validation failed',
      details: {
        issues: [
          {
            path: 'rnc',
            message: 'Fiscal identifier must be a 9-digit RNC or 11-digit Cédula',
          },
        ],
      },
    });

    expect(presented.summary).toBe('Debe ser un RNC de 9 dígitos o una cédula de 11 dígitos.');
    expect(presented.fields).toEqual({
      rnc: 'Debe ser un RNC de 9 dígitos o una cédula de 11 dígitos.',
    });
    expect(presented.summary).not.toMatch(/Fiscal|Request validation/i);
  });

  it('keeps the generic fallback when issues are unrecognized', () => {
    const presented = presentError({
      fallbackMessage: GENERIC_VALIDATION,
      serverMessage: 'Request validation failed',
      details: {
        issues: [{ path: '', message: 'Unrecognized key: "isDefault"' }],
      },
    });

    expect(presented).toEqual({ summary: GENERIC_VALIDATION, fields: {} });
  });

  it('maps a fiscal invoice customer conflict without exposing English', () => {
    const presented = presentError({
      fallbackMessage: 'Los datos cambiaron. Actualice e intente nuevamente.',
      serverMessage: 'A fiscal invoice requires a customer with RNC or Cédula',
    });

    expect(presented.summary).toBe('Una factura fiscal requiere un cliente con RNC o cédula.');
    expect(presented.fields.fiscal).toBe(presented.summary);
    expect(presented.summary).not.toMatch(/RNC or Cédula/i);
  });

  it('maps Cliente contado credit rejection without exposing internals', () => {
    expect(
      presentError({
        fallbackMessage: 'Los datos cambiaron. Actualice e intente nuevamente.',
        serverMessage: 'A Cliente contado no se le puede vender a crédito',
      }).summary,
    ).toBe('A Cliente contado no se le puede vender a crédito');
  });

  it('maps a duplicate fiscal identifier conflict onto the RNC field', () => {
    const presented = presentError({
      fallbackMessage: 'Los datos cambiaron. Actualice e intente nuevamente.',
      serverMessage: 'A customer with this fiscal identifier already exists',
    });

    expect(presented.summary).toBe('Ya existe un cliente con esta identificación fiscal / cédula.');
    expect(presented.fields.rnc).toBe(presented.summary);
  });

  it('summarizes several known fields without leaking Zod defaults', () => {
    const presented = presentError({
      fallbackMessage: GENERIC_VALIDATION,
      details: {
        issues: [
          { path: 'name', message: 'Too small: expected string to have >=1 characters' },
          { path: 'contacts.0.email', message: 'Invalid email address' },
        ],
      },
    });

    expect(presented.fields.name).toBe('El nombre es obligatorio.');
    expect(presented.fields['contacts.0.email']).toBe('El correo no es válido.');
    expect(presented.summary).toBe('Revise: nombre, correo del contacto.');
  });

  it('preserves already-Spanish mock messages and password-change details', () => {
    expect(
      presentAppError({
        code: 'VALIDATION',
        message: 'El nombre es obligatorio',
      }),
    ).toEqual({
      summary: 'El nombre es obligatorio.',
      fields: { name: 'El nombre es obligatorio.' },
    });

    expect(
      presentError({
        fallbackMessage: GENERIC_VALIDATION,
        details: { reason: 'PASSWORD_CHANGE_REQUIRED' },
      }).summary,
    ).toBe('Debe cambiar su contraseña desde Mi perfil para continuar.');
  });

  it('keeps known PDF conflict messages in Spanish', () => {
    expect(
      presentError({
        fallbackMessage: 'Los datos cambiaron. Actualice e intente nuevamente.',
        serverMessage: 'La generación del PDF falló',
      }).summary,
    ).toBe('La generación del PDF falló');
  });

  it('keeps known profitability conflict messages in Spanish', () => {
    expect(
      presentError({
        fallbackMessage: 'Los datos cambiaron. Actualice e intente nuevamente.',
        serverMessage:
          'Reintente primero el cálculo con la tasa de cambio; no registre un monto mientras esté pendiente',
      }).summary,
    ).toBe(
      'Reintente primero el cálculo con la tasa de cambio; no registre un monto mientras esté pendiente',
    );
  });
});
