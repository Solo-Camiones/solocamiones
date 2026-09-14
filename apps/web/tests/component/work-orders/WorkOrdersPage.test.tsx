// @vitest-environment jsdom

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkOrdersPage } from '../../../src/features/work-orders/WorkOrdersPage';
import { WorkOrderDetailPage } from '../../../src/features/work-orders/WorkOrderDetailPage';
import { resetMockState } from '../../../src/mocks/state';
import { createAuthValue, renderWithProviders } from '../../support/render';
import { chooseSelectOption } from '../../support/select-menu';
import { signInAs } from '../../support/session';
import '../../support/dom';

function workOrderRoutes() {
  return (
    <Routes>
      <Route path="/work-orders" element={<WorkOrdersPage />} />
      <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
    </Routes>
  );
}

describe('WorkOrdersPage', () => {
  beforeEach(() => {
    resetMockState();
  });

  afterEach(() => {
    resetMockState();
  });

  it('shows seed orders with type, assignee, invoice and status', async () => {
    signInAs('ADMINISTRATOR');
    renderWithProviders(workOrderRoutes(), {
      route: '/work-orders',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByRole('heading', { name: 'Órdenes de Trabajo' })).toBeVisible();
    expect(screen.getByText('OD-DEMO-060')).toBeVisible();
    expect(screen.getByText('OD-DEMO-061')).toBeVisible();
    expect(screen.getByText('OD-DEMO-062')).toBeVisible();
    expect(screen.getByText('OD-DEMO-063')).toBeVisible();
    expect(screen.getByText('Pedro Santana')).toBeVisible();
    expect(screen.getByText('FAC-000096')).toBeVisible();
    expect(screen.getAllByText('En proceso').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Completada').length).toBeGreaterThan(0);
    const orderLink = screen.getByRole('link', { name: 'OD-DEMO-060' });
    expect(orderLink).toHaveAttribute('href', '/work-orders/OD-DEMO-060');
    expect(orderLink.closest('tr')).toHaveClass('cursor-pointer');
  });

  it('filters the in-progress tab to the assigned seed order', async () => {
    signInAs('ADMINISTRATOR');
    const user = userEvent.setup();
    renderWithProviders(workOrderRoutes(), {
      route: '/work-orders',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByText('OD-DEMO-060')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'En proceso' }));

    expect(await screen.findByText('OD-DEMO-060')).toBeVisible();
    expect(screen.queryByText('OD-DEMO-061')).not.toBeInTheDocument();
    expect(screen.queryByText('OD-DEMO-062')).not.toBeInTheDocument();
  });

  it('shows pending dismantling orders from type and status query params', async () => {
    signInAs('ADMINISTRATOR');
    renderWithProviders(workOrderRoutes(), {
      route: '/work-orders?type=DISMANTLING&status=PENDING',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByText('OD-DEMO-061')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Pendiente' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Tipo: Desmonte/)).toBeVisible();
    expect(screen.queryByText('OD-DEMO-060')).not.toBeInTheDocument();
    expect(screen.queryByText('OD-DEMO-062')).not.toBeInTheDocument();
    expect(screen.queryByText('OD-DEMO-063')).not.toBeInTheDocument();
  });

  it('creates a manual dismantling from the list and opens the detail', async () => {
    signInAs('ADMINISTRATOR');
    const user = userEvent.setup();
    renderWithProviders(workOrderRoutes(), {
      route: '/work-orders',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByRole('heading', { name: 'Órdenes de Trabajo' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Nueva orden de trabajo' }));

    const dialog = await screen.findByRole('dialog');
    await chooseSelectOption(user, 'Pieza', 'MOT-001', dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Crear orden de trabajo' }));

    expect(await screen.findByRole('heading', { name: 'OD-DEMO-064' })).toBeVisible();
    expect(screen.getByText(/Detroit DD15 Completo/)).toBeVisible();
    expect(screen.getByText('Pendiente')).toBeVisible();
  });
});

describe('WorkOrderDetailPage', () => {
  beforeEach(() => {
    resetMockState();
  });

  afterEach(() => {
    resetMockState();
  });

  it('cancels a pending order with a reason and shows history', async () => {
    signInAs('ADMINISTRATOR');
    const user = userEvent.setup();
    renderWithProviders(workOrderRoutes(), {
      route: '/work-orders/OD-DEMO-062',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByRole('heading', { name: 'OD-DEMO-062' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancelar orden' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Motivo'), 'Cambio de plan');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar cancelación' }));

    expect(await screen.findByText('Cancelada')).toBeVisible();
    expect(screen.getByText('Cambio de plan')).toBeVisible();
    expect(screen.getByText(/Orden de trabajo OD-DEMO-062 cancelada/)).toBeVisible();
    expect(screen.getByText(/por Administrador Demo/)).toBeVisible();
  });

  it('hides admin actions on a completed order', async () => {
    signInAs('ADMINISTRATOR');
    renderWithProviders(workOrderRoutes(), {
      route: '/work-orders/OD-DEMO-063',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByRole('heading', { name: 'OD-DEMO-063' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reasignar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar orden' })).not.toBeInTheDocument();
    expect(screen.getByText('before-alt.jpg')).toBeVisible();
    expect(screen.getByText('after-alt.jpg')).toBeVisible();
    expect(screen.getByText(/por Carlos Méndez/)).toBeVisible();
  });
});
