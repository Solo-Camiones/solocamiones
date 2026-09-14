// @vitest-environment jsdom

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SalesPage } from '../../../src/features/sales/SalesPage';
import { cancelInvoice } from '../../../src/mocks/services/sales-commands';
import { getMockState, resetMockState } from '../../../src/mocks/state';
import { createAuthValue, renderWithProviders } from '../../support/render';
import { signInAs } from '../../support/session';
import '../../support/dom';

describe('SalesPage', () => {
  beforeEach(() => {
    resetMockState();
    signInAs('SELLER');
  });

  afterEach(() => {
    resetMockState();
  });

  it('shows unpaid and partially paid seed invoices', async () => {
    renderWithProviders(<SalesPage />, { route: '/sales', auth: createAuthValue('SELLER') });

    expect(await screen.findByText('FAC-000098')).toBeVisible();
    expect(screen.getByText('FAC-000099')).toBeVisible();

    const unpaidRow = screen.getByText('FAC-000098').closest('tr');
    const partialRow = screen.getByText('FAC-000099').closest('tr');
    expect(unpaidRow && within(unpaidRow).getByText('Sin pagar')).toBeTruthy();
    expect(partialRow && within(partialRow).getByText('Pago parcial')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'FAC-000098' })).toHaveAttribute(
      'href',
      '/sales/INV-098',
    );
    expect(unpaidRow).toHaveClass('cursor-pointer');
  });

  it('lists ten invoices per page and moves with Siguiente', async () => {
    const user = userEvent.setup();
    const state = getMockState();
    const template = state.invoices.find((entry) => entry.number === 'FAC-000098');
    expect(template).toBeDefined();
    for (let index = 0; index < 8; index += 1) {
      state.invoices.push({
        ...template!,
        id: `INV-PAGE-${index}`,
        number: `FAC-PAGE-${String(index).padStart(3, '0')}`,
        lines: [...template!.lines],
        payments: [...template!.payments],
      });
    }

    renderWithProviders(<SalesPage />, { route: '/sales', auth: createAuthValue('SELLER') });

    expect(await screen.findByText('Mostrando 1–10 de 13')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
    expect(screen.getAllByRole('link', { name: /FAC-|Borrador/ })).toHaveLength(10);

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(await screen.findByText('Mostrando 11–13 de 13')).toBeVisible();
    expect(screen.getAllByRole('link', { name: /FAC-|Borrador/ })).toHaveLength(3);
  });

  it('filters drafts in the Borrador tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SalesPage />, { route: '/sales', auth: createAuthValue('SELLER') });
    await screen.findByText('FAC-000098');

    await user.click(screen.getByRole('button', { name: 'Borrador' }));

    expect(await screen.findByRole('link', { name: 'Borrador' })).toBeVisible();
    expect(screen.queryByText('FAC-000098')).not.toBeInTheDocument();
  });

  it('offers a new-draft action that stays available after listing', async () => {
    renderWithProviders(<SalesPage />, { route: '/sales', auth: createAuthValue('SELLER') });
    await screen.findByText('FAC-000098');
    expect(screen.getByRole('button', { name: 'Nuevo borrador' })).toBeVisible();
  });

  it('filters the list by invoice number so a previous sale can be found', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SalesPage />, { route: '/sales', auth: createAuthValue('SELLER') });
    await screen.findByText('FAC-000098');

    await user.type(screen.getByLabelText('Buscar por número o cliente'), 'FAC-000099');

    expect(screen.getByText('FAC-000099')).toBeVisible();
    expect(screen.queryByText('FAC-000098')).not.toBeInTheDocument();
  });

  it('finds an invoice that is not on the current page', async () => {
    const user = userEvent.setup();
    const state = getMockState();
    const template = state.invoices.find((entry) => entry.number === 'FAC-000098');
    expect(template).toBeDefined();
    for (let index = 0; index < 10; index += 1) {
      state.invoices.push({
        ...template!,
        id: `INV-NEWER-${index}`,
        number: `FAC-NEWER-${String(index).padStart(3, '0')}`,
        createdAt: '2026-09-10T12:00:00.000Z',
        confirmedAt: '2026-09-10T12:00:00.000Z',
        lines: [...template!.lines],
        payments: [...template!.payments],
      });
    }

    renderWithProviders(<SalesPage />, { route: '/sales', auth: createAuthValue('SELLER') });
    expect(await screen.findByText('FAC-NEWER-000')).toBeVisible();
    expect(screen.queryByText('FAC-000099')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Buscar por número o cliente'), 'FAC-000099');

    expect(await screen.findByText('FAC-000099')).toBeVisible();
    expect(screen.queryByText('FAC-NEWER-000')).not.toBeInTheDocument();
    expect(screen.getByText('Mostrando 1–1 de 1')).toBeVisible();
  });

  it('opens the draft tab from the tab query param', async () => {
    renderWithProviders(<SalesPage />, {
      route: '/sales?tab=DRAFT',
      auth: createAuthValue('SELLER'),
    });

    expect(await screen.findByRole('link', { name: 'Borrador' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Borrador' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('FAC-000098')).not.toBeInTheDocument();
  });

  it('hides zero-balance invoices when outstanding=1', async () => {
    renderWithProviders(<SalesPage />, {
      route: '/sales?outstanding=1',
      auth: createAuthValue('SELLER'),
    });

    expect(await screen.findByText('FAC-000098')).toBeVisible();
    expect(screen.getByText('FAC-000099')).toBeVisible();
    expect(screen.getByText('Saldo pendiente')).toBeVisible();
    expect(screen.queryByText('FAC-000097')).not.toBeInTheDocument();
    expect(screen.queryByText('FAC-000096')).not.toBeInTheDocument();
  });

  it('applies KPI filters before paginating', async () => {
    const state = getMockState();
    const paid = state.invoices.find((entry) => entry.number === 'FAC-000097');
    expect(paid).toBeDefined();
    for (let index = 0; index < 10; index += 1) {
      state.invoices.push({
        ...paid!,
        id: `INV-PAID-PAGE-${index}`,
        number: `FAC-PAID-PAGE-${index}`,
        createdAt: '2026-09-10T12:00:00.000Z',
        confirmedAt: '2026-09-10T12:00:00.000Z',
        lines: [...paid!.lines],
        payments: [...paid!.payments],
      });
    }

    renderWithProviders(<SalesPage />, {
      route: '/sales?outstanding=1',
      auth: createAuthValue('SELLER'),
    });

    expect(await screen.findByText('FAC-000098')).toBeVisible();
    expect(screen.queryByText('FAC-PAID-PAGE-0')).not.toBeInTheDocument();
  });

  it('keeps only invoices confirmed on the demo day when today=1', async () => {
    renderWithProviders(<SalesPage />, {
      route: '/sales?today=1',
      auth: createAuthValue('SELLER'),
    });

    expect(await screen.findByText('FAC-000098')).toBeVisible();
    expect(screen.getByText('FAC-000099')).toBeVisible();
    expect(screen.getByText('Facturas de hoy')).toBeVisible();
    expect(screen.queryByText('FAC-000096')).not.toBeInTheDocument();
    expect(screen.queryByText('FAC-000097')).not.toBeInTheDocument();
  });

  it('shows the payment history when payments=1', async () => {
    renderWithProviders(<SalesPage />, {
      route: '/sales?payments=1',
      auth: createAuthValue('SELLER'),
    });

    expect(await screen.findByText('FAC-000099')).toBeVisible();
    expect(screen.getByText('FAC-000097')).toBeVisible();
    expect(screen.getByText('FAC-000096')).toBeVisible();
    expect(screen.getByText('Historial de cobros')).toBeVisible();
    expect(screen.queryByText('FAC-000098')).not.toBeInTheDocument();
  });

  it('shows cancelled invoices with a status chip and no duplicate payment chip', async () => {
    const user = userEvent.setup();
    const state = getMockState();
    const admin = state.users.find((entry) => entry.role === 'ADMINISTRATOR')!;
    cancelInvoice(state, admin, { invoiceId: 'INV-098', reason: 'Cliente desistió' });

    renderWithProviders(<SalesPage />, { route: '/sales', auth: createAuthValue('SELLER') });
    await user.click(screen.getByRole('button', { name: 'Cancelada' }));

    const row = (await screen.findByText('FAC-000098')).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getAllByText('Cancelada')).toHaveLength(1);
    expect(within(row!).queryByText('Sin pagar')).not.toBeInTheDocument();
    expect(within(row!).getByText('—')).toBeVisible();
  });
});
