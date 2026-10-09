import { describe, expect, it } from 'vitest';

import { CAPABILITY_PRESETS } from '../../../../src/shared/config/capabilities';
import {
  firstPosProblemElementId,
  posAddLineReservationHint,
  posBlockedConfirmSummary,
  POS_FIELD_IDS,
  posDraftDescription,
  posLinePriceFieldId,
  toPosUserMessage,
} from '../../../../src/features/sales/pos-copy';

describe('pos-copy', () => {
  it('does not mention inventory reservation in Release 2 billing', () => {
    expect(posDraftDescription(CAPABILITY_PRESETS['release-2'])).not.toMatch(/reserv/i);
    expect(posDraftDescription(CAPABILITY_PRESETS['release-5'])).toMatch(/reservadas/);
  });

  it('explains reservation only for inventory-backed line types', () => {
    expect(posAddLineReservationHint('GENERIC')).toBeNull();
    expect(posAddLineReservationHint('ITEM')).toMatch(/reservada/);
    expect(posAddLineReservationHint('QTY')).toMatch(/reservadas/);
  });

  it('turns stock conflicts into seller actions instead of HTTP status codes', () => {
    expect(toPosUserMessage({ code: 'CONFLICT', message: 'ALT-004 ya está vendido' })).toBe(
      'La pieza ALT-004 ya no está disponible. Elimínala del borrador o selecciona otra.',
    );
    expect(
      toPosUserMessage({ code: 'CONFLICT', message: 'HTTP 409: /api/sales/INV-DRAFT-01/confirm' }),
    ).toBe('La pieza ya no está disponible. Elimínala del borrador o selecciona otra.');
    expect(toPosUserMessage({ code: 'CONFLICT', message: 'Stock insuficiente para QTY-OIL' })).toBe(
      'Esa cantidad de QTY-OIL ya no está disponible. Ajusta la línea o elige otro producto.',
    );
  });

  it('summarizes blocked confirm next to the button without dropping the first reason', () => {
    expect(posBlockedConfirmSummary([])).toBeNull();
    expect(posBlockedConfirmSummary(['Hay precios pendientes'])).toBe('Hay precios pendientes');
    expect(posBlockedConfirmSummary(['Hay precios pendientes', 'Agregue al menos una línea'])).toBe(
      'Faltan 2 requisitos',
    );
  });

  it('resolves Ver requisitos to the first problem in plan order', () => {
    expect(
      firstPosProblemElementId({
        blockers: ['Agregue al menos una línea'],
        lines: [],
      }),
    ).toBe(POS_FIELD_IDS.lines);

    expect(
      firstPosProblemElementId({
        blockers: ['Hay precios pendientes'],
        lines: [{ id: 'L-1', pricePending: true }],
      }),
    ).toBe(posLinePriceFieldId('L-1'));

    expect(
      firstPosProblemElementId({
        blockers: ['La factura fiscal requiere un cliente con RNC o cédula'],
        lines: [{ id: 'L-1', pricePending: false }],
      }),
    ).toBe(POS_FIELD_IDS.customer);

    expect(
      firstPosProblemElementId({
        blockers: ['Seleccione una moneda'],
        lines: [],
      }),
    ).toBe(POS_FIELD_IDS.currency);

    expect(
      firstPosProblemElementId({
        blockers: ['Complete la información fiscal'],
        lines: [],
      }),
    ).toBe(POS_FIELD_IDS.fiscal);

    expect(
      firstPosProblemElementId({
        blockers: ['Trabajo físico activo (OD-1) bloquea confirmar este ensamblaje'],
        lines: [{ id: 'L-1', pricePending: false }],
      }),
    ).toBe(POS_FIELD_IDS.blockers);
  });
});
