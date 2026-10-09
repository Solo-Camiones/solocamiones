// @vitest-environment jsdom

import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DashboardPage } from '../../../src/features/dashboard/DashboardPage';
import { mockCategoryRepository } from '../../../src/mocks/repositories/MockCategoryRepository';
import { resetMockState } from '../../../src/mocks/state';
import { OPERATIONAL_HREFS } from '../../../src/shared/navigation/operational-hrefs';
import { createAuthValue, renderWithProviders } from '../../support/render';
import { signInAs } from '../../support/session';
import '../../support/dom';

describe('DashboardPage', () => {
  beforeEach(() => {
    resetMockState();
  });

  afterEach(() => {
    resetMockState();
  });

  it('shows profitability and FX information to administrators', async () => {
    signInAs('ADMINISTRATOR');
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Necesita atención' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Operación de hoy' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Finanzas' })).toBeVisible();
    expect(screen.getByText('Ganancia bruta en pesos')).toBeVisible();
    expect(screen.getByText('Tasas de cambio pendientes')).toBeVisible();
    expect(screen.getByText('RD$8,900.00')).toBeVisible();
    expect(screen.getAllByText(/por Laura Pérez/).length).toBeGreaterThan(0);
  });

  it('turns attention KPIs into links to existing filtered lists', async () => {
    signInAs('ADMINISTRATOR');
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByRole('heading', { name: 'Necesita atención' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Componentes por validar/ })).toHaveAttribute(
      'href',
      OPERATIONAL_HREFS.inventoryPendingCatalog,
    );
    expect(screen.getByRole('link', { name: /Desmontes pendientes/ })).toHaveAttribute(
      'href',
      OPERATIONAL_HREFS.workOrdersPendingDismantling,
    );
    expect(screen.getByRole('link', { name: /Tasas de cambio pendientes/ })).toHaveAttribute(
      'href',
      OPERATIONAL_HREFS.profitabilityPendingFx,
    );
    expect(screen.getByRole('link', { name: /Ensamblajes incompletos/ })).toHaveAttribute(
      'href',
      OPERATIONAL_HREFS.inventoryIncompleteAssemblies,
    );
    expect(screen.getByRole('link', { name: /Facturas de hoy/ })).toHaveAttribute(
      'href',
      OPERATIONAL_HREFS.salesToday,
    );
    expect(screen.getByRole('link', { name: /Ganancia bruta en pesos/ })).toHaveAttribute(
      'href',
      OPERATIONAL_HREFS.profitability,
    );
  });

  it('shows draft count instead of profitability to sellers', async () => {
    signInAs('SELLER');
    renderWithProviders(<DashboardPage />, { auth: createAuthValue('SELLER') });

    expect(await screen.findByText('Borradores')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Operación de hoy' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Finanzas' })).not.toBeInTheDocument();
    expect(screen.queryByText('Cobros')).not.toBeInTheDocument();
    expect(screen.queryByText('Saldo pendiente')).not.toBeInTheDocument();
    expect(screen.queryByText('Ganancia bruta en pesos')).not.toBeInTheDocument();
    expect(screen.queryByText('Tasas de cambio pendientes')).not.toBeInTheDocument();
    expect(screen.queryByText('Tasa de cambio pendiente')).not.toBeInTheDocument();
    expect(screen.queryByText('Desmontes pendientes')).not.toBeInTheDocument();
    expect(screen.queryByText('Desarmes pendientes')).not.toBeInTheDocument();
    expect(screen.queryByText('Órdenes en proceso')).not.toBeInTheDocument();
    expect(screen.queryByText('Orden de Trabajo en proceso')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Catálogo: ensamblajes afectados por un componente nuevo'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Componentes por validar')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Desmontes pendientes/ })).not.toBeInTheDocument();
  });

  it('shows a catalog-review banner to administrators after a new expected component is added', async () => {
    signInAs('ADMINISTRATOR');
    await mockCategoryRepository.save({
      id: 'CAT-ENG',
      name: 'Motor',
      isAssembly: true,
      expectedComponents: ['Alternador', 'Turbo', 'Motor de arranque', 'Bomba de aceite'],
    });

    renderWithProviders(<DashboardPage />);

    expect(
      await screen.findByText('Catálogo: ensamblajes afectados por un componente nuevo'),
    ).toBeVisible();
    expect(screen.getByText('Componentes por validar')).toBeVisible();
    expect(screen.getByRole('link', { name: /Detroit DD15 Completo \(MOT-001\)/ })).toBeVisible();
    expect(screen.getAllByText(/ahora motor espera Bomba de aceite/i).length).toBeGreaterThan(0);
  });

  it('renders an authorization error for mechanics', async () => {
    signInAs('MECHANIC');
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('No se pudo cargar el inicio')).toBeVisible();
    expect(screen.getByText('No tiene permiso para realizar esta acción')).toBeVisible();
  });
});
