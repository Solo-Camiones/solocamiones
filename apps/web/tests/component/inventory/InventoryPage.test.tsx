// @vitest-environment jsdom

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { inventoryRepository } from '../../../src/api/repositories';
import { InventoryPage } from '../../../src/features/inventory/InventoryPage';
import { getMockState, resetMockState } from '../../../src/mocks/state';
import { renderWithProviders } from '../../support/render';
import { chooseSelectOption } from '../../support/select-menu';
import { signInAs } from '../../support/session';
import '../../support/dom';

describe('InventoryPage', () => {
  beforeEach(() => {
    resetMockState();
    signInAs('SELLER');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMockState();
  });

  it('loads individual and quantity inventory while hiding sold items', async () => {
    renderWithProviders(<InventoryPage />, { route: '/inventory' });

    expect(await screen.findByRole('heading', { name: 'Inventario' })).toBeVisible();
    expect(await screen.findByText('Filtro de aceite HD')).toBeVisible();
    expect(screen.getByText('Aceite 15W-40 Galón')).toBeVisible();
    expect(screen.queryByText('Turbo Garrett')).not.toBeInTheDocument();
  });

  it('filters by practical identifiers and can include sold history', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InventoryPage />, { route: '/inventory' });
    await screen.findByText('Filtro de aceite HD');

    await user.type(screen.getByLabelText('Buscar inventario'), 'LF9009');
    expect(await screen.findByText('Filtro de aceite HD')).toBeVisible();
    expect(screen.queryByText('Motor Detroit DD15')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Buscar inventario'));
    await user.click(screen.getByText('Más filtros'));
    await user.click(screen.getByRole('checkbox', { name: 'Vendidos' }));
    expect(await screen.findByText('Turbo Garrett')).toBeVisible();
  });

  it('shows an empty state when no inventory matches', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InventoryPage />, { route: '/inventory' });
    await screen.findByText('Filtro de aceite HD');

    await user.type(screen.getByLabelText('Buscar inventario'), 'NO-EXISTE-999');

    expect(await screen.findByText('Sin resultados')).toBeVisible();
  });

  it('registers a simple item and refreshes the inventory list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InventoryPage />, { route: '/inventory' });
    await screen.findByText('Filtro de aceite HD');

    await user.click(screen.getByRole('button', { name: 'Registrar inventario' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Alternador de mostrador');
    await chooseSelectOption(user, 'Categoría', 'CAT-ALT', dialog);
    expect(within(dialog).getByText('Código interno')).toBeVisible();
    expect(within(dialog).getByText('Se asignará al guardar con prefijo ALT.')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    expect(await screen.findByText('Alternador de mostrador')).toBeVisible();
    expect(await screen.findByText('ALT-012 quedó registrado')).toBeVisible();
    expect(within(dialog).getByText(/Aún puede completar:/)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Ver pieza' })).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Volver al listado' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows category-defined attribute fields instead of a free-text box', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InventoryPage />, { route: '/inventory' });
    await screen.findByText('Filtro de aceite HD');

    await user.click(screen.getByRole('button', { name: 'Registrar inventario' }));
    const dialog = screen.getByRole('dialog');
    await chooseSelectOption(user, 'Categoría', 'CAT-TIR', dialog);

    expect(within(dialog).getByLabelText('Tipo')).toBeVisible();
    expect(within(dialog).getByLabelText('Medida')).toBeVisible();
    expect(within(dialog).getByLabelText('Diámetro')).toBeVisible();
    expect(within(dialog).queryByLabelText('Atributos (opcional)')).not.toBeInTheDocument();
  });

  it('registers quantity inventory from the Por cantidad mode', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InventoryPage />, { route: '/inventory' });
    await screen.findByText('Filtro de aceite HD');

    await user.click(screen.getByRole('button', { name: 'Registrar inventario' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText('Producto por cantidad'));
    await user.type(within(dialog).getByLabelText('Código de producto'), 'QTY-FIL-NEW');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Filtro por caja');
    await chooseSelectOption(user, 'Categoría', 'CAT-FIL', dialog);
    await user.clear(within(dialog).getByLabelText('Existencia inicial'));
    await user.type(within(dialog).getByLabelText('Existencia inicial'), '8');
    await user.type(within(dialog).getByLabelText('Costo unitario en pesos'), '300');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    expect(await screen.findByText('Filtro por caja')).toBeVisible();
    expect(screen.getByText('8 disponibles / 8 en existencia')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Ver producto' })).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: 'Ver pieza' })).not.toBeInTheDocument();
  });

  it('captures a truck, a present engine and the engine baseline in one wizard', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InventoryPage />, { route: '/inventory' });
    await screen.findByText('Filtro de aceite HD');

    await user.click(screen.getByRole('button', { name: 'Registrar inventario' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Camión con motor recibido');
    await chooseSelectOption(user, 'Categoría', 'CAT-TRK', dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Continuar' }));

    const motorGroup = within(dialog).getByRole('group', { name: 'Motor' });
    await user.click(within(motorGroup).getByLabelText('Presente'));
    await user.clear(within(motorGroup).getByLabelText('Nombre'));
    await user.type(within(motorGroup).getByLabelText('Nombre'), 'Motor dentro del camión');

    const alternatorGroup = within(motorGroup).getByRole('group', { name: 'Alternador' });
    await user.click(within(alternatorGroup).getByLabelText('Presente'));
    const starterGroup = within(motorGroup).getByRole('group', { name: 'Motor de arranque' });
    await user.click(within(starterGroup).getByLabelText('No aplica'));
    const transmissionGroup = within(dialog).getByRole('group', { name: 'Transmisión' });
    await user.click(within(transmissionGroup).getByLabelText('No aplica'));
    await user.click(within(dialog).getByRole('button', { name: 'Registrar ensamblaje' }));

    expect(await screen.findByText('Camión con motor recibido')).toBeVisible();
    expect(getMockState().items.find((item) => item.id === 'MOT-004')).toMatchObject({
      parentId: 'CAM-002',
      complete: false,
    });
    expect(getMockState().items.find((item) => item.id === 'ALT-012')?.parentId).toBe('MOT-004');
    expect(getMockState().knownMissing).toContainEqual(
      expect.objectContaining({ parentId: 'MOT-004', expectedComponentName: 'Turbo' }),
    );
    expect(await screen.findByText('CAM-002 quedó registrado')).toBeVisible();
  });

  it('keeps enrichment fields collapsed until the operator opens them', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InventoryPage />, { route: '/inventory' });
    await screen.findByText('Filtro de aceite HD');

    await user.click(screen.getByRole('button', { name: 'Registrar inventario' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByText('Código interno')).toBeVisible();
    expect(within(dialog).getByText('Se generará automáticamente al registrar.')).toBeVisible();
    expect(within(dialog).getByRole('group', { name: 'Identificación' })).toBeVisible();
    expect(within(dialog).getByRole('group', { name: 'Inventario' })).toBeVisible();
    expect(within(dialog).getByRole('group', { name: 'Evidencia' })).toBeVisible();
    expect(within(dialog).getByLabelText('Condición')).toBeVisible();
    expect(within(dialog).getByLabelText('Costo en pesos (opcional)')).toBeVisible();
    expect(
      within(dialog).queryByText('Paso 1 de 2 — Información del ensamblaje'),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Serial (opcional)')).not.toBeVisible();

    await user.click(within(dialog).getByText('Información adicional (opcional)'));
    expect(within(dialog).getByLabelText('Serial (opcional)')).toBeVisible();
  });

  it('asks before discarding an inventory registration with unsaved data', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InventoryPage />, { route: '/inventory' });
    await screen.findByText('Filtro de aceite HD');

    await user.click(screen.getByRole('button', { name: 'Registrar inventario' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Registro que debe conservarse');
    await user.keyboard('{Escape}');

    expect(within(dialog).getByRole('heading', { name: '¿Descartar el registro?' })).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Seguir registrando' }));
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Registro que debe conservarse');

    await user.click(dialog.parentElement!);
    expect(within(dialog).getByRole('heading', { name: '¿Descartar el registro?' })).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Seguir registrando' }));

    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    await user.click(within(dialog).getByRole('button', { name: 'Descartar registro' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cannot close the inventory registration while it is saving', async () => {
    const user = userEvent.setup();
    vi.spyOn(inventoryRepository, 'registerItem').mockImplementationOnce(
      () => new Promise<never>(() => undefined),
    );
    renderWithProviders(<InventoryPage />, { route: '/inventory' });
    await screen.findByText('Filtro de aceite HD');

    await user.click(screen.getByRole('button', { name: 'Registrar inventario' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Registro en curso');
    await chooseSelectOption(user, 'Categoría', 'CAT-ALT', dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await user.click(dialog.parentElement!);
    expect(dialog).toBeVisible();
    expect(within(dialog).queryByText('¿Descartar el registro?')).not.toBeInTheDocument();
  });

  it('announces both assembly steps and keeps checklist data after going back', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InventoryPage />, { route: '/inventory' });
    await screen.findByText('Filtro de aceite HD');

    await user.click(screen.getByRole('button', { name: 'Registrar inventario' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Camión para volver atrás');
    await chooseSelectOption(user, 'Categoría', 'CAT-TRK', dialog);
    expect(within(dialog).getByText('Paso 1 de 2 — Información del ensamblaje')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Continuar' }));

    expect(within(dialog).getByText('Paso 2 de 2 — Componentes iniciales')).toBeVisible();
    const motorGroup = within(dialog).getByRole('group', { name: 'Motor' });
    await user.click(within(motorGroup).getByLabelText('Presente'));
    await user.click(within(dialog).getByRole('button', { name: 'Atrás' }));
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Camión para volver atrás');
    expect(within(dialog).getByText('Se asignará al guardar con prefijo CAM.')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    const motorPresent = within(within(dialog).getByRole('group', { name: 'Motor' })).getAllByRole(
      'radio',
      { name: 'Presente' },
    )[0];
    expect(motorPresent).toBeChecked();
  });

  it('ranks inventory states and opens detail from the row or the named link', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/inventory/:id" element={<p>Detalle de pieza</p>} />
      </Routes>,
      { route: '/inventory' },
    );
    const engineName = await screen.findByRole('link', { name: /Detroit DD15 Completo/ });
    const engineRow = engineName.closest('tr');
    expect(engineRow).not.toBeNull();
    expect(engineRow).toHaveClass('cursor-pointer');
    expect(engineName).toHaveAttribute('href', '/inventory/MOT-001');
    expect(screen.getByRole('columnheader', { name: 'Disponibilidad' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Relación' })).toBeVisible();
    expect(within(engineRow!).getByText('Disponible')).toBeVisible();
    expect(within(engineRow!).getByText('Instalado en Freightliner Cascadia 2018')).toBeVisible();
    expect(within(engineRow!).queryByText('Independiente')).not.toBeInTheDocument();
    expect(within(engineRow!).queryByText(/^Completo$/)).not.toBeInTheDocument();

    const reservedRow = screen.getByRole('link', { name: /Alternador 24V/ }).closest('tr');
    expect(reservedRow).not.toBeNull();
    expect(within(reservedRow!).getByText('Reservado')).toBeVisible();

    const incompleteRow = screen
      .getByRole('link', { name: /Cummins ISX Incompleto/ })
      .closest('tr');
    expect(incompleteRow).not.toBeNull();
    expect(within(incompleteRow!).getByText('Independiente')).toBeVisible();
    expect(within(incompleteRow!).getByText('Incompleto')).toBeVisible();

    const protectedRow = screen.getByRole('link', { name: /Detroit DD13 Protegido/ }).closest('tr');
    expect(protectedRow).not.toBeNull();
    expect(within(protectedRow!).getByText('No desarmar')).toBeVisible();

    await user.click(within(engineRow!).getByText('Patio A'));
    expect(await screen.findByText('Detalle de pieza')).toBeVisible();
  });

  it('applies available=1 from the URL on load', async () => {
    renderWithProviders(<InventoryPage />, { route: '/inventory?available=1' });

    expect(await screen.findByRole('button', { name: 'Disponible' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await screen.findByText('Filtro de aceite HD')).toBeVisible();
    expect(screen.getByText('Filtros activos:')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Quitar filtro Disponible' })).toBeVisible();
    expect(screen.queryByText('Turbo Garrett')).not.toBeInTheDocument();
  });

  it('hides sold items when Disponible is on even if Vendidos is checked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InventoryPage />, { route: '/inventory' });
    await screen.findByText('Filtro de aceite HD');

    await user.click(screen.getByRole('button', { name: 'Disponible' }));
    await user.click(screen.getByText('Más filtros'));
    await user.click(screen.getByRole('checkbox', { name: 'Vendidos' }));

    await waitFor(() => {
      expect(screen.getByText('Filtro de aceite HD')).toBeVisible();
    });
    expect(screen.queryByText('Turbo Garrett')).not.toBeInTheDocument();
  });

  it('combines search and quick filters on the list without opening another screen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InventoryPage />, { route: '/inventory' });
    await screen.findByText('Filtro de aceite HD');

    expect(screen.getByLabelText('Categoría')).not.toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Vendidos' })).not.toBeVisible();

    await user.type(screen.getByLabelText('Buscar inventario'), 'Alternador');
    await user.click(screen.getByRole('button', { name: 'Disponible' }));
    await user.click(screen.getByRole('button', { name: 'Independiente' }));

    await waitFor(() => {
      expect(screen.getByText('Alternador Cummins')).toBeVisible();
      expect(screen.queryByText('Alternador 24V')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeVisible();
  });
});
