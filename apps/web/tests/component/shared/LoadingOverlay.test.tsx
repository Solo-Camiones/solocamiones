// @vitest-environment jsdom

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoadingOverlay } from '../../../src/shared/ui';
import { renderWithProviders } from '../../support/render';
import '../../support/dom';

describe('LoadingOverlay', () => {
  it('keeps children visible and announces refresh when active', () => {
    renderWithProviders(
      <LoadingOverlay active label="Actualizando clientes">
        <p>Fila existente</p>
      </LoadingOverlay>,
    );

    expect(screen.getByText('Fila existente')).toBeVisible();
    const status = screen.getByRole('status', { name: 'Actualizando clientes' });
    expect(status).toHaveAttribute('aria-busy', 'true');
  });

  it('does not announce a status region when idle', () => {
    renderWithProviders(
      <LoadingOverlay active={false} label="Actualizando clientes">
        <p>Fila existente</p>
      </LoadingOverlay>,
    );

    expect(screen.getByText('Fila existente')).toBeVisible();
    expect(screen.queryByRole('status', { name: 'Actualizando clientes' })).toBeNull();
  });
});
