import { describe, expect, it } from 'vitest';

import { toPageLoadMessage } from '../../../../src/shared/ui/page-load-message';

describe('toPageLoadMessage', () => {
  it('replaces raw HTTP status text with the fallback', () => {
    expect(toPageLoadMessage('HTTP 500', 'No pudimos cargar el inventario.')).toBe(
      'No pudimos cargar el inventario.',
    );
    expect(toPageLoadMessage('Error 503', 'No pudimos cargar el inicio.')).toBe(
      'No pudimos cargar el inicio.',
    );
  });

  it('keeps specific business messages', () => {
    expect(
      toPageLoadMessage(
        'No tiene permiso para realizar esta acción',
        'No pudimos cargar el inicio.',
      ),
    ).toBe('No tiene permiso para realizar esta acción');
  });
});
