// @vitest-environment jsdom

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import { PosPage } from '../../../src/features/sales/PosPage';
import { CAPABILITY_PRESETS, type AppCapabilities } from '../../../src/shared/config/capabilities';
import { mockCustomerRepository } from '../../../src/mocks/repositories/MockCustomerRepository';
import { mockSalesRepository } from '../../../src/mocks/repositories/MockSalesRepository';
import { reloadMockStateFromStorage, resetMockState } from '../../../src/mocks/state';
import { createAuthValue, renderWithProviders } from '../../support/render';
import { chooseSelectOption } from '../../support/select-menu';
import { signInAs } from '../../support/session';
import '../../support/dom';

function renderPos(draftId = 'INV-DRAFT-01', capabilities?: AppCapabilities) {
  return renderWithProviders(
    <Routes>
      <Route path="/sales/draft/:id" element={<PosPage />} />
    </Routes>,
    { route: `/sales/draft/${draftId}`, capabilities },
  );
}

function renderQuote(quoteId: string, capabilities?: AppCapabilities) {
  return renderWithProviders(
    <Routes>
      <Route path="/sales/quote/:id" element={<PosPage />} />
      <Route path="/sales/:id" element={<p>Detalle de factura</p>} />
    </Routes>,
    { route: `/sales/quote/${quoteId}`, capabilities },
  );
}

const originalMatchMedia = window.matchMedia;

function stubViewportWidth(width: number) {
  window.matchMedia = ((query: string) => {
    const minWidth = Number(/min-width:\s*(\d+)/.exec(query)?.[1] ?? 0);
    return {
      matches: width >= minWidth,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  }) as typeof window.matchMedia;
}

describe('PosPage', () => {
  beforeEach(() => {
    resetMockState();
    signInAs('SELLER');
  });

  afterEach(() => {
    resetMockState();
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it('shows loading while the draft request is pending', () => {
    vi.spyOn(mockSalesRepository, 'getDraft').mockReturnValue(new Promise(() => undefined));

    renderPos();

    expect(screen.getByText('Cargando borrador…')).toBeVisible();
  });

  it('shows the public repository error when the draft cannot load', async () => {
    vi.spyOn(mockSalesRepository, 'getDraft').mockResolvedValue({
      ok: false,
      error: { code: 'NETWORK', message: 'No hay conexión con ventas' },
    });

    renderPos();

    expect(await screen.findByText('No se pudo cargar el punto de venta')).toBeVisible();
    expect(screen.getByText('No hay conexión con ventas')).toBeVisible();
  });

  it('loads the seed draft with nonfiscal ITBIS at zero', async () => {
    renderPos();

    expect(await screen.findByText('Alternador 24V')).toBeVisible();
    expect(screen.getByText('Aceite 15W-40 Galón')).toBeVisible();
    expect(screen.getByTestId('pos-itbis')).toHaveTextContent('RD$0.00');
    expect(screen.getByText('Transportes del Caribe SRL', { exact: false })).toBeVisible();

    const addLine = screen.getByRole('button', { name: 'Agregar línea' });
    const discardDraft = screen.getByRole('button', { name: 'Descartar borrador' });
    const confirmSale = screen.getByRole('button', { name: 'Confirmar venta' });
    expect(addLine.className).toEqual(expect.stringContaining('text-sm'));
    expect(discardDraft.className).toEqual(expect.stringContaining('text-sm'));
    expect(addLine.className).toEqual(expect.stringContaining('min-h-11'));
    expect(discardDraft.className).toEqual(expect.stringContaining('min-h-11'));
    expect(confirmSale.className).toEqual(expect.stringContaining('text-base'));
    expect(confirmSale.className).toEqual(expect.stringContaining('min-h-12'));
    expect(discardDraft.className).toEqual(expect.stringContaining('bg-transparent'));
    expect(confirmSale.className).toEqual(expect.stringContaining('bg-brand'));
    expect(screen.getByTestId('pos-total')).toBeVisible();

    const backButton = screen.getByRole('button', { name: 'Volver atrás' });
    expect(backButton).toHaveTextContent('');
  });

  it('asks before discarding a draft and restores it from the undo toast', async () => {
    const user = userEvent.setup();
    renderPos();
    await screen.findByText('Alternador 24V');

    await user.click(screen.getByRole('button', { name: 'Descartar borrador' }));
    expect(await screen.findByRole('dialog', { name: 'Descartar borrador' })).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Descartar borrador' })).toHaveTextContent(
      'Se eliminará este borrador y todas sus líneas',
    );

    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.queryByRole('dialog', { name: 'Descartar borrador' })).not.toBeInTheDocument();
    expect(screen.getByText('Alternador 24V')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Descartar borrador' }));
    await user.click(screen.getByRole('button', { name: 'Sí, descartar' }));

    expect(await screen.findByText('Borrador descartado.')).toBeVisible();
    expect(screen.queryByText('Alternador 24V')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Deshacer' }));

    expect(await screen.findByText('Alternador 24V')).toBeVisible();
    expect(screen.getByText('Aceite 15W-40 Galón')).toBeVisible();
  });

  it('hides inventory line types and reservation copy in Release 2', async () => {
    const user = userEvent.setup();
    renderPos('INV-DRAFT-01', CAPABILITY_PRESETS['release-2']);
    await screen.findByText('Alternador 24V');

    expect(
      screen.getByText('Edite el borrador, asigne precios y confirme la factura.'),
    ).toBeVisible();
    expect(
      screen.queryByText(/Las piezas de inventario quedan reservadas/),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Agregar línea' }));
    await user.click(screen.getByLabelText('Tipo de línea'));
    expect(screen.queryByRole('option', { name: 'Pieza' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Producto por cantidad' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Mercancía genérica' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));
    expect(screen.queryByLabelText('Pago inicial')).not.toBeInTheDocument();
    expect(screen.queryByText(/orden de desmonte pendiente/i)).not.toBeInTheDocument();
  });

  it('does not add ITBIS when only fiscal mode is enabled', async () => {
    const user = userEvent.setup();
    renderPos();
    await screen.findByText('Alternador 24V');

    await user.click(screen.getByLabelText(/Factura con comprobante fiscal/));

    expect(await screen.findByTestId('pos-itbis')).toHaveTextContent('RD$0.00');
  });

  it('adds tax-exclusive ITBIS when Aplicar ITBIS is enabled', async () => {
    const user = userEvent.setup();
    renderPos();
    await screen.findByText('Alternador 24V');

    await user.click(screen.getByLabelText(/Aplicar ITBIS/));

    expect(await screen.findByTestId('pos-itbis')).not.toHaveTextContent('RD$0.00');
  });

  it('shows line subtotal, ITBIS, and gross from the entered sale price', async () => {
    const user = userEvent.setup();
    renderPos('INV-DRAFT-01', CAPABILITY_PRESETS['release-2']);
    await screen.findByText('Alternador 24V');

    await user.click(screen.getByLabelText(/Aplicar ITBIS/));
    await user.click(screen.getByRole('button', { name: 'Agregar línea' }));
    await user.type(screen.getByLabelText('Descripción'), 'Filtro gravado');
    await user.clear(screen.getByLabelText('Cantidad'));
    await user.type(screen.getByLabelText('Cantidad'), '1');
    await user.clear(screen.getByLabelText('Precio'));
    await user.type(screen.getByLabelText('Precio'), '118');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(await screen.findByText('Filtro gravado')).toBeVisible();
    expect(screen.getByText('RD$118.00')).toBeVisible();
    expect(screen.getByText('RD$21.24')).toBeVisible();
    expect(screen.getByText('RD$139.24')).toBeVisible();
  });

  it('confirms the seed draft and shows the assigned FAC number', async () => {
    const user = userEvent.setup();
    renderPos();
    await screen.findByText('Alternador 24V');

    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));
    expect(screen.getByText('Revisa los datos antes de emitir la factura.')).toBeVisible();
    expect(screen.getByText('Comprobante fiscal')).toBeVisible();
    const confirmButtons = screen.getAllByRole('button', { name: 'Confirmar venta' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    expect(await screen.findByText('Venta confirmada')).toBeVisible();
    expect(screen.getByText(/Orden de desmonte: OD-DEMO-064/)).toBeVisible();
  });

  it('requires a full initial payment to confirm Cliente contado', async () => {
    const created = await mockSalesRepository.createDraft();
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const user = userEvent.setup();
    renderPos(created.value.draftId, CAPABILITY_PRESETS['release-2']);
    expect(await screen.findByLabelText('Cliente')).toHaveTextContent(/Cliente Contado/i);

    await user.click(screen.getByRole('button', { name: 'Agregar línea' }));
    const addDialog = await screen.findByRole('dialog');
    await user.type(within(addDialog).getByLabelText('Descripción'), 'Filtro contado');
    await user.clear(within(addDialog).getByLabelText('Precio'));
    await user.type(within(addDialog).getByLabelText('Precio'), '100');
    await user.click(within(addDialog).getByRole('button', { name: 'Agregar' }));
    expect(await screen.findByText('Filtro contado')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar venta' });
    expect(screen.getByText(/Los clientes de contado y las facturas en USD/)).toBeVisible();
    const amount = screen.getByLabelText('Monto');
    expect(amount).toBeDisabled();
    expect(amount).toHaveValue(100);
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar venta' }));

    expect(await screen.findByText('Venta confirmada')).toBeVisible();
  });

  it('lets a seller confirm a CREDIT DOP draft without payment fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/sales/draft/:id" element={<PosPage />} />
      </Routes>,
      {
        route: '/sales/draft/INV-DRAFT-01',
        auth: createAuthValue('SELLER'),
      },
    );
    await screen.findByText('Alternador 24V');

    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));
    expect(screen.getByText(/El Administrador registra el pago/)).toBeVisible();
    expect(screen.queryByLabelText('Pago inicial')).not.toBeInTheDocument();
    const confirmButtons = screen.getAllByRole('button', { name: 'Confirmar venta' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    expect(await screen.findByText('Venta confirmada')).toBeVisible();
  });

  it('lists a newly created customer in the selector', async () => {
    const user = userEvent.setup();
    await mockCustomerRepository.save({ name: 'Flota Este', rnc: '1-23-45678-9' });

    renderPos();
    await user.click(await screen.findByLabelText('Cliente'));

    expect(await screen.findByRole('option', { name: /Flota Este/ })).toBeVisible();
  });

  it('resets the add-line form when the modal is reopened', async () => {
    const user = userEvent.setup();
    renderPos('INV-DRAFT-01', CAPABILITY_PRESETS['release-2']);
    await screen.findByText('Alternador 24V');

    await user.click(screen.getByRole('button', { name: 'Agregar línea' }));
    await user.type(screen.getByLabelText('Descripción'), 'Filtro de aceite');
    await user.clear(screen.getByLabelText('Precio'));
    await user.type(screen.getByLabelText('Precio'), '100');
    await user.type(screen.getByLabelText('Nota'), 'Nota de la línea anterior');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(await screen.findByText('Filtro de aceite')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Agregar línea' }));
    expect(screen.getByLabelText('Tipo de línea')).toHaveAttribute('data-value', 'GENERIC');
    expect(screen.getByLabelText('Descripción')).toHaveValue('');
    expect(screen.getByLabelText('Cantidad')).toHaveValue(1);
    expect(screen.getByLabelText('Precio')).toHaveValue(0);
    expect(screen.getByLabelText('Nota')).toHaveValue('');
  });

  it('does not offer inactive seed services when adding a line', async () => {
    const user = userEvent.setup();
    renderPos();
    await screen.findByText('Alternador 24V');

    await user.click(screen.getByRole('button', { name: 'Agregar línea' }));
    await chooseSelectOption(user, 'Tipo de línea', 'SERVICE');
    await user.click(screen.getByLabelText('Servicio'));

    expect(screen.getByRole('option', { name: 'Instalación mecánica' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Desarme especializado' })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Diagnóstico electrónico' }),
    ).not.toBeInTheDocument();
  });

  it('keeps an open draft after a simulated page reload', async () => {
    const created = await mockSalesRepository.createDraft();
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    await Promise.resolve();
    reloadMockStateFromStorage();
    renderPos(created.value.draftId);

    expect(await screen.findByRole('heading', { name: 'Punto de venta' })).toBeVisible();
    expect(screen.queryByText('Borrador no encontrado')).not.toBeInTheDocument();
  });

  it('explains a blocked confirm and jumps to the first missing requirement', async () => {
    const created = await mockSalesRepository.createDraft();
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const user = userEvent.setup();
    renderPos(created.value.draftId);

    expect(await screen.findByRole('button', { name: 'Confirmar venta' })).toBeDisabled();
    expect(
      screen.getByText('Agregue al menos una línea', { selector: '#pos-confirm-block-reason' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Ver requisitos' }));
    expect(document.getElementById('pos-lines')).toHaveFocus();
  });

  it('jumps Ver requisitos to the first pending price', async () => {
    const created = await mockSalesRepository.createDraft();
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    await mockSalesRepository.addLine({
      draftId: created.value.draftId,
      type: 'ITEM',
      itemId: 'ALT-010',
    });

    const user = userEvent.setup();
    renderPos(created.value.draftId);

    expect(
      await screen.findByText('Hay precios pendientes', { selector: '#pos-confirm-block-reason' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Ver requisitos' }));
    expect(await screen.findByRole('dialog', { name: 'Editar línea' })).toBeVisible();
    expect(document.activeElement).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/^Precio de /),
    );
  });

  it('asks before removing a line and restores it from the undo toast', async () => {
    const user = userEvent.setup();
    renderPos();
    await screen.findByText('Alternador 24V');

    await user.click(screen.getByRole('button', { name: 'Quitar Alternador 24V' }));
    expect(await screen.findByRole('dialog', { name: 'Quitar línea' })).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Quitar línea' })).toHaveTextContent(
      'Alternador 24V',
    );

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog', { name: 'Quitar línea' })).not.toBeInTheDocument();
    expect(screen.getByText('Alternador 24V')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Quitar Alternador 24V' }));
    await user.click(screen.getByRole('button', { name: 'Quitar' }));

    expect(await screen.findByText('Producto eliminado.')).toBeVisible();
    expect(screen.queryByText('Alternador 24V')).not.toBeInTheDocument();
    expect(screen.getByText('Aceite 15W-40 Galón')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Deshacer' }));

    expect(await screen.findByText('Alternador 24V')).toBeVisible();
    expect(screen.queryByText('Precio pendiente')).not.toBeInTheDocument();
  });

  it('edits free-form line fields from the icon without changing the type', async () => {
    const created = await mockSalesRepository.createDraft();
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    await mockSalesRepository.addLine({
      draftId: created.value.draftId,
      type: 'GENERIC',
      description: 'Tornillo suelto',
      notes: 'Caja suelta',
      quantity: 2,
      unitPrice: 10,
    });

    const user = userEvent.setup();
    renderPos(created.value.draftId);
    await screen.findByText('Tornillo suelto');
    expect(screen.getByText('Caja suelta')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Editar Tornillo suelto' }));
    const type = screen.getByLabelText('Tipo de línea');
    expect(type).toBeDisabled();
    expect(type).toHaveValue('Línea genérica');

    await user.clear(screen.getByLabelText('Descripción'));
    await user.type(screen.getByLabelText('Descripción'), 'Tornillo de motor');
    await user.clear(screen.getByLabelText('Cantidad'));
    await user.type(screen.getByLabelText('Cantidad'), '4');
    await user.clear(screen.getByLabelText('Nota'));
    await user.type(screen.getByLabelText('Nota'), 'Para motor');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Tornillo de motor')).toBeVisible();
    expect(screen.getByText('Para motor')).toBeVisible();
    expect(screen.queryByText('Caja suelta')).not.toBeInTheDocument();
    expect(screen.queryByText('Tornillo suelto')).not.toBeInTheDocument();
    expect(screen.getByText('4')).toBeVisible();
  });

  it('keeps the edit modal open and presents a failed save', async () => {
    const created = await mockSalesRepository.createDraft();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await mockSalesRepository.addLine({
      draftId: created.value.draftId,
      type: 'GENERIC',
      description: 'Filtro con conflicto',
      quantity: 1,
      unitPrice: 25,
    });
    vi.spyOn(mockSalesRepository, 'setLinePrice').mockResolvedValue({
      ok: false,
      error: { code: 'CONFLICT', message: 'La línea cambió en otra sesión' },
    });
    const user = userEvent.setup();
    renderPos(created.value.draftId);
    await screen.findByText('Filtro con conflicto');

    await user.click(screen.getByRole('button', { name: 'Editar Filtro con conflicto' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('No se pudo guardar la línea')).toBeVisible();
    expect(screen.getByText('La línea cambió en otra sesión')).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Editar línea' })).toBeVisible();
  });

  it('disables POS and edit actions during a save and closes after success', async () => {
    const created = await mockSalesRepository.createDraft();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await mockSalesRepository.addLine({
      draftId: created.value.draftId,
      type: 'GENERIC',
      description: 'Filtro pendiente',
      quantity: 1,
      unitPrice: 25,
    });
    const current = await mockSalesRepository.getDraft(created.value.draftId);
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    let finishSave!: (result: typeof current) => void;
    vi.spyOn(mockSalesRepository, 'setLinePrice').mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    const user = userEvent.setup();
    renderPos(created.value.draftId);
    await screen.findByText('Filtro pendiente');

    await user.click(screen.getByRole('button', { name: 'Editar Filtro pendiente' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('button', { name: 'Guardando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Agregar línea' })).toBeDisabled();

    finishSave(current);
    expect(await screen.findByText('Línea actualizada')).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Editar línea' })).not.toBeInTheDocument();
  });

  it('toggles Aplicar ITBIS without collecting acquisition cost', async () => {
    const created = await mockSalesRepository.createDraft();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const setDraftMeta = vi.spyOn(mockSalesRepository, 'setDraftMeta');
    const addLine = vi.spyOn(mockSalesRepository, 'addLine');
    const user = userEvent.setup();
    renderPos(created.value.draftId);
    await screen.findByRole('button', { name: 'Agregar línea' });

    expect(screen.getByLabelText(/Aplicar ITBIS/)).not.toBeChecked();
    await user.click(screen.getByLabelText(/Aplicar ITBIS/));
    expect(setDraftMeta).toHaveBeenCalledWith(expect.objectContaining({ applyItbis: true }));

    await user.click(screen.getByRole('button', { name: 'Agregar línea' }));
    await chooseSelectOption(user, 'Tipo de línea', 'GENERIC');
    await user.type(screen.getByLabelText('Descripción'), 'Pieza genérica');
    expect(screen.queryByLabelText('Origen del costo')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Precio'));
    await user.type(screen.getByLabelText('Precio'), '50');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(addLine).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'GENERIC',
        description: 'Pieza genérica',
        unitPrice: 50,
      }),
    );
    expect(addLine.mock.calls[0]?.[0]).not.toHaveProperty('acquisitionCostDop');
    expect(addLine.mock.calls[0]?.[0]).not.toHaveProperty('costProvenance');
  });

  it('renders line cards below the lg breakpoint', async () => {
    stubViewportWidth(768);
    renderPos();

    expect(await screen.findByText('Alternador 24V')).toBeVisible();
    expect(screen.queryByRole('columnheader', { name: 'Descripción' })).not.toBeInTheDocument();
    expect(screen.getByText('Pieza · ALT-004')).toBeVisible();
    expect(screen.getAllByText('Cantidad')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Quitar / })).toHaveLength(2);
  });

  it('issues a quote draft from the quote editor', async () => {
    const created = await mockSalesRepository.createQuote();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const quoteId = created.value.draftId;
    expect((await mockSalesRepository.setDraftMeta({ draftId: quoteId, customerId: 'C1' })).ok).toBe(true);
    expect(
      (
        await mockSalesRepository.addLine({
          draftId: quoteId,
          type: 'GENERIC',
          description: 'Filtro cotizado',
          unitPrice: 100,
        })
      ).ok,
    ).toBe(true);

    renderQuote(quoteId);
    expect(await screen.findByRole('heading', { name: 'Cotización' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Emitir cotización' })).toBeVisible();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Emitir cotización' }));

    expect(await screen.findAllByText(/COT-000001/)).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Convertir a factura' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Duplicar cotización' })).toBeVisible();
  });
});
