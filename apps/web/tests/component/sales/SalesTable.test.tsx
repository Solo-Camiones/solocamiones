// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { SalesListRow } from '../../../src/api/contracts/sales';
import { SalesTable } from '../../../src/features/sales/SalesTable';
import '../../support/dom';

const CONFIRMED_INVOICE: SalesListRow = {
  id: 'INV-1',
  number: 'FAC-000001',
  status: 'COMPLETED',
  customerId: 'CUST-1',
  customerName: 'Transportes del Caribe',
  currency: 'DOP',
  fiscal: false,
  total: 5000,
  createdAt: '2026-09-10T10:00:00.000Z',
  confirmedAt: '2026-09-17T20:30:00.000Z', // Local 16:30 on Sept 17
  href: '/sales/INV-1',
};

const CONFIRMED_NIGHT_INVOICE: SalesListRow = {
  id: 'INV-2',
  number: 'FAC-000002',
  status: 'COMPLETED',
  customerId: 'CUST-1',
  customerName: 'Transportes del Caribe',
  currency: 'DOP',
  fiscal: false,
  total: 4500,
  createdAt: '2026-09-10T10:00:00.000Z',
  confirmedAt: '2026-09-18T01:30:00.000Z', // In UTC it is Sept 18 01:30, but locally in America/Santo_Domingo it is Sept 17 21:30
  href: '/sales/INV-2',
};

const ISSUED_QUOTE: SalesListRow = {
  id: 'INV-3',
  number: 'COT-000001',
  status: 'QUOTE_ISSUED',
  customerId: 'CUST-1',
  customerName: 'Transportes del Caribe',
  currency: 'DOP',
  fiscal: false,
  total: 8000,
  createdAt: '2026-09-10T10:00:00.000Z',
  quoteIssuedAt: '2026-09-15T14:00:00.000Z',
  href: '/sales/INV-3',
};

const UNCONFIRMED_DRAFT: SalesListRow = {
  id: 'INV-4',
  number: 'Borrador',
  status: 'DRAFT',
  customerId: 'CUST-1',
  customerName: 'Transportes del Caribe',
  currency: 'DOP',
  fiscal: false,
  total: 3000,
  createdAt: '2026-09-18T10:00:00.000Z',
  href: '/sales/INV-4',
};

describe('SalesTable', () => {
  it('displays the confirmation date (confirmedAt) for confirmed invoices', () => {
    render(
      <MemoryRouter>
        <SalesTable rows={[CONFIRMED_INVOICE]} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('columnheader', { name: 'Fecha' })).toBeVisible();
    expect(screen.getByText(/17\s+sep/i)).toBeVisible();
  });

  it('formats confirmation date in America/Santo_Domingo so night confirmations do not jump to next day', () => {
    render(
      <MemoryRouter>
        <SalesTable rows={[CONFIRMED_NIGHT_INVOICE]} />
      </MemoryRouter>,
    );

    // 2026-09-18T01:30:00.000Z confirmed yesterday night (21:30 local) must display 17 sep, not 18 sep.
    expect(screen.getByText(/17\s+sep/i)).toBeVisible();
    expect(screen.queryByText(/18\s+sep/i)).not.toBeInTheDocument();
  });

  it('displays quote issued date (quoteIssuedAt) while the document is an issued quote', () => {
    render(
      <MemoryRouter>
        <SalesTable rows={[ISSUED_QUOTE]} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/15\s+sep/i)).toBeVisible();
  });

  it('displays a dash (—) for unconfirmed/unissued drafts without dates', () => {
    render(
      <MemoryRouter>
        <SalesTable rows={[UNCONFIRMED_DRAFT]} />
      </MemoryRouter>,
    );

    expect(screen.getByText('—')).toBeVisible();
  });
});
