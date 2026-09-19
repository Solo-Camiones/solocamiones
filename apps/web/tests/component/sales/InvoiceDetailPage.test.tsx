// @vitest-environment jsdom

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InvoiceDetailPage } from '../../../src/features/sales/InvoiceDetailPage';
import type { SalesRepository } from '../../../src/api/contracts/repositories';
import { mockSalesRepository } from '../../../src/mocks/repositories/MockSalesRepository';
import { resetMockState } from '../../../src/mocks/state';
import { createAuthValue, renderWithProviders } from '../../support/render';
import { signInAs } from '../../support/session';
import '../../support/dom';

function detailRoute() {
  return (
    <Routes>
      <Route path="/sales/:id" element={<InvoiceDetailPage />} />
      <Route path="/sales/draft/:id" element={<p>POS placeholder</p>} />
      <Route path="/sales/quote/:id" element={<p>Quote placeholder</p>} />
    </Routes>
  );
}

describe('InvoiceDetailPage', () => {
  beforeEach(() => {
    resetMockState();
  });

  afterEach(() => {
    resetMockState();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('lets a seller see commercial totals without paid amount, balance, or payment state', async () => {
    signInAs('SELLER');
    renderWithProviders(detailRoute(), {
      route: '/sales/INV-098',
      auth: createAuthValue('SELLER'),
    });

    expect(await screen.findByRole('heading', { name: 'FAC-000098' })).toBeVisible();
    expect(screen.getByText('Completada')).toBeVisible();
    expect(screen.queryByText('Saldo')).not.toBeInTheDocument();
    expect(screen.queryByText('Pagado')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin pagar')).not.toBeInTheDocument();
    expect(screen.queryByText('Pago parcial')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar pago' })).not.toBeInTheDocument();
    expect(screen.queryByText('Pagos y reembolsos')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin movimientos registrados')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar factura' })).not.toBeInTheDocument();
    expect(screen.queryByText('Rentabilidad')).not.toBeInTheDocument();
  });

  it('hides recorded payments from seller invoice history', async () => {
    signInAs('SELLER');
    renderWithProviders(detailRoute(), {
      route: '/sales/INV-099',
      auth: createAuthValue('SELLER'),
    });

    expect(await screen.findByRole('heading', { name: 'FAC-000099' })).toBeVisible();
    expect(screen.getByText('Historial')).toBeVisible();
    expect(screen.queryByText('Pago parcial en FAC-000099')).not.toBeInTheDocument();
  });

  it('lets an administrator record a payment and updates the chip', async () => {
    signInAs('ADMINISTRATOR');
    const user = userEvent.setup();
    renderWithProviders(detailRoute(), {
      route: '/sales/INV-098',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByRole('heading', { name: 'FAC-000098' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Confirmar pago' }));
    const payDialog = await screen.findByRole('dialog', { name: 'Registrar pago' });
    await user.type(within(payDialog).getByLabelText('Monto'), '5000');
    await user.click(within(payDialog).getByRole('button', { name: 'Confirmar pago' }));

    expect(await screen.findByText('Abonado')).toBeVisible();
    expect(screen.getAllByText(/por Administrador Demo/).length).toBeGreaterThan(0);
  });

  it('shows ITBIS breakdown for fiscal invoices', async () => {
    signInAs('ADMINISTRATOR');
    renderWithProviders(detailRoute(), {
      route: '/sales/INV-098',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByRole('heading', { name: 'FAC-000098' })).toBeVisible();
    expect(screen.getAllByText(/19,500/).length).toBeGreaterThan(0);
    expect(screen.getByText('Rentabilidad')).toBeVisible();
  });

  it('shows ITBIS as zero on a non-fiscal invoice PDF preview', async () => {
    signInAs('SELLER');
    const user = userEvent.setup();
    renderWithProviders(detailRoute(), {
      route: '/sales/INV-099',
      auth: createAuthValue('SELLER'),
    });

    expect(await screen.findByRole('heading', { name: 'FAC-000099' })).toBeVisible();
    expect(screen.queryByText('Precio final')).not.toBeInTheDocument();
    expect(screen.getAllByText('RD$0.00').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Ver factura' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('NCF: ______________________')).toBeVisible();
    expect(within(dialog).getByText('Subtotal')).toBeVisible();
    expect(within(dialog).getAllByText('ITBIS').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('RD$0.00').length).toBeGreaterThan(0);
  });

  it('creates and revokes the downloaded PDF object URL when the preview closes', async () => {
    signInAs('SELLER');
    const loaded = await mockSalesRepository.getInvoice('INV-099');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    vi.spyOn(mockSalesRepository, 'getInvoice').mockResolvedValue({
      ok: true,
      value: { ...loaded.value, document: { status: 'READY' } },
    });
    vi.spyOn(mockSalesRepository as SalesRepository, 'getInvoicePdf').mockResolvedValue({
      ok: true,
      value: { blob: new Blob(['pdf'], { type: 'application/pdf' }), filename: 'FAC-000099.pdf' },
    });
    const createObjectURL = vi.fn(() => 'blob:http://localhost/FAC-000099');
    const revokeObjectURL = vi.fn();
    class TestUrl extends URL {}
    TestUrl.createObjectURL = createObjectURL;
    TestUrl.revokeObjectURL = revokeObjectURL;
    vi.stubGlobal('URL', TestUrl);
    const user = userEvent.setup();
    renderWithProviders(detailRoute(), {
      route: '/sales/INV-099',
      auth: createAuthValue('SELLER'),
    });

    expect(await screen.findByRole('heading', { name: 'FAC-000099' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Ver factura' }));
    const dialog = await screen.findByRole('dialog', { name: 'Vista previa de factura' });
    expect(within(dialog).getByTitle('FAC-000099.pdf')).toHaveAttribute(
      'src',
      'blob:http://localhost/FAC-000099',
    );
    expect(createObjectURL).toHaveBeenCalledOnce();

    await user.click(within(dialog).getByText('Cerrar'));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/FAC-000099');
  });

  it('lets an administrator cancel with a reason', async () => {
    signInAs('ADMINISTRATOR');
    const user = userEvent.setup();
    renderWithProviders(detailRoute(), {
      route: '/sales/INV-097',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByRole('heading', { name: 'FAC-000097' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancelar factura' }));
    const cancelDialog = await screen.findByRole('dialog', { name: 'Cancelar factura' });
    await user.type(within(cancelDialog).getByLabelText('Motivo'), 'Cliente desistió');
    await user.click(within(cancelDialog).getByRole('button', { name: 'Cancelar factura' }));

    const confirmDialog = await screen.findByRole('dialog', { name: 'Confirmar cancelación' });
    expect(within(confirmDialog).getByText(/quedará cancelada/i)).toBeVisible();
    await user.click(within(confirmDialog).getByRole('button', { name: 'Confirmar cancelación' }));

    expect(await screen.findByText('Cancelada')).toBeVisible();
    expect(screen.getAllByText('Cancelada')).toHaveLength(1);
    expect(screen.getByText('Cliente desistió')).toBeVisible();
  });

  it('does not cancel when the administrator backs out of confirmation', async () => {
    signInAs('ADMINISTRATOR');
    const user = userEvent.setup();
    renderWithProviders(detailRoute(), {
      route: '/sales/INV-097',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByRole('heading', { name: 'FAC-000097' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancelar factura' }));
    const cancelDialog = await screen.findByRole('dialog', { name: 'Cancelar factura' });
    await user.type(within(cancelDialog).getByLabelText('Motivo'), 'Cliente desistió');
    await user.click(within(cancelDialog).getByRole('button', { name: 'Cancelar factura' }));

    const confirmDialog = await screen.findByRole('dialog', { name: 'Confirmar cancelación' });
    await user.click(within(confirmDialog).getByRole('button', { name: 'Volver' }));

    expect(await screen.findByRole('dialog', { name: 'Cancelar factura' })).toBeVisible();
    expect(screen.queryByText('Cancelada')).not.toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByLabelText('Motivo')).toHaveValue(
      'Cliente desistió',
    );
  });

  it('shows the origin COT number on a converted invoice', async () => {
    signInAs('ADMINISTRATOR');
    const created = await mockSalesRepository.createQuote();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const quoteId = created.value.draftId;
    expect(
      (await mockSalesRepository.setDraftMeta({ draftId: quoteId, customerId: 'C1' })).ok,
    ).toBe(true);
    expect(
      (
        await mockSalesRepository.addLine({
          draftId: quoteId,
          type: 'GENERIC',
          description: 'Filtro',
          unitPrice: 100,
        })
      ).ok,
    ).toBe(true);
    expect((await mockSalesRepository.issueQuote(quoteId)).ok).toBe(true);
    expect((await mockSalesRepository.convertQuote(quoteId)).ok).toBe(true);

    renderWithProviders(detailRoute(), {
      route: `/sales/${quoteId}`,
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByRole('heading', { name: 'FAC-000100' })).toBeVisible();
    expect(screen.getAllByText('Origen COT-000001').length).toBeGreaterThan(0);
  });
});
