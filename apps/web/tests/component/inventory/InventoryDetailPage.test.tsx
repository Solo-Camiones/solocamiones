// @vitest-environment jsdom

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InventoryDetailPage } from '../../../src/features/inventory/InventoryDetailPage';
import { resetMockState } from '../../../src/mocks/state';
import { createAuthValue, renderWithProviders } from '../../support/render';
import { signInAs } from '../../support/session';
import '../../support/dom';

function detailRoute() {
  return (
    <Routes>
      <Route path="/inventory/:id" element={<InventoryDetailPage />} />
    </Routes>
  );
}

describe('InventoryDetailPage', () => {
  beforeEach(() => {
    resetMockState();
  });

  afterEach(() => {
    resetMockState();
  });

  it('shows hierarchy, missing components and administrator actions', async () => {
    signInAs('ADMINISTRATOR');
    renderWithProviders(detailRoute(), {
      route: '/inventory/MOT-002',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByRole('heading', { name: 'Cummins ISX Incompleto' })).toBeVisible();
    expect(screen.getByText(/Ensamblaje · Motor/)).toBeVisible();
    expect(screen.getByText('Completitud')).toBeVisible();
    expect(screen.getAllByText('Incompleto').length).toBeGreaterThan(0);
    expect(screen.getByText(/Turbo \(en recepción\)/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Corregir registro inicial' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Orden de trabajo manual' })).toBeVisible();
    expect(screen.getByText('Órdenes de trabajo')).toBeVisible();
  });

  it('hides administrator actions from sellers', async () => {
    signInAs('SELLER');
    renderWithProviders(detailRoute(), {
      route: '/inventory/FIL-001',
      auth: createAuthValue('SELLER'),
    });

    expect(await screen.findByRole('heading', { name: 'Filtro de aceite HD' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Agregar a borrador' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Editar datos' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Corregir costo' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Orden de trabajo manual' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Órdenes de trabajo')).not.toBeInTheDocument();
  });

  it('renders quantity stock separately from individual item state', async () => {
    signInAs('SELLER');
    renderWithProviders(detailRoute(), {
      route: '/inventory/QTY-OIL-15W40',
      auth: createAuthValue('SELLER'),
    });

    expect(await screen.findByRole('heading', { name: 'Aceite 15W-40 Galón' })).toBeVisible();
    expect(screen.getByText('48')).toBeVisible();
    expect(screen.getByText('46')).toBeVisible();
    expect(screen.getByText('disponible = existencia − reservado')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Ajustar existencia' })).not.toBeInTheDocument();
  });

  it('reports an unknown inventory identifier', async () => {
    signInAs('SELLER');
    renderWithProviders(detailRoute(), {
      route: '/inventory/NO-EXISTE',
      auth: createAuthValue('SELLER'),
    });

    expect(await screen.findByText('No se pudo cargar el detalle del inventario')).toBeVisible();
    expect(screen.getByText('Inventario no encontrado')).toBeVisible();
  });

  it('lets a seller correct ordinary item details from the detail screen', async () => {
    const user = userEvent.setup();
    signInAs('SELLER');
    renderWithProviders(detailRoute(), {
      route: '/inventory/FIL-001',
      auth: createAuthValue('SELLER'),
    });

    expect(await screen.findByRole('heading', { name: 'Filtro de aceite HD' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Editar datos' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar FIL-001' });
    const name = within(dialog).getByLabelText('Nombre');
    await user.clear(name);
    await user.type(name, 'Filtro HD corregido');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('heading', { name: 'Filtro HD corregido' })).toBeVisible();
    expect(screen.getByText(/Datos descriptivos de FIL-001 actualizados/)).toBeVisible();
    expect(screen.getByText(/por Laura Pérez/)).toBeVisible();
  });

  it('edits category attributes from generated fields, not free text', async () => {
    const user = userEvent.setup();
    signInAs('SELLER');
    renderWithProviders(detailRoute(), {
      route: '/inventory/MOT-001',
      auth: createAuthValue('SELLER'),
    });

    expect(await screen.findByText(/Cilindrada: 14.8L/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Editar datos' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar MOT-001' });
    expect(within(dialog).queryByLabelText('Atributos')).not.toBeInTheDocument();
    const displacement = within(dialog).getByLabelText('Cilindrada (opcional)');
    await user.clear(displacement);
    await user.type(displacement, '15L');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/Cilindrada: 15L/)).toBeVisible();
  });

  it('names the mechanic on piece history even after the account is deactivated', async () => {
    signInAs('ADMINISTRATOR');
    renderWithProviders(detailRoute(), {
      route: '/inventory/ALT-010',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByText(/ALT-010 retirado de MOT-002/)).toBeVisible();
    expect(screen.getByText(/por Carlos Méndez/)).toBeVisible();
  });
});
