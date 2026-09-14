// @vitest-environment jsdom

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PosDraftView, PosLineView } from '../../../src/api/contracts/sales';
import { EditLineModal } from '../../../src/features/sales/EditLineModal';
import { renderWithProviders } from '../../support/render';
import { chooseSelectOption } from '../../support/select-menu';
import '../../support/dom';

const baseLine: PosLineView = {
  id: 'LINE-1',
  type: 'GENERIC',
  description: 'Filtro de aceite',
  notes: 'Revisar empaque',
  quantity: 2,
  unitPrice: 100,
  taxable: true,
  pricePending: false,
  gross: 200,
  itbis: 0,
  base: 200,
  costProvenance: 'UNKNOWN',
};

const draft: PosDraftView = {
  id: 'DRAFT-1',
  status: 'DRAFT',
  customerId: 'CUSTOMER-1',
  customerName: 'Flota Norte',
  customerIsDefault: false,
  currency: 'DOP',
  fiscal: false,
  lines: [baseLine],
  totals: { lineCount: 1, gross: 200, itbis: 0, taxableBase: 200 },
  customers: [],
  services: [],
  qtyProducts: [],
  items: [],
  blockers: [],
  createdWorkOrderIds: [],
};

function renderModal(options: {
  line?: PosLineView | null;
  isSaving?: boolean;
  error?: string | null;
  onSubmit?: (line: PosLineView, patch: Parameters<Parameters<typeof EditLineModal>[0]['onSubmit']>[1]) => Promise<void>;
} = {}) {
  const onSubmit = options.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  renderWithProviders(
    <EditLineModal
      open
      draft={draft}
      line={options.line === undefined ? baseLine : options.line}
      isSaving={options.isSaving ?? false}
      error={options.error ?? null}
      onClose={onClose}
      onSubmit={onSubmit}
    />,
  );
  return { onClose, onSubmit };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EditLineModal', () => {
  it('infers an actual cost when a value is entered and submits normalized public fields', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    await user.clear(screen.getByLabelText('Descripción'));
    await user.type(screen.getByLabelText('Descripción'), 'Filtro premium');
    await user.clear(screen.getByLabelText('Nota'));
    await user.type(screen.getByLabelText('Nota'), '   ');
    await user.type(screen.getByLabelText('Costo de adquisición en pesos (opcional)'), '45.25');
    expect(screen.getByLabelText('Origen del costo')).toHaveAttribute('data-value', 'ACTUAL');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSubmit).toHaveBeenCalledWith(baseLine, {
      description: 'Filtro premium',
      notes: null,
      quantity: 2,
      unitPrice: 100,
      acquisitionCostDop: 45.25,
      costProvenance: 'ACTUAL',
    });
  });

  it('clears the cost when provenance changes to unknown', async () => {
    const user = userEvent.setup();
    const line = { ...baseLine, acquisitionCostDop: 30, costProvenance: 'ESTIMATED' as const };
    const { onSubmit } = renderModal({ line });

    await chooseSelectOption(user, 'Origen del costo', 'UNKNOWN');
    expect(screen.getByLabelText('Costo de adquisición en pesos (opcional)')).toHaveValue(null);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSubmit).toHaveBeenCalledWith(
      line,
      expect.objectContaining({ acquisitionCostDop: null, costProvenance: 'UNKNOWN' }),
    );
  });

  it('limits an absent QTY product to the quantity already on the line', async () => {
    const user = userEvent.setup();
    const line: PosLineView = {
      ...baseLine,
      type: 'QTY',
      qtyProductId: 'MISSING-PRODUCT',
      description: 'Producto eliminado',
      quantity: 3,
      costProvenance: 'ACTUAL',
    };
    const { onSubmit } = renderModal({ line });

    const quantity = screen.getByLabelText('Cantidad');
    expect(quantity).toHaveAttribute('max', '3');
    await user.clear(quantity);
    await user.type(quantity, '2');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSubmit).toHaveBeenCalledWith(
      line,
      expect.objectContaining({
        description: undefined,
        quantity: 2,
        acquisitionCostDop: undefined,
        costProvenance: undefined,
      }),
    );
  });

  it('shows the save error and blocks public actions while saving', async () => {
    const user = userEvent.setup();
    const { onClose, onSubmit } = renderModal({
      isSaving: true,
      error: 'No fue posible actualizar la línea',
    });

    expect(screen.getByText('No fue posible actualizar la línea')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Guardando…' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
