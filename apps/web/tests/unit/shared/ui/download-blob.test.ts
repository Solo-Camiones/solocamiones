// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob } from '../../../../src/shared/ui/download-blob';

describe('downloadBlob', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an object URL, clicks a temporary anchor, then revokes the URL', () => {
    const createObjectURL = vi.fn(() => 'blob:http://localhost/download');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    downloadBlob(blob, 'reporte.pdf');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/download');
  });
});
