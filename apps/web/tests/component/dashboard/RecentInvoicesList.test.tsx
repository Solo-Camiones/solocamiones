// @vitest-environment jsdom

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import type { RecentInvoiceRow } from '../../../src/api/contracts/dashboard';
import { RecentInvoicesList } from '../../../src/features/dashboard/RecentInvoicesList';
import { renderWithProviders } from '../../support/render';
import '../../support/dom';

function invoice(overrides: Partial<RecentInvoiceRow> = {}): RecentInvoiceRow {
  return {
    id: 'INV-001',
    number: 'FAC-000001',
    customerName: 'Transportes del Caribe SRL',
    status: 'COMPLETED',
    paymentState: 'PAID',
    currency: 'DOP',
    total: 1_250.5,
    balance: 0,
    ...overrides,
  };
}

describe('RecentInvoicesList', () => {
  it('shows the completed-invoices empty state', () => {
    renderWithProviders(<RecentInvoicesList invoices={[]} />);

    expect(screen.getByRole('heading', { name: 'Facturas recientes' })).toBeVisible();
    expect(screen.getByText('No hay facturas completadas')).toBeVisible();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('formats DOP and USD totals with their respective currencies', () => {
    renderWithProviders(
      <RecentInvoicesList
        invoices={[
          invoice({ id: 'INV-DOP', number: 'FAC-000010' }),
          invoice({
            id: 'INV-USD',
            number: 'FAC-000011',
            customerName: 'Repuestos del Norte',
            currency: 'USD',
            total: 99.95,
          }),
        ]}
      />,
    );

    expect(screen.getByText('RD$1,250.50')).toBeVisible();
    expect(screen.getByText('$99.95')).toBeVisible();
  });

  it('renders every payment state with its user-facing label', () => {
    const states: Array<{
      state: RecentInvoiceRow['paymentState'];
      label: string;
    }> = [
      { state: 'PAID', label: 'Pagada' },
      { state: 'PAID_LATE', label: 'Pagada con retraso' },
      { state: 'PENDING', label: 'Pendiente' },
      { state: 'OVERDUE', label: 'Vencida' },
      { state: 'CANCELLED', label: 'Cancelada' },
      { state: 'PARTIALLY_PAID', label: 'Parcial' },
      { state: 'UNPAID', label: 'Sin pagar' },
    ];

    renderWithProviders(
      <RecentInvoicesList
        invoices={states.map(({ state }, index) =>
          invoice({
            id: `INV-${state}`,
            number: `FAC-${String(index + 1).padStart(6, '0')}`,
            paymentState: state,
          }),
        )}
      />,
    );

    for (const { label } of states) {
      expect(screen.getByText(label)).toBeVisible();
    }
  });

  it('renders a draft without a number when optional confirmation data is absent', () => {
    renderWithProviders(
      <RecentInvoicesList
        invoices={[
          invoice({
            id: 'INV-DRAFT',
            number: '',
            customerName: 'Cliente de borrador',
            status: 'DRAFT',
            paymentState: 'PENDING',
            balance: 1_250.5,
            confirmedAt: undefined,
          }),
        ]}
      />,
    );

    expect(screen.getByText('Cliente de borrador')).toBeVisible();
    expect(screen.getByText('Pendiente')).toBeVisible();
    expect(screen.queryByText(/FAC-/)).not.toBeInTheDocument();
  });

  it('navigates to the selected invoice detail', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={<RecentInvoicesList invoices={[invoice({ id: 'INV-DETAIL' })]} />}
        />
        <Route path="/sales/:invoiceId" element={<h1>Detalle de factura</h1>} />
      </Routes>,
    );

    const invoiceLink = screen.getByRole('link', { name: /FAC-000001/ });
    expect(invoiceLink).toHaveAttribute('href', '/sales/INV-DETAIL');

    await user.click(invoiceLink);

    expect(screen.getByRole('heading', { name: 'Detalle de factura' })).toBeVisible();
  });
});
