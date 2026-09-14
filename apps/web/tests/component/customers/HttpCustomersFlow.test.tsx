// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => vi.stubEnv('VITE_USE_MOCK_API', 'false'));

import { router as appRouter } from '../../../src/router';
import { AuthProvider } from '../../../src/features/auth/AuthContext';
import { CapabilitiesProvider } from '../../../src/shared/config/CapabilitiesProvider';
import { ToastProvider, Toaster } from '../../../src/shared/ui';
import type { Role } from '../../../src/api/contracts/entities';
import '../../support/dom';

type CustomerFixture = {
  id: string;
  name: string;
  rnc: string | null;
  address: string | null;
  notes: string | null;
  isDefault: boolean;
  contacts: unknown[];
  createdAt: string;
  updatedAt: string;
};

const cashCustomer: CustomerFixture = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Cliente contado',
  rnc: null,
  address: null,
  notes: null,
  isDefault: true,
  contacts: [],
  createdAt: '2026-09-07T01:00:00.000Z',
  updatedAt: '2026-09-07T01:00:00.000Z',
};

const createdCustomer: CustomerFixture = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Flota Este',
  rnc: null,
  address: null,
  notes: null,
  isDefault: false,
  contacts: [],
  createdAt: '2026-09-07T01:00:00.000Z',
  updatedAt: '2026-09-07T01:00:00.000Z',
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

let role: Role;
let customers: CustomerFixture[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  role = 'SELLER';
  customers = [cashCustomer];
  fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const url = String(path);
    if (path === '/api/auth/session' || path === '/api/auth/me') return json(identity(role));
    if (url.startsWith('/api/customers?') && !init?.method) {
      const query = new URL(url, 'http://local.invalid').searchParams.get('q')?.toLowerCase() ?? '';
      const items = customers.filter(
        (customer) =>
          !query ||
          customer.name.toLowerCase().includes(query) ||
          (customer.rnc?.includes(query) ?? false),
      );
      return json({ items, total: items.length, page: 1, pageSize: 10 });
    }
    if (path === '/api/customers' && init?.method === 'POST') {
      const body = JSON.parse(init.body as string);
      const digits = String(body.rnc ?? '').replace(/\D/g, '');
      if (body.rnc && digits.length !== 9 && digits.length !== 11) {
        return json(
          {
            error: {
              code: 'VALIDATION',
              message: 'Request validation failed',
              details: {
                issues: [
                  {
                    path: 'rnc',
                    message: 'Fiscal identifier must be a 9-digit RNC or 11-digit Cédula',
                  },
                ],
              },
            },
          },
          400,
        );
      }
      const created = { ...createdCustomer, name: body.name };
      customers = [...customers, created];
      return json(created, 201);
    }
    if (url.startsWith('/api/customers/') && !init?.method) {
      const id = url.slice('/api/customers/'.length);
      const customer = customers.find((entry) => entry.id === id);
      if (!customer) return json({ error: { code: 'NOT_FOUND' } }, 404);
      return json(customer);
    }
    throw new Error(`Unexpected endpoint: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function mount(path = '/customers') {
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

describe('M19 HTTP customer directory UI', () => {
  it('lets a seller search and create without exposing invoice counts', async () => {
    const user = userEvent.setup();
    mount();

    expect(await screen.findByText('Cliente contado')).toBeVisible();
    expect(screen.queryByRole('columnheader', { name: 'Facturas' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ventas y Facturas' })).toBeVisible();

    const cashRow = screen.getByText('Cliente contado').closest('tr');
    expect(cashRow).not.toBeNull();
    expect(within(cashRow as HTMLTableRowElement).getByRole('button', { name: 'Editar' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }));
    await user.type(screen.getByLabelText('Nombre'), 'Flota Este');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar creación' }));

    expect(await screen.findByText('Flota Este')).toBeVisible();
    const createCall = fetchMock.mock.calls.find(
      ([requestPath, init]) => requestPath === '/api/customers' && init?.method === 'POST',
    );
    expect(createCall).toBeDefined();
    expect(createCall![1].headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(JSON.parse(createCall![1].body)).toEqual({
      name: 'Flota Este',
      rnc: '',
      address: '',
      notes: '',
      contacts: [],
    });
  });

  it('names the fiscal identifier when the API rejects an invalid cédula', async () => {
    const user = userEvent.setup();
    mount();
    expect(await screen.findByText('Cliente contado')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }));
    await user.type(screen.getByLabelText('Nombre'), 'Flota Este');
    await user.type(screen.getByLabelText('Identificación fiscal / cédula'), '1234567890');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar creación' }));

    expect(
      await screen.findAllByText('Debe ser un RNC de 9 dígitos o una cédula de 11 dígitos.'),
    ).not.toHaveLength(0);
    expect(screen.getByRole('dialog', { name: 'Nuevo cliente' })).toBeVisible();
    expect(screen.getByText('Revisa los datos antes de crear el cliente.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Volver a editar' }));
    expect(screen.getByLabelText('Identificación fiscal / cédula')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.queryByText('Revise los datos ingresados.')).not.toBeInTheDocument();
  });

  it('denies a mechanic the customer directory', async () => {
    role = 'MECHANIC';
    mount();

    expect(await screen.findByText('Acceso no autorizado')).toBeVisible();
    expect(screen.queryByText('Cliente contado')).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([path]) => String(path).startsWith('/api/customers')),
    ).toBe(false);
  });
});
