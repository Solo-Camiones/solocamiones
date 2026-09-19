// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useObjectUrlState } from '../../../../src/shared/ui/useObjectUrlState';

describe('useObjectUrlState', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores a value, revokes on clear, and revokes again on unmount', () => {
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    const { result, unmount } = renderHook(() => useObjectUrlState<{ url: string; label: string }>());

    act(() => {
      result.current.setValue({ url: 'blob:http://localhost/one', label: 'one' });
    });
    expect(result.current.value).toEqual({ url: 'blob:http://localhost/one', label: 'one' });

    act(() => {
      result.current.revoke();
    });
    expect(result.current.value).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/one');

    act(() => {
      result.current.setValue({ url: 'blob:http://localhost/two', label: 'two' });
    });
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/two');
  });
});
