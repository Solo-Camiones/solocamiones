import { describe, expect, it } from 'vitest';

import { historyEventSchema } from '../../../src/features/history/validation.js';

const id = '11111111-1111-4111-8111-111111111111';
const snapshot = {
  name: 'Taller Norte',
  rnc: '131123456',
  address: null,
  notes: null,
  isDefault: false,
  contacts: [
    { name: 'Ana', phone: '8090000000', email: null, title: null, isPrimary: true },
  ],
};

describe('customer history validation', () => {
  it('accepts CUSTOMER_CREATED with a USER actor and rejects unknown payload fields', () => {
    const event = {
      actor: { actorType: 'USER' as const, actorUserId: id },
      subjectType: 'CUSTOMER' as const,
      subjectId: id,
      eventType: 'CUSTOMER_CREATED' as const,
      payload: snapshot,
    };
    expect(historyEventSchema.parse(event)).toEqual(event);
    expect(
      historyEventSchema.safeParse({
        ...event,
        payload: { ...snapshot, passwordHash: 'secret' },
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
