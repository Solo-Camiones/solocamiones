// @vitest-environment jsdom

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { REVIEW_EMPTY_VALUE, ReviewSummary } from '../../../src/shared/ui';
import { renderWithProviders } from '../../support/render';
import '../../support/dom';

describe('ReviewSummary', () => {
  it('renders labels, values, and a dash for empty optional fields', () => {
    renderWithProviders(
      <ReviewSummary
        rows={[
          { label: 'Nombre', value: 'Flota Este' },
          { label: 'Notas', value: '  ' },
        ]}
      >
        <p>Contactos</p>
      </ReviewSummary>,
    );

    expect(screen.getByText('Nombre')).toBeVisible();
    expect(screen.getByText('Flota Este')).toBeVisible();
    expect(screen.getByText('Notas')).toBeVisible();
    expect(screen.getByText(REVIEW_EMPTY_VALUE)).toBeVisible();
    expect(screen.getByText('Contactos')).toBeVisible();
  });
});
