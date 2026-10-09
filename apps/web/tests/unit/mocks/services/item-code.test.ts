import { describe, expect, it } from 'vitest';

import { createInitialState } from '../../../../src/mocks/data/seed';
import {
  allocateItemCode,
  buildItemCodeSeq,
  formatItemCode,
  peekNextItemCode,
} from '../../../../src/mocks/services/item-code';

describe('item-code', () => {
  it('formats a padded public code', () => {
    expect(formatItemCode('MOT', 4)).toBe('MOT-004');
  });

  it('starts each seed category after the highest matching dummy code', () => {
    const state = createInitialState();
    expect(state.itemCodeSeq).toEqual(
      buildItemCodeSeq(
        state.categories,
        state.items.map((item) => item.id),
      ),
    );
    expect(peekNextItemCode(state.categories, state.itemCodeSeq, 'CAT-ENG')).toBe('MOT-004');
    expect(peekNextItemCode(state.categories, state.itemCodeSeq, 'CAT-ALT')).toBe('ALT-012');
    expect(peekNextItemCode(state.categories, state.itemCodeSeq, 'CAT-FIL')).toBe('FIL-002');
  });

  it('skips a taken code and never reuses the consumed number', () => {
    const state = createInitialState();
    const seq = { ...state.itemCodeSeq };
    const first = allocateItemCode(state.categories, seq, ['ALT-012'], 'CAT-ALT');
    const second = allocateItemCode(
      state.categories,
      seq,
      ['ALT-012', first.ok ? first.value : ''],
      'CAT-ALT',
    );

    expect(first.ok && first.value).toBe('ALT-013');
    expect(second.ok && second.value).toBe('ALT-014');
    expect(seq['CAT-ALT']).toBe(15);
  });
});
