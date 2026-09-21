import { afterEach, describe, expect, it } from 'vitest';

import { cloneForRead, getMockState, resetMockState } from '../../../src/mocks/state';

describe('mock state', () => {
  afterEach(() => {
    resetMockState();
  });

  it('restores the complete deterministic seed', () => {
    const reset = resetMockState();

    expect(reset.users).toHaveLength(4);
    expect(reset.customers).toHaveLength(3);
    expect(reset.qtyProducts).toHaveLength(2);
    expect(reset.workOrders).toHaveLength(4);
    expect(reset.invoices).toHaveLength(6);
  });

  it('deep-clones repository read values', () => {
    const source = getMockState().items.find((item) => item.id === 'MOT-001')!;
    const clone = cloneForRead(source);

    clone.attributes!.displacement = 'mutado';

    expect(source.attributes?.displacement).toBe('14.8L');
  });
});
