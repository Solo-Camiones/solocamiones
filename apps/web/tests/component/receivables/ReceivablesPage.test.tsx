// @vitest-environment jsdom

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ReceivablesPage } from '../../../src/features/receivables/ReceivablesPage';
import { getMockState, resetMockState } from '../../../src/mocks/state';
import { createAuthValue, renderWithProviders } from '../../support/render';
import { signInAs } from '../../support/session';
import '../../support/dom';

function openUsdReceivableForSecondCustomer() {
  const invoice = getMockState().invoices.find((entry) => entry.id === 'INV-096');
  if (invoice) invoice.paymentState = 'UNPAID';
}

describe('ReceivablesPage', () => {
  beforeEach(() => {
    resetMockState();
    signInAs('ADMINISTRATOR');
    openUsdReceivableForSecondCustomer();
  });

  afterEach(() => resetMockState());

  it('shows issued date and filters invoices and open summary by customer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReceivablesPage />, {
      route: '/receivables',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByText('FAC-000098')).toBeVisible();
    expect(screen.getByText('FAC-000096')).toBeVisible();
    expect(screen.getAllByText('25/08/2026').length).toBeGreaterThan(0);

    await user.click(screen.getByLabelText('Cliente'));
    await user.type(screen.getByLabelText('Buscar cliente…'), 'logística');
    await user.click(screen.getByRole('option', { name: 'Logística Norte SA' }));

    expect(await screen.findByText('FAC-000096')).toBeVisible();
    expect(screen.queryByText('FAC-000098')).not.toBeInTheDocument();
    const summary = screen
      .getByRole('heading', { name: 'Resumen de saldos abiertos' })
      .closest('section');
    expect(summary).not.toBeNull();
    expect(within(summary!).getByText('Logística Norte SA')).toBeVisible();
    expect(within(summary!).queryByText('Transportes del Caribe SRL')).not.toBeInTheDocument();
  });

  it('only offers customer and invoice filters', async () => {
    renderWithProviders(<ReceivablesPage />, {
      route: '/receivables',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    await screen.findByText('FAC-000098');

    expect(screen.getByLabelText('Cliente')).toBeVisible();
    expect(screen.getByPlaceholderText('FAC-000123')).toBeVisible();
    expect(screen.queryByLabelText('Estado de pago')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Moneda')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Emitida desde')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Emitida hasta')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/UUID/i)).not.toBeInTheDocument();
  });

  it('finds an invoice by its visible FAC number through the repository filter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReceivablesPage />, {
      route: '/receivables',
      auth: createAuthValue('ADMINISTRATOR'),
    });
    await screen.findByText('FAC-000098');

    await user.type(screen.getByLabelText('Factura'), 'fac-000099');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('FAC-000099')).toBeVisible();
    expect(screen.queryByText('FAC-000098')).not.toBeInTheDocument();
  });

  it('keeps the list visible when the invoice lookup is invalid', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReceivablesPage />, {
      route: '/receivables',
      auth: createAuthValue('ADMINISTRATOR'),
    });
    expect(await screen.findByText('FAC-000098')).toBeVisible();

    await user.type(screen.getByLabelText('Factura'), '123');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(screen.getByRole('heading', { name: 'Cuentas por cobrar' })).toBeVisible();
    expect(screen.getByText('Debe ser un número de factura FAC-000123.')).toBeVisible();
    expect(screen.getByText('FAC-000098')).toBeVisible();
    expect(screen.queryByText('No se pudo cargar cuentas por cobrar')).not.toBeInTheDocument();
  });

});
