// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => vi.stubEnv('VITE_USE_MOCK_API', 'false'));

import { router as appRouter } from '../../../src/router';
import { AuthProvider } from '../../../src/features/auth/AuthContext';
import { CapabilitiesProvider } from '../../../src/shared/config/CapabilitiesProvider';
import { ToastProvider, Toaster, money } from '../../../src/shared/ui';
import type { Role } from '../../../src/api/contracts/entities';
import { chooseSelectOption } from '../../support/select-menu';
import '../../support/dom';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function identity(role: Role) {
  return {
    id: `${role.toLowerCase()}-id`,
    name: role,
    username: role.toLowerCase(),
    role,
    mustChangePassword: false,
    active: true,
    phone: null,
    email: null,
    createdAt: '2026-09-07T01:00:00.000Z',
    updatedAt: '2026-09-07T01:00:00.000Z',
  };
}

type ProfitabilityStatus = 'CALCULATED' | 'UNAVAILABLE' | 'MANUAL';
type ProfitabilityReason = 'UNKNOWN_COST' | 'PENDING_FX_RATE' | null;

type CompletedRow = {
  id: string;
  status: 'COMPLETED';
  number: string;
  currency: 'DOP' | 'USD';
  customer: { id: string; name: string; rnc: string | null; isDefault: boolean };
  confirmedAt: string;
  totals: { gross: string; base: string; itbis: string };
  payments: Array<{ kind: 'PAYMENT' | 'REFUND'; amount: string; method: string; effectiveDate: string }>;
  profitability?: {
    status: ProfitabilityStatus;
    reason: ProfitabilityReason;
    profitDop: string | null;
    margin: string | null;
  };
};

const customer = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Flota Este',
  rnc: '131098765',
  isDefault: false,
};

let role: Role;
let invoices: CompletedRow[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  role = 'ADMINISTRATOR';
  invoices = [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'COMPLETED',
      number: 'FAC-000001',
      currency: 'DOP',
      customer,
      confirmedAt: '2026-09-01T16:00:00.000Z',
      totals: { gross: '18000.00', base: '18000.00', itbis: '0.00' },
      payments: [{ kind: 'PAYMENT', amount: '18000.00', method: 'CASH', effectiveDate: '2026-09-01' }],
      profitability: {
        status: 'CALCULATED',
        reason: null,
        profitDop: '5700.00',
        margin: '31.67',
      },
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      status: 'COMPLETED',
      number: 'FAC-000002',
      currency: 'USD',
      customer,
      confirmedAt: '2026-09-01T16:00:00.000Z',
      totals: { gross: '1200.00', base: '1200.00', itbis: '0.00' },
      payments: [],
      profitability: {
        status: 'UNAVAILABLE',
        reason: 'PENDING_FX_RATE',
        profitDop: null,
        margin: null,
      },
    },
    {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      status: 'COMPLETED',
      number: 'FAC-000003',
      currency: 'DOP',
      customer,
      confirmedAt: '2026-09-01T16:00:00.000Z',
      totals: { gross: '2000.00', base: '2000.00', itbis: '0.00' },
      payments: [],
      profitability: {
        status: 'UNAVAILABLE',
        reason: 'UNKNOWN_COST',
        profitDop: null,
        margin: null,
      },
    },
  ];
  fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const url = String(path);
    if (path === '/api/auth/session' || path === '/api/auth/me') return json(identity(role));
    if (url.startsWith('/api/sales?status=CANCELLED') && !init?.method) {
      return json({ items: [], total: 0, page: 1, pageSize: 10 });
    }
    if (url.startsWith('/api/sales?status=COMPLETED') && !init?.method) {
      const items = role === 'ADMINISTRATOR' ? invoices : invoices.map(({ profitability: _, ...rest }) => rest);
      return json({ items, total: items.length, page: 1, pageSize: 10 });
    }
    const retry = url.match(/^\/api\/profitability\/([^/]+)\/retry$/);
    if (retry && init?.method === 'POST') {
      if (role !== 'ADMINISTRATOR') return json({ error: { code: 'FORBIDDEN' } }, 403);
      invoices = invoices.map((item) =>
        item.id === retry[1]
          ? {
              ...item,
              profitability: {
                status: 'CALCULATED',
                reason: null,
                profitDop: '7177.00',
                margin: '10.00',
              },
            }
          : item,
      );
      return json({ id: retry[1] });
    }
    const manual = url.match(/^\/api\/profitability\/([^/]+)\/manual-gross-profit$/);
    if (manual && init?.method === 'POST') {
      if (role !== 'ADMINISTRATOR') return json({ error: { code: 'FORBIDDEN' } }, 403);
      const body = JSON.parse(String(init.body)) as { profitDop: string };
      invoices = invoices.map((item) =>
        item.id === manual[1]
          ? {
              ...item,
              profitability: {
                status: 'MANUAL',
                reason: null,
                profitDop: body.profitDop,
                margin: '90.00',
              },
            }
          : item,
      );
      return json({ id: manual[1] });
    }
    throw new Error(`Unexpected endpoint: ${path} ${init?.method ?? 'GET'}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function mount(path = '/profitability') {
  const router = createMemoryRouter(appRouter.routes, { initialEntries: [path] });
  render(
    <ToastProvider>
      <AuthProvider>
        <CapabilitiesProvider>
          <RouterProvider router={router} />
          <Toaster />
        </CapabilitiesProvider>
      </AuthProvider>
    </ToastProvider>,
  );
}

describe('HTTP profitability flow', () => {
  it('lists DOP profit, retries pending FX, records judged profit, and has no demo FX toggle', async () => {
    const user = userEvent.setup();
    mount();

    expect(await screen.findByRole('heading', { name: 'Rentabilidad' })).toBeVisible();
    await chooseSelectOption(user, 'Período', '30 días');
    expect(screen.getByRole('img', { name: 'Evolución financiera' })).toBeVisible();
    expect(screen.getAllByText('Cobrado neto').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Rentabilidad' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /tasa de cambio \(demo\)/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Tasa de demostración')).not.toBeInTheDocument();
    expect(screen.getAllByText(money(5_700, 'DOP')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pendiente de tasa de cambio').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Cálculo de rentabilidad reintentado')).toBeVisible();
    expect(screen.getAllByText(money(7_177, 'DOP')).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Registrar ganancia' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Ganancia bruta en pesos'), '1800');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar ganancia' }));

    expect(await screen.findByText('Ganancia bruta registrada')).toBeVisible();
    expect(screen.getAllByText(money(1_800, 'DOP')).length).toBeGreaterThan(0);
    expect(screen.getByText('Registrada por administrador')).toBeVisible();
    expect(
      fetchMock.mock.calls.some(
        ([requestPath, init]) =>
          String(requestPath) === '/api/profitability/cccccccc-cccc-4ccc-8ccc-cccccccccccc/manual-gross-profit' &&
          init?.method === 'POST',
      ),
    ).toBe(true);
  });

  it('denies a seller the profitability screen without listing sales for a snapshot', async () => {
    role = 'SELLER';
    mount();

    expect(await screen.findByText('Acceso no autorizado')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Rentabilidad' })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([path]) => String(path).startsWith('/api/sales?status=COMPLETED')),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([path]) => String(path).startsWith('/api/sales?status=CANCELLED')),
    ).toBe(false);
  });

  it('denies a mechanic the profitability screen without listing sales', async () => {
    role = 'MECHANIC';
    mount();

    expect(await screen.findByText('Acceso no autorizado')).toBeVisible();
    expect(
      fetchMock.mock.calls.some(([path]) => String(path).startsWith('/api/sales?status=COMPLETED')),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([path]) => String(path).startsWith('/api/sales?status=CANCELLED')),
    ).toBe(false);
  });
});
