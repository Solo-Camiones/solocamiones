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
import '../../support/dom';
import { chooseSelectOption } from '../../support/select-menu';

const cashCustomer = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Cliente contado',
  customerType: 'CASH',
  creditLimitDop: null,
  creditTermDays: null,
  rnc: null,
  address: null,
  notes: null,
  isDefault: true,
  contacts: [],
  createdAt: '2026-09-07T01:00:00.000Z',
  updatedAt: '2026-09-07T01:00:00.000Z',
};

const fleetCustomer = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Flota Este',
  customerType: 'CASH',
  creditLimitDop: null,
  creditTermDays: null,
  rnc: '131098765',
  address: null,
  notes: null,
  isDefault: false,
  contacts: [],
  createdAt: '2026-09-07T01:00:00.000Z',
  updatedAt: '2026-09-07T01:00:00.000Z',
};

const installation = {
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Instalación mecánica',
  description: null,
  active: true,
  createdAt: '2026-09-07T01:00:00.000Z',
  updatedAt: '2026-09-07T01:00:00.000Z',
};

const draftId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type ApiLine = {
  id: string;
  type: string;
  description: string;
  notes: string | null;
  quantity: string;
  unitPrice: string;
  taxable: boolean;
  gross: string;
  base: string;
  itbis: string;
  acquisitionCostDop: string | null;
  costProvenance: string | null;
  serviceId: string | null;
};

type ApiInvoice = {
  id: string;
  status: 'DRAFT' | 'COMPLETED' | 'CANCELLED';
  number: string | null;
  currency: 'DOP' | 'USD';
  fiscal: boolean;
  applyItbis: boolean;
  customer: { id: string; name: string; rnc: string | null; isDefault: boolean; customerType?: 'CASH' | 'CREDIT' };
  customerSnapshot: { name: string; rnc: string | null; phone: string | null } | null;
  confirmedAt: string | null;
  dueDate: string | null;
  sellerName: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledByName: string | null;
  paymentState: 'PENDING' | 'OVERDUE' | 'PAID' | 'PAID_LATE' | 'CANCELLED';
  payments: [];
  paid: string;
  refunded: string;
  balance: string;
  lines: ApiLine[];
  totals: { gross: string; base: string; itbis: string };
  createdAt: string;
  updatedAt: string;
  document?: { status: 'READY' } | { status: 'FAILED'; errorId: string };
  profitability?: {
    status: 'CALCULATED' | 'UNAVAILABLE' | 'MANUAL';
    reason: 'UNKNOWN_COST' | 'PENDING_FX_RATE' | null;
    profitDop: string | null;
    margin: string | null;
  };
};

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

function emptyInvoice(id = draftId): ApiInvoice {
  return {
    id,
    status: 'DRAFT',
    number: null,
    currency: 'DOP',
    fiscal: false,
    applyItbis: false,
    customer: {
      id: cashCustomer.id,
      name: cashCustomer.name,
      rnc: cashCustomer.rnc,
      isDefault: true,
      customerType: cashCustomer.customerType,
    },
    customerSnapshot: null,
    confirmedAt: null,
    dueDate: null,
    sellerName: null,
    cancelledAt: null,
    cancelReason: null,
    cancelledByName: null,
    paymentState: 'PENDING',
    payments: [],
    paid: '0.00',
    refunded: '0.00',
    balance: '0.00',
    lines: [],
    totals: { gross: '0.00', base: '0.00', itbis: '0.00' },
    createdAt: '2026-09-09T12:00:00.000Z',
    updatedAt: '2026-09-09T12:00:00.000Z',
  };
}

function sumGross(lines: ApiLine[]): string {
  const total = lines.reduce((sum, line) => sum + Number(line.gross), 0);
  return total.toFixed(2);
}

let role: Role;
let invoices: ApiInvoice[];
let customers: Array<typeof cashCustomer | typeof fleetCustomer>;
let nextDraftNumber: number;
let nextFacNumber: number;
let fetchMock: ReturnType<typeof vi.fn>;

function invoiceById(id: string) {
  return invoices.find((item) => item.id === id);
}

function replaceInvoice(next: ApiInvoice) {
  invoices = invoices.map((item) => (item.id === next.id ? next : item));
}

beforeEach(() => {
  role = 'SELLER';
  invoices = [];
  customers = [cashCustomer, fleetCustomer];
  nextDraftNumber = 1;
  nextFacNumber = 1;
  fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const url = String(path);
    if (path === '/api/auth/session' || path === '/api/auth/me') return json(identity(role));
    if (url.startsWith('/api/customers?') && !init?.method) {
      return json({ items: customers, total: customers.length, page: 1, pageSize: 10 });
    }
    if (url.startsWith('/api/customers/') && !init?.method) {
      const id = url.slice('/api/customers/'.length);
      const found = customers.find((customer) => customer.id === id);
      if (!found) return json({ error: { code: 'NOT_FOUND' } }, 404);
      return json(found);
    }
    if (url.startsWith('/api/customers/') && init?.method === 'PATCH') {
      const id = url.slice('/api/customers/'.length);
      const body = JSON.parse(init.body as string);
      customers = customers.map((customer) =>
        customer.id === id ? { ...customer, ...body } : customer,
      );
      const updated = customers.find((customer) => customer.id === id);
      if (!updated) return json({ error: { code: 'NOT_FOUND' } }, 404);
      return json(updated);
    }
    if (url === '/api/catalogs/services') return json({ items: [installation] });
    if (url.startsWith('/api/sales?status=DRAFT')) {
      const items = invoices.filter((item) => item.status === 'DRAFT');
      return json({ items, total: items.length, page: 1, pageSize: 10 });
    }
    if (url.startsWith('/api/sales?status=COMPLETED')) {
      const items = invoices.filter((item) => item.status === 'COMPLETED');
      return json({ items, total: items.length, page: 1, pageSize: 10 });
    }
    if (url.startsWith('/api/sales?status=CANCELLED')) {
      const items = invoices.filter((item) => item.status === 'CANCELLED');
      return json({ items, total: items.length, page: 1, pageSize: 10 });
    }
    if (url.startsWith('/api/sales?page=') && !init?.method) {
      return json({ items: invoices, total: invoices.length, page: 1, pageSize: 10 });
    }
    if (url === '/api/sales' && init?.method === 'POST') {
      const created = emptyInvoice(
        nextDraftNumber === 1 ? draftId : `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${nextDraftNumber}`,
      );
      nextDraftNumber += 1;
      invoices = [...invoices, created];
      return json(created, 201);
    }

    const salesMatch = url.match(/^\/api\/sales\/([^/]+)(?:\/(lines|confirm))?$/);
    if (salesMatch) {
      const id = salesMatch[1];
      const action = salesMatch[2];
      const current = invoiceById(id);
      if (!current) return json({ error: { code: 'NOT_FOUND' } }, 404);

      if (action === 'confirm' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body ?? '{}')) as {
          payment?: { amount: string; method: string };
        };
        if (
          body.payment == null &&
          JSON.stringify(body) !== '{}'
        ) {
          throw new Error(`Unexpected confirm body: ${String(init.body)}`);
        }
        const number = `FAC-${String(nextFacNumber).padStart(6, '0')}`;
        nextFacNumber += 1;
        const paidInFull = body.payment?.amount === current.totals.gross;
        const confirmed: ApiInvoice = {
          ...current,
          status: 'COMPLETED',
          number,
          customerSnapshot: { name: current.customer.name, rnc: current.customer.rnc, phone: null },
          confirmedAt: '2026-09-09T13:00:00.000Z',
          dueDate: '2026-10-09',
          sellerName: role,
          balance: paidInFull ? '0.00' : current.totals.gross,
          document: { status: 'READY' },
          ...(role === 'ADMINISTRATOR'
            ? {
                profitability: {
                  status: 'CALCULATED' as const,
                  reason: null,
                  profitDop: '50.00',
                  margin: '42.37',
                },
              }
            : {}),
        };
        replaceInvoice(confirmed);
        return json(confirmed);
      }

      if (action === 'lines' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        const line: ApiLine = {
          id: `line-${current.lines.length + 1}`,
          type: body.type,
          description: body.description ?? installation.name,
          notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
          quantity: body.quantity ?? '1.00',
          unitPrice: body.unitPrice ?? '0.00',
          taxable: body.type === 'GENERIC' || body.type === 'EXTERNAL',
          gross: body.unitPrice ?? '0.00',
          base: body.unitPrice ?? '0.00',
          itbis: body.type === 'GENERIC' || body.type === 'EXTERNAL' ? '0.00' : '0.00',
          acquisitionCostDop: body.acquisitionCostDop ?? null,
          costProvenance: body.costProvenance ?? null,
          serviceId: body.serviceId ?? null,
        };
        const next = {
          ...current,
          lines: [...current.lines, line],
          totals: { ...current.totals, gross: sumGross([...current.lines, line]) },
        };
        replaceInvoice(next);
        return json(next, 201);
      }

      if (!action && init?.method === 'PATCH') {
        const body = JSON.parse(init.body as string);
        if (body.fiscal === true && (current.customer.isDefault || !current.customer.rnc)) {
          return json(
            {
              error: {
                code: 'CONFLICT',
                message: 'A fiscal invoice requires a customer with RNC or Cédula',
              },
            },
            409,
          );
        }
        const nextCustomer =
          body.customerId != null
            ? customers.find((customer) => customer.id === body.customerId)
            : current.customer;
        const next: ApiInvoice = {
          ...current,
          ...body,
          customer: nextCustomer
            ? {
                id: nextCustomer.id,
                name: nextCustomer.name,
                rnc: nextCustomer.rnc,
                isDefault: nextCustomer.isDefault,
                customerType: nextCustomer.customerType,
              }
            : current.customer,
        };
        replaceInvoice(next);
        return json(next);
      }

      if (!action && init?.method === 'DELETE') {
        invoices = invoices.filter((item) => item.id !== id);
        return new Response(null, { status: 204 });
      }

      if (!action && !init?.method) {
        return json(current);
      }
    }

    const pdfMatch = url.match(/^\/api\/sales\/([^/]+)\/pdf(?:\/(regenerate))?$/);
    if (pdfMatch) {
      const current = invoiceById(pdfMatch[1]!);
      if (!current) return json({ error: { code: 'NOT_FOUND' } }, 404);

      if (pdfMatch[2] === 'regenerate' && init?.method === 'POST') {
        if (role !== 'ADMINISTRATOR') return json({ error: { code: 'FORBIDDEN' } }, 403);
        if (current.document?.status !== 'FAILED') {
          return json(
            {
              error: {
                code: 'CONFLICT',
                message: 'Solo se puede regenerar el PDF de una factura con generación fallida',
              },
            },
            409,
          );
        }
        const next = { ...current, document: { status: 'READY' as const } };
        replaceInvoice(next);
        return json(next);
      }

      if (!pdfMatch[2] && !init?.method) {
        if (current.document?.status === 'FAILED') {
          return json(
            {
              error: {
                code: 'CONFLICT',
                message: 'La generación del PDF falló',
                errorId: current.document.errorId,
              },
            },
            409,
          );
        }
        return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${current.number ?? 'invoice'}.pdf"`,
          },
        });
      }
    }

    throw new Error(`Unexpected endpoint: ${path} ${init?.method ?? 'GET'}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = () => 'blob:http://localhost/invoice-pdf';
  URL.revokeObjectURL = () => {};
});

afterEach(() => vi.unstubAllGlobals());

function mount(path = '/sales') {
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

describe('M21 HTTP POS draft UI', () => {
  it('lets a seller create a draft with the four R2 lines, change currency, and discard', async () => {
    const user = userEvent.setup();
    mount();

    expect(await screen.findByRole('heading', { name: 'Ventas y Facturas' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Inicio' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nuevo borrador' }));

    expect(await screen.findByRole('heading', { name: 'Punto de venta' })).toBeVisible();
    expect(screen.getByLabelText('Cliente')).toHaveTextContent(/Cliente contado/);
    expect(screen.getByLabelText(/Factura con comprobante fiscal/)).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Agregar línea' }));
    await user.click(await screen.findByLabelText('Tipo de línea'));
    expect(screen.getByRole('option', { name: 'Mercancía genérica' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Reventa externa' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Servicio mecánico' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Entrega' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Pieza' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Mercancía genérica' }));

    await user.type(screen.getByLabelText('Descripción'), 'Filtro de aceite');
    await user.clear(screen.getByLabelText('Precio'));
    await user.type(screen.getByLabelText('Precio'), '100');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(await screen.findByText('Filtro de aceite')).toBeVisible();

    const genericCall = fetchMock.mock.calls.find(
      ([requestPath, init]) =>
        String(requestPath) === `/api/sales/${draftId}/lines` && init?.method === 'POST',
    );
    expect(JSON.parse(genericCall![1].body)).toMatchObject({
      type: 'GENERIC',
      unitPrice: '100.00',
    });
    expect(JSON.parse(genericCall![1].body)).not.toHaveProperty('costProvenance');

    await user.click(screen.getByRole('button', { name: 'Agregar línea' }));
    await chooseSelectOption(user, 'Tipo de línea', 'SERVICE');
    await user.clear(screen.getByLabelText('Precio'));
    await user.type(screen.getByLabelText('Precio'), '40');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(await screen.findByText('Instalación mecánica')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Agregar línea' }));
    await chooseSelectOption(user, 'Tipo de línea', 'DELIVERY');
    const deliveryDescription = screen.getByLabelText('Descripción');
    await user.clear(deliveryDescription);
    await user.type(deliveryDescription, 'Entrega al patio');
    await user.clear(screen.getByLabelText('Importe (0 = cortesía)'));
    await user.type(screen.getByLabelText('Importe (0 = cortesía)'), '0');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(await screen.findByText('Entrega al patio')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Agregar línea' }));
    await chooseSelectOption(user, 'Tipo de línea', 'EXTERNAL');
    const externalDescription = screen.getByLabelText('Descripción');
    await user.clear(externalDescription);
    await user.type(externalDescription, 'Bomba comprada');
    await user.clear(screen.getByLabelText('Precio'));
    await user.type(screen.getByLabelText('Precio'), '80');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(await screen.findByText('Bomba comprada')).toBeVisible();
    const externalCall = fetchMock.mock.calls.find(([requestPath, init]) => {
      if (String(requestPath) !== `/api/sales/${draftId}/lines` || init?.method !== 'POST') {
        return false;
      }
      return JSON.parse(init.body as string).type === 'EXTERNAL';
    });
    expect(JSON.parse(externalCall![1].body)).toMatchObject({
      type: 'EXTERNAL',
      unitPrice: '80.00',
    });
    expect(JSON.parse(externalCall![1].body)).not.toHaveProperty('acquisitionCostDop');

    await user.click(screen.getByLabelText('Moneda'));
    await user.click(screen.getByRole('option', { name: 'Dólares (USD)' }));
    expect(
      fetchMock.mock.calls.some(
        ([requestPath, init]) =>
          String(requestPath) === `/api/sales/${draftId}` &&
          init?.method === 'PATCH' &&
          JSON.parse(init.body as string).currency === 'USD',
      ),
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Descartar borrador' }));
    await user.click(screen.getByRole('button', { name: 'Sí, descartar' }));
    expect(await screen.findByRole('heading', { name: 'Ventas y Facturas' })).toBeVisible();
  }, 10_000);

  it('shows an empty completed tab after requesting completed invoices', async () => {
    const user = userEvent.setup();
    invoices = [emptyInvoice()];
    mount();
    expect(await screen.findByRole('link', { name: 'Borrador' })).toBeVisible();
    fetchMock.mockClear();
    await user.click(screen.getByRole('button', { name: 'Completada' }));
    expect(await screen.findByText('No hay facturas en esta pestaña')).toBeVisible();
    expect(
      fetchMock.mock.calls.some(([requestPath]) =>
        String(requestPath).includes('/api/sales?status=COMPLETED'),
      ),
    ).toBe(true);
  });

  it('denies a mechanic the sales screen without calling the sales API', async () => {
    role = 'MECHANIC';
    mount();

    expect(await screen.findByText('Acceso no autorizado')).toBeVisible();
    expect(fetchMock.mock.calls.some(([path]) => String(path).startsWith('/api/sales'))).toBe(
      false,
    );
  });
});

async function addGenericLine(
  user: ReturnType<typeof userEvent.setup>,
  description: string,
  price: string,
) {
  await user.click(screen.getByRole('button', { name: 'Agregar línea' }));
  await user.type(screen.getByLabelText('Descripción'), description);
  await user.clear(screen.getByLabelText('Precio'));
  await user.type(screen.getByLabelText('Precio'), price);
  await user.click(screen.getByRole('button', { name: 'Agregar' }));
  expect(await screen.findByText(description)).toBeVisible();
}

async function confirmOpenSale(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Confirmar venta' }));
  const dialog = await screen.findByRole('dialog', { name: 'Confirmar venta' });
  expect(within(dialog).getByText('Pago inicial')).toBeVisible();
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar venta' }));
}

describe('M22 HTTP confirmation UI', () => {
  it('confirms DOP and USD sales, shows FAC- in list and detail, and freezes the customer snapshot', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole('button', { name: 'Nuevo borrador' }));
    expect(await screen.findByRole('heading', { name: 'Punto de venta' })).toBeVisible();
    await user.click(screen.getByLabelText('Cliente'));
    await user.click(screen.getByRole('option', { name: /Flota Este/ }));
    await addGenericLine(user, 'Filtro de aceite', '118');
    await confirmOpenSale(user);

    expect(await screen.findByText('Factura FAC-000001 confirmada')).toBeVisible();
    expect(screen.getByText(/Cliente Flota Este/)).toBeVisible();
    expect(
      fetchMock.mock.calls.some(
        ([requestPath, init]) =>
          String(requestPath) === `/api/sales/${draftId}/confirm` && init?.method === 'POST',
      ),
    ).toBe(true);

    await user.click(screen.getByRole('link', { name: 'Ventas y Facturas' }));
    await user.click(await screen.findByRole('button', { name: 'Completada' }));
    expect(await screen.findByText('FAC-000001')).toBeVisible();
    expect(screen.getByText('Flota Este')).toBeVisible();

    await user.click(screen.getByRole('link', { name: 'FAC-000001' }));
    expect(await screen.findByRole('heading', { name: 'FAC-000001' })).toBeVisible();
    expect(screen.getByText(/Flota Este/)).toBeVisible();
    expect(screen.getByText('Filtro de aceite')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Vista previa del documento' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('NCF: ______________________')).toBeVisible();
    expect(within(dialog).getByTitle('FAC-000001.pdf')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Descargar' })).toBeVisible();
    expect(screen.queryByText('Rentabilidad')).not.toBeInTheDocument();
    await user.click(within(dialog).getByText('Cerrar'));

    await user.click(screen.getByRole('link', { name: 'Clientes' }));
    expect(await screen.findByText('Flota Este')).toBeVisible();
    const fleetRow = screen.getByText('Flota Este').closest('tr');
    await user.click(
      within(fleetRow as HTMLTableRowElement).getByRole('button', { name: 'Editar' }),
    );
    const nameField = await screen.findByLabelText('Nombre');
    await user.clear(nameField);
    await user.type(nameField, 'Flota Norte');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Flota Norte')).toBeVisible();

    await user.click(screen.getByRole('link', { name: 'Ventas y Facturas' }));
    await user.click(await screen.findByRole('button', { name: 'Completada' }));
    await user.click(await screen.findByRole('link', { name: 'FAC-000001' }));
    expect(await screen.findByRole('heading', { name: 'FAC-000001' })).toBeVisible();
    expect(screen.getByText(/Flota Este/)).toBeVisible();
    expect(screen.queryByText('Flota Norte')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Ventas y Facturas' }));
    await user.click(await screen.findByRole('button', { name: 'Nuevo borrador' }));
    expect(await screen.findByRole('heading', { name: 'Punto de venta' })).toBeVisible();
    await user.click(screen.getByLabelText('Moneda'));
    await user.click(screen.getByRole('option', { name: 'Dólares (USD)' }));
    await addGenericLine(user, 'Servicio USD', '50');
    await confirmOpenSale(user);
    expect(await screen.findByText('Factura FAC-000002 confirmada')).toBeVisible();
    expect(screen.getByLabelText('Moneda')).toHaveTextContent('Dólares (USD)');
  });

  it('hides PDF regeneration from the seller when generation failed', async () => {
    const completedId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    invoices = [
      {
        ...emptyInvoice(completedId),
        status: 'COMPLETED',
        number: 'FAC-000009',
        document: { status: 'FAILED', errorId: 'pdf-err-9' },
        customerSnapshot: { name: cashCustomer.name, rnc: null, phone: null },
        confirmedAt: '2026-09-09T13:00:00.000Z',
      },
    ];
    mount(`/sales/${completedId}`);

    expect(await screen.findByRole('heading', { name: 'FAC-000009' })).toBeVisible();
    expect(screen.getByText(/Referencia: pdf-err-9/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Vista previa del documento' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerar documento' })).not.toBeInTheDocument();
    expect(screen.queryByText('Rentabilidad')).not.toBeInTheDocument();
  });

  it('lets an administrator regenerate a failed PDF without reopening the sale', async () => {
    role = 'ADMINISTRATOR';
    const completedId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    invoices = [
      {
        ...emptyInvoice(completedId),
        status: 'COMPLETED',
        number: 'FAC-000009',
        document: { status: 'FAILED', errorId: 'pdf-err-9' },
        customerSnapshot: { name: cashCustomer.name, rnc: null, phone: null },
        confirmedAt: '2026-09-09T13:00:00.000Z',
      },
    ];
    const user = userEvent.setup();
    mount(`/sales/${completedId}`);

    expect(await screen.findByRole('heading', { name: 'FAC-000009' })).toBeVisible();
    expect(screen.getByText(/Referencia: pdf-err-9/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Regenerar documento' }));

    expect(await screen.findByRole('button', { name: 'Vista previa del documento' })).toBeVisible();
    expect(screen.queryByText(/Referencia: pdf-err-9/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerar documento' })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([requestPath, init]) =>
          String(requestPath) === `/api/sales/${completedId}/pdf/regenerate` &&
          init?.method === 'POST',
      ),
    ).toBe(true);
  });

  it('shows administrator profitability on a completed invoice', async () => {
    role = 'ADMINISTRATOR';
    const completedId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    invoices = [
      {
        ...emptyInvoice(completedId),
        status: 'COMPLETED',
        number: 'FAC-000010',
        document: { status: 'READY' },
        customerSnapshot: { name: cashCustomer.name, rnc: null, phone: null },
        confirmedAt: '2026-09-09T13:00:00.000Z',
        profitability: {
          status: 'CALCULATED',
          reason: null,
          profitDop: '5700.00',
          margin: '31.67',
        },
      },
    ];
    mount(`/sales/${completedId}`);

    expect(await screen.findByRole('heading', { name: 'FAC-000010' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Rentabilidad' })).toBeVisible();
    expect(screen.getByText(money(5_700, 'DOP'))).toBeVisible();
  });

  it('hides profitability from the seller even when the capability is on', async () => {
    role = 'SELLER';
    const completedId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    invoices = [
      {
        ...emptyInvoice(completedId),
        status: 'COMPLETED',
        number: 'FAC-000010',
        document: { status: 'READY' },
        customerSnapshot: { name: cashCustomer.name, rnc: null, phone: null },
        confirmedAt: '2026-09-09T13:00:00.000Z',
      },
    ];
    mount(`/sales/${completedId}`);

    expect(await screen.findByRole('heading', { name: 'FAC-000010' })).toBeVisible();
    expect(screen.queryByText('Rentabilidad')).not.toBeInTheDocument();
  });
});
