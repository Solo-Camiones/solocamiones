// @vitest-environment jsdom

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PosDraftView } from '../../../src/api/contracts/sales';
import { ConfirmSaleModal } from '../../../src/features/sales/ConfirmSaleModal';
import { createAuthValue, renderWithProviders } from '../../support/render';
import '../../support/dom';

const creditDraft: PosDraftView = {
  id: 'DRAFT-CREDIT',
  status: 'DRAFT',
  customerId: 'C1',
  customerName: 'Transportes del Caribe SRL',
  customerIsDefault: false,
  customerType: 'CREDIT',
  currency: 'DOP',
  fiscal: false,
  applyItbis: false,
  discountPercent: 0,
  lines: [
    {
      id: 'L1',
      type: 'GENERIC',
      description: 'Filtro',
      quantity: 1,
      unitPrice: 100,
      taxable: true,
      pricePending: false,
      gross: 100,
      itbis: 0,
      base: 100,
    },
  ],
  totals: { lineCount: 1, gross: 100, itbis: 0, taxableBase: 100, discount: 0 },
  customers: [],
  services: [],
  qtyProducts: [],
  items: [],
  blockers: [],
  createdWorkOrderIds: [],
};

const cashDraft: PosDraftView = {
  ...creditDraft,
  id: 'DRAFT-CASH',
  customerId: 'C2',
  customerName: 'Logística Norte SA',
  customerType: 'CASH',
};

function renderModal(
  draft: PosDraftView,
  role: 'ADMINISTRATOR' | 'SELLER',
  onConfirm = vi.fn(),
) {
  renderWithProviders(
    <ConfirmSaleModal
      open
      draft={draft}
      isConfirming={false}
      error={null}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />,
    { auth: createAuthValue(role) },
  );
  return onConfirm;
}

describe('ConfirmSaleModal', () => {
  it('lets a seller confirm CREDIT DOP without sending a payment', async () => {
    const user = userEvent.setup();
    const onConfirm = renderModal(creditDraft, 'SELLER');

    expect(
      screen.getByText(/El Administrador registra el pago/),
    ).toBeVisible();
    expect(screen.queryByLabelText('Pago inicial')).not.toBeInTheDocument();

    const dialog = screen.getByRole('dialog', { name: 'Confirmar venta' });
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar venta' }));

    expect(onConfirm).toHaveBeenCalledWith();
  });

  it('lets an administrator confirm CREDIT DOP without an initial payment', async () => {
    const user = userEvent.setup();
    const onConfirm = renderModal(creditDraft, 'ADMINISTRATOR');

    expect(screen.getByLabelText('Pago inicial')).toBeVisible();
    const dialog = screen.getByRole('dialog', { name: 'Confirmar venta' });
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar venta' }));
    expect(onConfirm).toHaveBeenCalledWith();
  });

  it('lets an administrator send a partial CREDIT DOP payment', async () => {
    const user = userEvent.setup();
    const onConfirm = renderModal(creditDraft, 'ADMINISTRATOR');
    const dialog = screen.getByRole('dialog', { name: 'Confirmar venta' });

    await user.click(screen.getByLabelText('Pago inicial'));
    await user.clear(screen.getByLabelText('Monto'));
    await user.type(screen.getByLabelText('Monto'), '40');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar venta' }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 40, method: 'CASH' }),
    );
  });

  it('locks a named CASH customer to the full total', async () => {
    const user = userEvent.setup();
    const onConfirm = renderModal(cashDraft, 'SELLER');

    expect(
      screen.getByText(/Los clientes de contado y las facturas en USD deben pagarse completos/),
    ).toBeVisible();
    const amount = screen.getByLabelText('Monto');
    expect(amount).toBeDisabled();
    expect(amount).toHaveValue(100);

    const dialog = screen.getByRole('dialog', { name: 'Confirmar venta' });
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar venta' }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100, method: 'CASH' }),
    );
  });

  it('requires a full payment for a CREDIT USD draft', async () => {
    const user = userEvent.setup();
    const onConfirm = renderModal({ ...creditDraft, currency: 'USD' }, 'SELLER');

    expect(screen.getByLabelText('Monto')).toBeDisabled();
    const dialog = screen.getByRole('dialog', { name: 'Confirmar venta' });
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar venta' }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ amount: 100 }));
  });
});
