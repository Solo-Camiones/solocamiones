// @vitest-environment jsdom

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AdminRecoveryPage } from '../../../src/features/admin-recovery/AdminRecoveryPage';
import { getMockState, resetMockState } from '../../../src/mocks/state';
import { renderWithProviders } from '../../support/render';
import { signInAs } from '../../support/session';
import '../../support/dom';

describe('AdminRecoveryPage', () => {
  beforeEach(() => {
    resetMockState();
    signInAs('ADMINISTRATOR');
  });

  afterEach(() => {
    resetMockState();
  });

  it('releases the seed draft reservation and frees the part', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminRecoveryPage />, { route: '/recovery' });

    expect(await screen.findByText('INV-DRAFT-01')).toBeVisible();
    await user.type(screen.getByLabelText('Motivo'), 'Borrador abandonado');
    await user.click(screen.getByRole('button', { name: 'Liberar reserva' }));

    expect(await screen.findByText('Reserva liberada y borrador descartado')).toBeVisible();
    expect(
      getMockState().items.find((item) => item.id === 'ALT-004')?.reservedByDraftId,
    ).toBeUndefined();
    expect(getMockState().invoices.some((invoice) => invoice.id === 'INV-DRAFT-01')).toBe(false);
  });
});
