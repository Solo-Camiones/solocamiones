// @vitest-environment jsdom

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReceivablesPage } from '../../../src/features/receivables/ReceivablesPage';
import { getMockState, resetMockState } from '../../../src/mocks/state';
import { createAuthValue, renderWithProviders } from '../../support/render';
import { signInAs } from '../../support/session';
import { mockSalesRepository } from '../../../src/mocks/repositories';
import type { SalesRepository } from '../../../src/api/contracts/repositories';
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

  afterEach(() => {
    vi.restoreAllMocks();
    resetMockState();
  });

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

    expect(screen.getByRole('heading', { name: 'Cuentas por cobrar' })).toBeVisible();
    expect(screen.getByLabelText('Cliente')).toBeVisible();
    expect(await screen.findByText('FAC-000096')).toBeVisible();
    expect(screen.queryByText('FAC-000098')).not.toBeInTheDocument();
    const summary = screen
      .getByRole('heading', { name: 'Resumen de saldos abiertos' })
      .closest('section');
    expect(summary).not.toBeNull();
    expect(within(summary!).getAllByText('Logística Norte SA').length).toBeGreaterThan(0);
    expect(within(summary!).queryByText('Transportes del Caribe SRL')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Cliente'));
    expect(screen.getByRole('option', { name: 'Transportes del Caribe SRL' })).toBeVisible();
    await user.click(screen.getByRole('option', { name: 'Transportes del Caribe SRL' }));

    expect(await screen.findByText('FAC-000098')).toBeVisible();
    expect(screen.queryByText('FAC-000096')).not.toBeInTheDocument();
  });

  it('only offers customer and document filters', async () => {
    renderWithProviders(<ReceivablesPage />, {
      route: '/receivables',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    await screen.findByText('FAC-000098');

    expect(screen.getByLabelText('Cliente')).toBeVisible();
    expect(screen.getByPlaceholderText('FAC-000123 o CON-000123')).toBeVisible();
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

    await user.type(screen.getByLabelText('Documento'), 'fac-000099');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('FAC-000099')).toBeVisible();
    expect(screen.queryByText('FAC-000098')).not.toBeInTheDocument();
  });

  it('finds an open conduce by CON- number through the repository filter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReceivablesPage />, {
      route: '/receivables',
      auth: createAuthValue('ADMINISTRATOR'),
    });
    await screen.findByText('FAC-000098');

    await user.type(screen.getByLabelText('Documento'), 'con-000001');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('CON-000001')).toBeVisible();
    expect(screen.queryByText('FAC-000098')).not.toBeInTheDocument();
  });

  it('keeps the list visible when the document lookup is invalid', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReceivablesPage />, {
      route: '/receivables',
      auth: createAuthValue('ADMINISTRATOR'),
    });
    expect(await screen.findByText('FAC-000098')).toBeVisible();

    await user.type(screen.getByLabelText('Documento'), '123');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(screen.getByRole('heading', { name: 'Cuentas por cobrar' })).toBeVisible();
    expect(screen.getByText('Debe ser un número FAC-000123 o CON-000123.')).toBeVisible();
    expect(screen.getByText('FAC-000098')).toBeVisible();
    expect(screen.queryByText('No se pudo cargar cuentas por cobrar')).not.toBeInTheDocument();
  });

  it('enables and downloads the statement only after selecting a customer with DOP balance', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:http://localhost/account-statement');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const download = vi
      .spyOn(mockSalesRepository as SalesRepository, 'getAccountStatementPdf')
      .mockResolvedValue({
        ok: true,
        value: {
          blob: new Blob(['pdf'], { type: 'application/pdf' }),
          filename: 'estado-de-cuenta-transportes-del-caribe-srl.pdf',
        },
      });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderWithProviders(<ReceivablesPage />, {
      route: '/receivables',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    const button = await screen.findByRole('button', { name: 'Generar estado de cuenta' });
    expect(button).toBeDisabled();
    await user.click(screen.getByLabelText('Cliente'));
    await user.click(screen.getByRole('option', { name: 'Transportes del Caribe SRL' }));
    const enabledButton = screen.getByRole('button', { name: 'Generar estado de cuenta' });
    expect(enabledButton).toBeEnabled();
    await user.click(enabledButton);

    await waitFor(() => expect(download).toHaveBeenCalledWith('C1'));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/account-statement');
  });
});
