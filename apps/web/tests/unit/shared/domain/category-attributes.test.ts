import { describe, expect, it } from 'vitest';

import {
  applyCategoryAttributes,
  MAX_CATEGORY_ATTRIBUTES,
  parseAttributeDefinitions,
  pendingAttributeLabels,
} from '../../../../src/shared/domain/category-attributes';

describe('parseAttributeDefinitions', () => {
  it('normalizes a small controlled schema', () => {
    const result = parseAttributeDefinitions([
      {
        key: 'Voltage',
        label: ' Voltaje ',
        type: 'select',
        required: true,
        options: ['12V', '24V'],
      },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        {
          key: 'voltage',
          label: 'Voltaje',
          type: 'select',
          required: true,
          options: ['12V', '24V'],
        },
      ]);
    }
  });

  it('rejects duplicate keys and oversized catalogs', () => {
    const duplicate = parseAttributeDefinitions([
      { key: 'size', label: 'Medida', type: 'text' },
      { key: 'size', label: 'Tamaño', type: 'text' },
    ]);
    const oversized = parseAttributeDefinitions(
      Array.from({ length: MAX_CATEGORY_ATTRIBUTES + 1 }, (_, index) => ({
        key: `field_${index}`,
        label: `Campo ${index}`,
        type: 'text' as const,
      })),
    );

    expect(duplicate.ok).toBe(false);
    expect(oversized.ok).toBe(false);
  });
});

describe('applyCategoryAttributes', () => {
  const tire = [
    {
      key: 'tireType',
      label: 'Tipo',
      type: 'select' as const,
      required: true,
      options: ['Radial'],
    },
    { key: 'size', label: 'Medida', type: 'text' as const, required: true },
  ];

  it('rejects unknown keys and missing required values', () => {
    const unknown = applyCategoryAttributes(tire, { voltaje: '24V' });
    const missing = applyCategoryAttributes(tire, { tireType: 'Radial' });

    expect(unknown.ok).toBe(false);
    expect(missing.ok).toBe(false);
  });

  it('accepts valid values and preserves historical keys no longer in the schema', () => {
    const result = applyCategoryAttributes(
      [{ key: 'displacement', label: 'Cilindrada', type: 'text' }],
      { displacement: '15L' },
      { legacy: 'kept', displacement: '14.8L' },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ legacy: 'kept', displacement: '15L' });
    }
  });

  it('rejects a number that is not finite', () => {
    const result = applyCategoryAttributes(
      [{ key: 'capacity', label: 'Capacidad', type: 'number' }],
      { capacity: 'n/a' },
    );

    expect(result.ok).toBe(false);
  });
});

describe('pendingAttributeLabels', () => {
  it('lists unfilled category fields by label', () => {
    expect(
      pendingAttributeLabels(
        [
          { key: 'voltage', label: 'Voltaje', type: 'select', options: ['12V'] },
          { key: 'capacity', label: 'Capacidad', type: 'text' },
        ],
        { voltage: '12V' },
      ),
    ).toEqual(['Capacidad']);
  });
});
