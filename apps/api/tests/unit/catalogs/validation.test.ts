import { describe, expect, it } from 'vitest';

import { createCatalogServiceSchema } from '../../../src/features/catalogs/validation.js';

describe('catalog service validation', () => {
  it('trims name and blank description', () => {
    expect(
      createCatalogServiceSchema.parse({
        name: '  Instalación  ',
        description: '  En bahía  ',
        active: false,
      }),
    ).toEqual({ name: 'Instalación', description: 'En bahía', active: false });
    expect(createCatalogServiceSchema.parse({ name: 'Desarme', description: '  ' })).toEqual({
      name: 'Desarme',
      description: null,
    });
  });

  it('rejects empty names, prices and unknown fields', () => {
    expect(createCatalogServiceSchema.safeParse({ name: ' ' }).success).toBe(false);
    expect(createCatalogServiceSchema.safeParse({ name: 'A', price: 100 }).success).toBe(false);
    expect(createCatalogServiceSchema.safeParse({ name: 'A', extra: true }).success).toBe(false);
  });
});
