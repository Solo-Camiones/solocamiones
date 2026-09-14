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

type ServiceFixture = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const installation: ServiceFixture = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Instalación mecánica',
  description: 'En bahía',
  active: true,
  createdAt: '2026-09-07T01:00:00.000Z',
  updatedAt: '2026-09-07T01:00:00.000Z',
};

const createdService: ServiceFixture = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Diagnóstico electrónico',
  description: null,
  active: true,
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
let services: ServiceFixture[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  role = 'ADMINISTRATOR';
  services = [installation];
  fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const url = String(path);
    if (path === '/api/auth/session' || path === '/api/auth/me') return json(identity(role));
    if (url === '/api/catalogs/services' && !init?.method) {
      return json({ items: services });
    }
    if (url === '/api/catalogs/services' && init?.method === 'POST') {
      const body = JSON.parse(init.body as string);
      const created = { ...createdService, name: body.name, active: body.active ?? true };
      services = [...services, created];
      return json(created, 201);
    }
    if (url.startsWith('/api/catalogs/services/') && init?.method === 'PATCH') {
      const id = url.slice('/api/catalogs/services/'.length);
      const body = JSON.parse(init.body as string);
      const index = services.findIndex((entry) => entry.id === id);
      if (index < 0) return json({ error: { code: 'NOT_FOUND' } }, 404);
      const updated = { ...services[index]!, ...body };
      services = services.map((entry, entryIndex) => (entryIndex === index ? updated : entry));
      return json(updated);
    }
    throw new Error(`Unexpected endpoint: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function mount(path = '/catalogs') {
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

describe('M20 HTTP mechanical service catalog UI', () => {
  it('lets an administrator maintain services without opening inventory categories', async () => {
    const user = userEvent.setup();
    mount();

    expect(await screen.findByText('Instalación mecánica')).toBeVisible();
    expect(screen.queryByRole('tab', { name: 'Categorías' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva categoría' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ventas y Facturas' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Catálogos' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Nuevo servicio' }));
    await user.type(screen.getByLabelText('Nombre'), 'Diagnóstico electrónico');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Diagnóstico electrónico')).toBeVisible();
    const createCall = fetchMock.mock.calls.find(
      ([requestPath, init]) => requestPath === '/api/catalogs/services' && init?.method === 'POST',
    );
    expect(createCall).toBeDefined();
    expect(createCall![1].headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(JSON.parse(createCall![1].body)).toEqual({
      name: 'Diagnóstico electrónico',
      active: true,
    });
    expect(
      fetchMock.mock.calls.some(([requestPath]) =>
        String(requestPath).startsWith('/api/catalogs/categories'),
      ),
    ).toBe(false);

    const row = screen.getByText('Instalación mecánica').closest('tr');
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLTableRowElement).getByRole('button', { name: 'Desactivar' }));
    const deactivateDialog = await screen.findByRole('dialog', { name: 'Desactivar servicio' });
    await user.click(within(deactivateDialog).getByRole('button', { name: 'Desactivar' }));
    expect(await screen.findByText('Servicio desactivado')).toBeVisible();
    const patchCall = fetchMock.mock.calls.find(
      ([requestPath, init]) =>
        String(requestPath) === `/api/catalogs/services/${installation.id}` &&
        init?.method === 'PATCH',
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse(patchCall![1].body)).toEqual({
      active: false,
    });

    const inactiveRow = screen.getByText('Instalación mecánica').closest('tr');
    expect(inactiveRow).not.toBeNull();
    await user.click(within(inactiveRow as HTMLTableRowElement).getByRole('button', { name: 'Editar' }));
    const nameField = screen.getByLabelText('Nombre');
    await user.clear(nameField);
    await user.type(nameField, 'Instalación especializada');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Instalación especializada')).toBeVisible();
    const renameCall = fetchMock.mock.calls.find(([requestPath, init]) => {
      if (
        String(requestPath) !== `/api/catalogs/services/${installation.id}` ||
        init?.method !== 'PATCH'
      ) {
        return false;
      }
      return JSON.parse(init.body as string).name === 'Instalación especializada';
    });
    expect(renameCall).toBeDefined();
    expect(JSON.parse(renameCall![1].body)).toEqual({ name: 'Instalación especializada' });
  });

  it('denies a seller the catalogs screen without calling the services API', async () => {
    role = 'SELLER';
    mount();

    expect(await screen.findByText('Acceso no autorizado')).toBeVisible();
    expect(screen.queryByText('Instalación mecánica')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Catálogos' })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([path]) => String(path).startsWith('/api/catalogs/services')),
    ).toBe(false);
  });

  it('denies a mechanic the catalogs screen without calling the services API', async () => {
    role = 'MECHANIC';
    mount();

    expect(await screen.findByText('Acceso no autorizado')).toBeVisible();
    expect(screen.queryByText('Instalación mecánica')).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([path]) => String(path).startsWith('/api/catalogs/services')),
    ).toBe(false);
  });
});
