import { describe, expect, it } from 'vitest';

import { historyEventSchema } from '../../../src/features/history/validation.js';

const id = '11111111-1111-4111-8111-111111111111';
const snapshot = {
  name: 'Instalación',
  description: 'En bahía',
  active: true,
};

describe('catalog service history validation', () => {
  it('accepts SERVICE_CREATED with a USER actor and rejects extra payload fields and SYSTEM actor', () => {
    const event = {
      actor: { actorType: 'USER' as const, actorUserId: id },
      subjectType: 'MECHANICAL_SERVICE' as const,
      subjectId: id,
      eventType: 'SERVICE_CREATED' as const,
      payload: snapshot,
    };
    expect(historyEventSchema.parse(event)).toEqual(event);
    expect(
      historyEventSchema.safeParse({
        ...event,
        payload: { ...snapshot, price: 100 },
      }).success,
    ).toBe(false);
    expect(
      historyEventSchema.safeParse({
        ...event,
        actor: { actorType: 'SYSTEM', actorUserId: null },
      }).success,
    ).toBe(false);
  });
});
