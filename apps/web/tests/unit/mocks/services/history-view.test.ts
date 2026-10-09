import { describe, expect, it } from 'vitest';

import { createInitialState } from '../../../../src/mocks/data/seed';
import { resolveActorName, toHistoryEventView } from '../../../../src/mocks/services/history-view';

describe('history-view', () => {
  it('keeps a deactivated user identifiable as the historical actor', () => {
    const state = createInitialState();
    const carlos = state.users.find((user) => user.id === 'U-CARLOS');
    expect(carlos?.active).toBe(false);

    expect(resolveActorName(state.users, 'U-CARLOS')).toBe('Carlos Méndez');
    expect(
      toHistoryEventView(
        state.events.find((event) => event.id === 'EV-004')!,
        state.users,
      ).actorName,
    ).toBe('Carlos Méndez');
  });

  it('falls back to the stored actor id when the user directory has no match', () => {
    expect(resolveActorName([], 'U-GONE')).toBe('U-GONE');
    expect(resolveActorName([], undefined)).toBeUndefined();
  });
});
