// @vitest-environment jsdom

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConvertConduceModal } from '../../../src/features/sales/ConvertConduceModal';
import { createAuthValue, renderWithProviders } from '../../support/render';
import '../../support/dom';

describe('ConvertConduceModal', () => {
  it('submits a non-fiscal conversion by default', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <ConvertConduceModal
        open
        conduceNumber="CON-000001"
        customerHasFiscalId
        isSaving={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
      { auth: createAuthValue('ADMINISTRATOR') },
    );

    const dialog = screen.getByRole('dialog', { name: 'Facturar conduce' });
    expect(within(dialog).getByText(/Se asignará un número FAC-/)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Facturar' }));
    expect(onSubmit).toHaveBeenCalledWith(false);
  });

  it('lets the administrator request a fiscal FAC- when the snapshot has RNC', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <ConvertConduceModal
        open
        conduceNumber="CON-000001"
        customerHasFiscalId
        isSaving={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
      { auth: createAuthValue('ADMINISTRATOR') },
    );

    const dialog = screen.getByRole('dialog', { name: 'Facturar conduce' });
    await user.click(within(dialog).getByLabelText(/Factura con comprobante fiscal/));
    await user.click(within(dialog).getByRole('button', { name: 'Facturar' }));
    expect(onSubmit).toHaveBeenCalledWith(true);
  });

  it('disables fiscal when the customer snapshot has no RNC/cédula', () => {
    renderWithProviders(
      <ConvertConduceModal
        open
        conduceNumber="CON-000002"
        customerHasFiscalId={false}
        isSaving={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
      { auth: createAuthValue('ADMINISTRATOR') },
    );

    const dialog = screen.getByRole('dialog', { name: 'Facturar conduce' });
    expect(within(dialog).getByLabelText(/Factura con comprobante fiscal/)).toBeDisabled();
    expect(within(dialog).getByText(/no tiene RNC\/cédula/)).toBeVisible();
  });

  it('shows the conversion error from the parent action', () => {
    renderWithProviders(
      <ConvertConduceModal
        open
        conduceNumber="CON-000001"
        customerHasFiscalId
        isSaving={false}
        error="Solo se puede facturar un conduce activo"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
      { auth: createAuthValue('ADMINISTRATOR') },
    );

    expect(screen.getByText('No se pudo facturar')).toBeVisible();
    expect(screen.getByText('Solo se puede facturar un conduce activo')).toBeVisible();
  });
});
