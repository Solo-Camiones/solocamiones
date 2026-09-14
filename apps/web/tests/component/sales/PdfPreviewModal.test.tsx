// @vitest-environment jsdom

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InvoiceDetailView } from '../../../src/api/contracts/sales';
import { PdfPreviewModal } from '../../../src/features/sales/PdfPreviewModal';
import { renderWithProviders } from '../../support/render';
import '../../support/dom';

const detail: InvoiceDetailView = {
  id: 'INV-1',
  number: 'FAC-000001',
  status: 'COMPLETED',
  paymentState: 'PENDING',
  customerId: 'CUSTOMER-1',
  customerName: 'Flota Norte',
  currency: 'DOP',
  fiscal: false,
  lines: [],
  payments: [],
  total: 100,
  paid: 0,
  refunded: 0,
  balance: 100,
  createdAt: '2026-09-01T10:00:00.000Z',
  linkedWorkOrders: [],
  history: [],
  actions: {
    canPay: true,
    canCancel: false,
    canCorrectCurrency: false,
    canViewPdf: true,
    canRegeneratePdf: false,
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PdfPreviewModal', () => {
  it('renders the HTML fallback, prints the window, and closes through public actions', async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    const onClose = vi.fn();
    vi.stubGlobal('print', print);
    renderWithProviders(<PdfPreviewModal open detail={detail} onClose={onClose} />);

    const dialog = screen.getByRole('dialog', { name: 'Vista previa de factura' });
    expect(within(dialog).getByText('NCF: ______________________')).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: 'Descargar' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Imprimir' }));
    await user.click(within(dialog).getByText('Cerrar'));

    expect(print).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders the PDF URL and downloads it with the server filename', async () => {
    const user = userEvent.setup();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderWithProviders(
      <PdfPreviewModal
        open
        detail={detail}
        pdfFile={{ url: 'blob:http://localhost/invoice-1', filename: 'FAC-000001.pdf' }}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Vista previa de factura' });
    const frame = within(dialog).getByTitle('FAC-000001.pdf');
    expect(frame).toHaveAttribute('src', 'blob:http://localhost/invoice-1');
    await user.click(within(dialog).getByRole('button', { name: 'Descargar' }));

    expect(click).toHaveBeenCalledOnce();
    const anchor = click.mock.instances[0];
    expect(anchor).toHaveAttribute('href', 'blob:http://localhost/invoice-1');
    expect(anchor).toHaveAttribute('download', 'FAC-000001.pdf');
  });

  it('prints the embedded PDF instead of the browser window', async () => {
    const user = userEvent.setup();
    const windowPrint = vi.fn();
    vi.stubGlobal('print', windowPrint);
    renderWithProviders(
      <PdfPreviewModal
        open
        detail={detail}
        pdfFile={{ url: 'blob:http://localhost/invoice-1', filename: 'FAC-000001.pdf' }}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Vista previa de factura' });
    const frame = within(dialog).getByTitle('FAC-000001.pdf') as HTMLIFrameElement;
    const framePrint = vi.fn();
    Object.defineProperty(frame.contentWindow, 'print', { configurable: true, value: framePrint });

    await user.click(within(dialog).getByRole('button', { name: 'Imprimir' }));

    expect(framePrint).toHaveBeenCalledOnce();
    expect(windowPrint).not.toHaveBeenCalled();
  });
});
