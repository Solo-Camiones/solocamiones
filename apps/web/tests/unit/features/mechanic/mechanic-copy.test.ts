import { describe, expect, it } from 'vitest';

import type { MechanicWorkOrderView } from '../../../../src/api/contracts/entities';
import {
  completeActionLabel,
  mechanicCardActionLabel,
  mechanicNextAction,
  toMechanicUserMessage,
} from '../../../../src/features/mechanic/mechanic-copy';

function view(overrides: Partial<MechanicWorkOrderView> = {}): MechanicWorkOrderView {
  return {
    id: 'OD-DEMO-060',
    type: 'DISMANTLING',
    status: 'IN_PROGRESS',
    pieceId: 'TUR-009',
    pieceName: 'Turbo Garrett',
    href: '/mechanic/orders/OD-DEMO-060',
    beforePhotos: ['before.jpg'],
    afterPhotos: [],
    actions: { canTake: false, canAddEvidence: true, canComplete: false },
    ...overrides,
  };
}

describe('mechanic-copy', () => {
  it('turns connection failures into a retry instruction without dropping work', () => {
    expect(toMechanicUserMessage({ code: 'INTERNAL', message: 'HTTP 503: /evidence' })).toBe(
      'No hay conexión estable. Lo que ya fotografió o escribió sigue aquí; inténtelo de nuevo.',
    );
    expect(toMechanicUserMessage({ code: 'INTERNAL', message: 'Failed to fetch' })).toMatch(
      /conexión estable/,
    );
  });

  it('explains a lost claim without HTTP status codes', () => {
    expect(
      toMechanicUserMessage({ code: 'CONFLICT', message: 'Esta orden de trabajo ya fue tomada' }),
    ).toBe('Otro mecánico ya tomó esta orden. La cola se actualizó.');
  });

  it('names the next physical action without commercial language', () => {
    expect(mechanicNextAction(view())).toBe('Agregue al menos una foto de antes y una de después.');
    expect(
      mechanicNextAction(
        view({ actions: { canTake: false, canAddEvidence: true, canComplete: true } }),
      ),
    ).toBe('Cuando termine, complete el desmonte.');
    expect(
      mechanicNextAction(
        view({
          status: 'COMPLETED',
          actions: { canTake: false, canAddEvidence: false, canComplete: false },
        }),
      ),
    ).toBe('Trabajo terminado. La evidencia queda en el historial.');
    expect(
      mechanicNextAction(
        view({
          status: 'CANCELLED',
          actions: { canTake: false, canAddEvidence: false, canComplete: false },
        }),
      ),
    ).toBe('Esta orden fue cancelada. Ya no se puede completar ni agregar evidencia.');
    expect(completeActionLabel('INSTALLATION')).toBe('Completar instalación');
    expect(completeActionLabel('DISMANTLING')).toBe('Completar desmonte');
    expect(mechanicCardActionLabel(view({ status: 'COMPLETED' }), false)).toBe('Ver historial');
    expect(mechanicCardActionLabel(view({ status: 'CANCELLED' }), false)).toBe('Ver historial');
  });
});
