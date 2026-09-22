// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SalesRepository } from '../../../src/api/contracts/repositories';
import type { SellerSalesReport } from '../../../src/api/contracts/sales';
import { SellerSalesPage } from '../../../src/features/seller-sales/SellerSalesPage';
import { mockSalesRepository, mockUserRepository } from '../../../src/mocks/repositories';
import { resetMockState } from '../../../src/mocks/state';
import { createAuthValue, renderWithProviders } from '../../support/render';
import { signInAs } from '../../support/session';
import '../../support/dom';

const SAMPLE_REPORT: SellerSalesReport = {
  dateFrom: '2026-09-01',
  dateTo: '2026-09-18',
  sellerUserId: null,
  rows: [
    {
      documentType: 'INVOICE',
      number: 'FAC-000100',
      originNumber: null,
      documentDate: '2026-09-10T16:00:00.000Z',
      sellerUserId: 'U-LAURA',
      sellerName: 'Laura Pérez',
      customerName: 'Transportes del Caribe SRL',
      currency: 'DOP',
      gross: '1180.00',
    },
    {
      documentType: 'QUOTE',
      number: 'COT-000001',
      originNumber: null,
      documentDate: '2026-09-12T16:00:00.000Z',
      sellerUserId: 'U-LAURA',
      sellerName: 'Laura Pérez',
      customerName: 'Logística Norte SA',
      currency: 'USD',
      gross: '500.00',
    },
  ],
  totals: [
    {
      sellerUserId: 'U-LAURA',
      sellerName: 'Laura Pérez',
      currency: 'DOP',
      gross: '1180.00',
    },
  ],
  total: 2,
  page: 1,
  pageSize: 10,
};

function stubSellerSalesReport(value: SellerSalesReport) {
  return vi
    .spyOn(mockSalesRepository as SalesRepository, 'listSellerSalesReport')
    .mockResolvedValue({ ok: true, value });
}

async function waitForFormReady() {
  expect(await screen.findByRole('heading', { name: 'Ventas por vendedor' })).toBeVisible();
}

describe('SellerSalesPage', () => {
  beforeEach(() => {
    resetMockState();
    signInAs('ADMINISTRATOR');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMockState();
  });

  it('shows a skeleton while seller options are still loading', () => {
    vi.spyOn(mockUserRepository, 'list').mockReturnValue(new Promise(() => undefined));

    renderWithProviders(<SellerSalesPage />, {
      route: '/seller-sales',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(screen.getByRole('status', { name: 'Cargando ventas por vendedor' })).toBeVisible();
  });

  it('shows an error when the seller picker cannot load', async () => {
    vi.spyOn(mockUserRepository, 'list').mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: 'No se pudo listar usuarios.' },
    });

    renderWithProviders(<SellerSalesPage />, {
      route: '/seller-sales',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByText('No se pudo cargar ventas por vendedor')).toBeVisible();
    expect(screen.getByText('No se pudo listar usuarios.')).toBeVisible();
  });

  it('validates that both dates are required when the form is submitted empty', async () => {
    renderWithProviders(<SellerSalesPage />, {
      route: '/seller-sales',
      auth: createAuthValue('ADMINISTRATOR'),
    });
    await waitForFormReady();

    fireEvent.submit(screen.getByRole('button', { name: 'Consultar' }).closest('form')!);

    expect(screen.getByText('Indique fecha desde y fecha hasta.')).toBeVisible();
  });

  it('rejects an inverted date range in the form', async () => {
    const user = userEvent.setup();
    const listReport = stubSellerSalesReport(SAMPLE_REPORT);

    renderWithProviders(<SellerSalesPage />, {
      route: '/seller-sales',
      auth: createAuthValue('ADMINISTRATOR'),
    });
    await waitForFormReady();

    await user.type(screen.getByLabelText('Desde'), '2026-09-20');
    await user.type(screen.getByLabelText('Hasta'), '2026-09-01');
    await user.click(screen.getByRole('button', { name: 'Consultar' }));

    expect(screen.getByText('La fecha desde debe ser anterior o igual a la fecha hasta.')).toBeVisible();
    expect(listReport).not.toHaveBeenCalled();
  });

  it('rejects an inverted date range already present in the URL', async () => {
    const listReport = stubSellerSalesReport(SAMPLE_REPORT);

    renderWithProviders(<SellerSalesPage />, {
      route: '/seller-sales?dateFrom=2026-09-20&dateTo=2026-09-01',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByText('No se pudo consultar el reporte')).toBeVisible();
    expect(
      screen.getByText('La fecha desde debe ser anterior o igual a la fecha hasta.'),
    ).toBeVisible();
    expect(listReport).not.toHaveBeenCalled();
  });

  it('consults a valid range and shows invoice/quote rows with totals', async () => {
    const user = userEvent.setup();
    const listReport = stubSellerSalesReport(SAMPLE_REPORT);

    renderWithProviders(<SellerSalesPage />, {
      route: '/seller-sales',
      auth: createAuthValue('ADMINISTRATOR'),
    });
    await waitForFormReady();

    await user.type(screen.getByLabelText('Desde'), '2026-09-01');
    await user.type(screen.getByLabelText('Hasta'), '2026-09-18');
    await user.click(screen.getByLabelText('Vendedor'));
    await user.click(screen.getByRole('option', { name: 'Laura Pérez' }));
    await user.click(screen.getByRole('button', { name: 'Consultar' }));

    await waitFor(() =>
      expect(listReport).toHaveBeenCalledWith({
        dateFrom: '2026-09-01',
        dateTo: '2026-09-18',
        page: 1,
        sellerUserId: 'U-LAURA',
      }),
    );

    expect(await screen.findByText('FAC-000100')).toBeVisible();
    expect(screen.getByText('COT-000001')).toBeVisible();
    expect(screen.getByText('Factura')).toBeVisible();
    expect(screen.getByText('Cotización')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Totales por vendedor' })).toBeVisible();
    const totals = screen.getByRole('heading', { name: 'Totales por vendedor' }).closest('div');
    expect(totals).not.toBeNull();
    expect(within(totals!).getByText('Laura Pérez')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled();
  });

  it('shows an empty state and disables PDF download when the report has no rows', async () => {
    stubSellerSalesReport({
      ...SAMPLE_REPORT,
      rows: [],
      totals: [],
      total: 0,
    });

    renderWithProviders(<SellerSalesPage />, {
      route: '/seller-sales?dateFrom=2026-09-01&dateTo=2026-09-18',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByText('Sin resultados')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeDisabled();
  });

  it('surfaces a report query error from the repository', async () => {
    vi.spyOn(mockSalesRepository as SalesRepository, 'listSellerSalesReport').mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: 'El reporte falló en el servidor.' },
    });

    renderWithProviders(<SellerSalesPage />, {
      route: '/seller-sales?dateFrom=2026-09-01&dateTo=2026-09-18',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByText('No se pudo consultar el reporte')).toBeVisible();
    expect(screen.getByText('El reporte falló en el servidor.')).toBeVisible();
  });

  it('downloads the PDF and shows an error when the download fails', async () => {
    const user = userEvent.setup();
    stubSellerSalesReport(SAMPLE_REPORT);

    const createObjectURL = vi.fn(() => 'blob:http://localhost/seller-sales');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const download = vi
      .spyOn(mockSalesRepository as SalesRepository, 'getSellerSalesReportPdf')
      .mockResolvedValueOnce({
        ok: true,
        value: {
          blob: new Blob(['pdf'], { type: 'application/pdf' }),
          filename: 'ventas-por-vendedor.pdf',
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'INTERNAL', message: 'No se pudo generar el PDF.' },
      });

    renderWithProviders(<SellerSalesPage />, {
      route: '/seller-sales?dateFrom=2026-09-01&dateTo=2026-09-18',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByText('FAC-000100')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));

    await waitFor(() =>
      expect(download).toHaveBeenCalledWith({
        dateFrom: '2026-09-01',
        dateTo: '2026-09-18',
      }),
    );
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/seller-sales');

    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    expect(await screen.findByText('No se pudo descargar el PDF')).toBeVisible();
    expect(screen.getByText('No se pudo generar el PDF.')).toBeVisible();
  });

  it('paginates with Siguiente when total exceeds page size', async () => {
    const user = userEvent.setup();
    const pageOne: SellerSalesReport = {
      ...SAMPLE_REPORT,
      rows: [SAMPLE_REPORT.rows[0]!],
      total: 15,
      page: 1,
      pageSize: 10,
    };
    const pageTwo: SellerSalesReport = {
      ...SAMPLE_REPORT,
      rows: [SAMPLE_REPORT.rows[1]!],
      total: 15,
      page: 2,
      pageSize: 10,
    };
    const listReport = vi
      .spyOn(mockSalesRepository as SalesRepository, 'listSellerSalesReport')
      .mockImplementation(async (filters) => ({
        ok: true,
        value: (filters.page ?? 1) >= 2 ? pageTwo : pageOne,
      }));

    renderWithProviders(<SellerSalesPage />, {
      route: '/seller-sales?dateFrom=2026-09-01&dateTo=2026-09-18',
      auth: createAuthValue('ADMINISTRATOR'),
    });

    expect(await screen.findByText('Mostrando 1–10 de 15')).toBeVisible();
    expect(screen.getByText('FAC-000100')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() =>
      expect(listReport).toHaveBeenCalledWith({
        dateFrom: '2026-09-01',
        dateTo: '2026-09-18',
        page: 2,
      }),
    );
    expect(await screen.findByText('Mostrando 11–15 de 15')).toBeVisible();
    expect(screen.getByText('COT-000001')).toBeVisible();
  });
});
