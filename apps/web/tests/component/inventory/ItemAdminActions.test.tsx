// @vitest-environment jsdom

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ItemAdminActions } from '../../../src/features/inventory/ItemAdminActions';
import { CAPABILITY_PRESETS } from '../../../src/shared/config/capabilities';
import { createInitialState } from '../../../src/mocks/data/seed';
import { backfillPendingExpectedComponents } from '../../../src/mocks/services/catalogs-reviews';
import { buildItemDetail } from '../../../src/mocks/services/inventory-catalog';
import { renderWithProviders } from '../../support/render';
import '../../support/dom';

function handlers() {
  return {
    onSetNoDesarmar: vi.fn().mockResolvedValue(null),
    onCorrectCost: vi.fn().mockResolvedValue(null),
    onCorrectBaseline: vi.fn().mockResolvedValue(null),
    onResolveCatalogReview: vi.fn().mockResolvedValue(null),
    onCreateWorkOrder: vi.fn().mockResolvedValue(null),
  };
}

describe('ItemAdminActions', () => {
  it('shows baseline validation failures inside the active modal', async () => {
    const user = userEvent.setup();
    const detail = buildItemDetail(createInitialState(), 'MOT-002')!;
    const callbacks = handlers();
    callbacks.onCorrectBaseline.mockResolvedValue('Seleccione al menos un faltante');
    renderWithProviders(<ItemAdminActions detail={detail} isMutating={false} {...callbacks} />);

    await user.click(screen.getByRole('button', { name: 'Corregir registro inicial' }));
    const dialog = screen.getByRole('dialog', { name: 'Corregir registro inicial' });
    await user.type(within(dialog).getByLabelText('Motivo'), 'Corrección verificada');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar corrección' }));

    expect(await within(dialog).findByText('Seleccione al menos un faltante')).toBeVisible();
  });

  it('submits null when the administrator clears cost provenance', async () => {
    const user = userEvent.setup();
    const detail = buildItemDetail(createInitialState(), 'FIL-001')!;
    detail.costProvenance = 'Factura original';
    const callbacks = handlers();
    renderWithProviders(<ItemAdminActions detail={detail} isMutating={false} {...callbacks} />);

    await user.click(screen.getByRole('button', { name: 'Corregir costo' }));
    const dialog = screen.getByRole('dialog', { name: 'Corregir costo de adquisición' });
    await user.clear(within(dialog).getByLabelText('Procedencia'));
    await user.type(within(dialog).getByLabelText('Motivo'), 'Procedencia incorrecta');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar corrección' }));

    expect(callbacks.onCorrectCost).toHaveBeenCalledWith(
      expect.objectContaining({
        costProvenance: null,
        reason: 'Procedencia incorrecta',
      }),
    );
  });

  it('does not offer No desarmar for a unique part', () => {
    const detail = buildItemDetail(createInitialState(), 'FIL-001')!;

    renderWithProviders(<ItemAdminActions detail={detail} isMutating={false} {...handlers()} />);

    expect(screen.queryByRole('button', { name: /No desarmar/ })).not.toBeInTheDocument();
  });

  it('lets the administrator confirm NA or mark a catalog-grown slot missing', async () => {
    const user = userEvent.setup();
    const state = createInitialState();
    const admin = state.users[0]!;
    const engine = state.categories.find((category) => category.id === 'CAT-ENG')!;
    backfillPendingExpectedComponents(state, admin, engine, ['Bomba de aceite']);
    const detail = buildItemDetail(state, 'MOT-001')!;
    const callbacks = handlers();
    renderWithProviders(<ItemAdminActions detail={detail} isMutating={false} {...callbacks} />);

    expect(screen.getByText('Bomba de aceite')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Registrar presente' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Confirmar que no aplica' }));
    expect(callbacks.onResolveCatalogReview).toHaveBeenCalledWith({
      expectedComponentName: 'Bomba de aceite',
      decision: 'NOT_APPLICABLE',
    });

    await user.click(screen.getByRole('button', { name: 'Marcar falta' }));
    expect(callbacks.onResolveCatalogReview).toHaveBeenCalledWith({
      expectedComponentName: 'Bomba de aceite',
      decision: 'MISSING',
    });
  });

  it('collects a nested baseline when the present component is an assembly', async () => {
    const user = userEvent.setup();
    const state = createInitialState();
    const admin = state.users[0]!;
    const truckCategory = state.categories.find((category) => category.id === 'CAT-TRK')!;
    state.categories.push({
      id: 'CAT-AUX-ENG',
      name: 'Motor auxiliar',
      codePrefix: 'AUX',
      isAssembly: true,
      expectedComponents: ['Alternador'],
    });
    backfillPendingExpectedComponents(state, admin, truckCategory, ['Motor auxiliar']);
    const detail = buildItemDetail(state, 'CAM-001')!;
    const callbacks = handlers();
    renderWithProviders(<ItemAdminActions detail={detail} isMutating={false} {...callbacks} />);

    await user.click(screen.getByRole('button', { name: 'Registrar presente' }));
    const dialog = screen.getByRole('dialog', { name: 'Registrar Motor auxiliar presente' });
    expect(within(dialog).getByText('Registro inicial')).toBeVisible();
    expect(within(dialog).getByText('Alternador')).toBeVisible();
    expect(within(dialog).getByText('AUX')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Registrar en el árbol' }));

    expect(callbacks.onResolveCatalogReview).toHaveBeenCalledWith({
      expectedComponentName: 'Motor auxiliar',
      decision: 'PRESENT',
      item: {
        name: 'Motor auxiliar',
        categoryId: 'CAT-AUX-ENG',
        condition: 'USED',
      },
      baseline: [{ expectedComponentName: 'Alternador', status: 'MISSING' }],
    });
  });

  it('hides manual work-order creation when workOrders is disabled', () => {
    const detail = buildItemDetail(createInitialState(), 'FIL-001')!;

    renderWithProviders(<ItemAdminActions detail={detail} isMutating={false} {...handlers()} />, {
      capabilities: CAPABILITY_PRESETS['release-4'],
    });

    expect(
      screen.queryByRole('button', { name: 'Orden de trabajo manual' }),
    ).not.toBeInTheDocument();
  });
});
