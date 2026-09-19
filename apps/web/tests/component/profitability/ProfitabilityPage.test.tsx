// @vitest-environment jsdom

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProfitabilityPage } from '../../../src/features/profitability/ProfitabilityPage';
import { resetMockState } from '../../../src/mocks/state';
import { money } from '../../../src/shared/ui';
import { renderWithProviders } from '../../support/render';
import { chooseSelectOption } from '../../support/select-menu';
import { signInAs } from '../../support/session';
import '../../support/dom';

describe('ProfitabilityPage', () => {
  beforeEach(() => {
    resetMockState();
    signInAs('ADMINISTRATOR');
  });

  afterEach(() => {
    resetMockState();
  });

  it('shows period KPIs without charts or invoice profit detail until acquisition cost exists', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfitabilityPage />, { route: '/profitability' });
    await screen.findByLabelText('Período');
    await chooseSelectOption(user, 'Período', '30 días');

    expect(screen.getByRole('heading', { name: 'Rentabilidad' })).toBeVisible();
    expect(screen.getByText('Facturado, cobrado neto y cuentas por cobrar en pesos.')).toBeVisible();
    expect(screen.getAllByText('Cobrado neto').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cuentas por cobrar').length).toBeGreaterThan(0);
    expect(screen.getByText('Ver cuentas por cobrar')).toBeVisible();
    expect(screen.getByRole('link', { name: /Ver cuentas por cobrar/ })).toHaveAttribute(
      'href',
      '/receivables',
    );

    expect(screen.queryByRole('img', { name: 'Evolución financiera' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Ganancia por mes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Cobrado neto por mes' })).not.toBeInTheDocument();
    expect(screen.queryByText('Detalle de rentabilidad por factura')).not.toBeInTheDocument();
    expect(screen.queryByText('FAC-000096')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar ganancia' })).not.toBeInTheDocument();
  });

  it('lets the administrator change the period from the styled selector', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfitabilityPage />, { route: '/profitability' });

    const period = await screen.findByLabelText('Período');
    expect(period).toHaveTextContent('Hoy');

    await chooseSelectOption(user, 'Período', '30 días');
    expect(screen.getByLabelText('Período')).toHaveTextContent('30 días');
  });

  it('shows invoiced and collected-by-method KPIs for the selected period', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfitabilityPage />, { route: '/profitability' });
    await screen.findByLabelText('Período');
    await chooseSelectOption(user, 'Período', '30 días');

    expect(await screen.findByText('Facturado al contado')).toBeVisible();
    expect(screen.getByText('Facturado a crédito')).toBeVisible();
    expect(screen.getByText('Total facturado')).toBeVisible();
    expect(screen.getByText('Cobrado efectivo')).toBeVisible();
    expect(screen.getByText('Cobrado transferencia')).toBeVisible();
    expect(screen.getByText('Cobrado cheque')).toBeVisible();

    // Contado: FAC-000097 (DOP 5,500). FAC-000096 USD without rate is omitted.
    // Crédito: FAC-000098 (19,500) + FAC-000099 (7,200). Cobrado efectivo: 5,500 + 3,600.
    expect(screen.getAllByText(money(5_500, 'DOP')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(money(19_500 + 7_200, 'DOP')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(money(5_500 + 19_500 + 7_200, 'DOP')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(money(5_500 + 3_600, 'DOP')).length).toBeGreaterThan(0);
  });
});
