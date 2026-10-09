import { describe, expect, it } from 'vitest';

import {
  mergeBaselineEntries,
  pendingEnrichmentLabels,
} from '../../../../src/features/inventory/registration-enrichment';

describe('pendingEnrichmentLabels', () => {
  it('lists empty enrichment for a practical-minimum individual item', () => {
    expect(
      pendingEnrichmentLabels('INDIVIDUAL', {
        photos: [],
      }),
    ).toEqual([
      'Marca',
      'Ubicación',
      'Modelo',
      'Serial',
      'Número de parte',
      'Costo de adquisición',
      'Notas',
      'Fotos',
    ]);
  });

  it('lists unfilled category attributes by their catalog labels', () => {
    expect(
      pendingEnrichmentLabels(
        'INDIVIDUAL',
        {
          brand: 'Delco',
          location: 'Patio',
          acquisitionCostDop: 1200,
          photos: ['alt.jpg'],
        },
        [{ key: 'voltage', label: 'Voltaje', type: 'select', options: ['12V', '24V'] }],
      ),
    ).toEqual(['Modelo', 'Serial', 'Número de parte', 'Voltaje', 'Notas']);
  });

  it('only tracks brand and location for quantity products', () => {
    expect(
      pendingEnrichmentLabels('QUANTITY', {
        brand: 'Fleetguard',
      }),
    ).toEqual(['Ubicación']);
  });
});

describe('mergeBaselineEntries', () => {
  it('keeps previously entered present components when returning to step 2', () => {
    const merged = mergeBaselineEntries(
      ['Motor', 'Transmisión'],
      [
        {
          expectedComponentName: 'Motor',
          status: 'PRESENT',
          item: {
            name: 'Motor',
            categoryId: 'CAT-ENG',
            condition: 'USED',
          },
        },
      ],
    );

    expect(merged[0]).toMatchObject({
      expectedComponentName: 'Motor',
      status: 'PRESENT',
      item: { name: 'Motor', categoryId: 'CAT-ENG' },
    });
    expect(merged[1]).toEqual({
      expectedComponentName: 'Transmisión',
      status: 'MISSING',
    });
  });
});
