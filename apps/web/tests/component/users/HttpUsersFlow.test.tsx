// @vitest-environment jsdom

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => vi.stubEnv('VITE_USE_MOCK_API', 'false'));

import { router as appRouter } from '../../../src/router';
import { AuthProvider } from '../../../src/features/auth/AuthContext';
import { CapabilitiesProvider } from '../../../src/shared/config/CapabilitiesProvider';
import { ToastProvider, Toaster } from '../../../src/shared/ui';
import '../../support/dom';

const admin = {
  id: 'admin-id',
  name: 'Administrator',
  username: 'admin',
  role: 'ADMINISTRATOR',
  mustChangePassword: false,
};
const seller = {
  id: 'seller-id',
  name: 'Seller existente',
  username: 'seller',
  role: 'SELLER',
  active: true,
  mustChangePassword: false,
  phone: null,
  email: null,
  createdAt: '2026-09-07T01:00:00.000Z',
  updatedAt: '2026-09-07T01:00:00.000Z',
};
const pending = {
  id: 'request-id',
  userId: seller.id,
  status: 'PENDING',
  createdAt: '2026-09-07T01:00:00.000Z',
  expiresAt: '2026-09-08T01:00:00.000Z',
  resolvedAt: null,
  resolvedById: null,
  identityVerified: false,
  user: {
    id: seller.id,
    name: seller.name,
    username: seller.username,
    role: seller.role,
    active: true,
  },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let users: Array<typeof seller>;
let recoveries: Array<typeof pending>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  users = [seller];
  recoveries = [pending];
  fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/auth/session') return json(admin);
    if (path === '/api/auth/me') {
      return json({
        ...admin,
        active: true,
        phone: null,
        email: null,
        createdAt: '2026-09-07T01:00:00.000Z',
        updatedAt: '2026-09-07T01:00:00.000Z',
      });
    }
    if (path === '/api/admin/users?page=1&pageSize=10') {
      return json({ items: users, total: users.length, page: 1, pageSize: 10 });
    }
    if (path === '/api/admin/users/recovery-requests?page=1&pageSize=10') {
      return json({ items: recoveries, total: recoveries.length, page: 1, pageSize: 10 });
    }
    if (path === '/api/admin/users' && init?.method === 'POST') {
      const body = JSON.parse(init.body as string);
      const created = {
        ...seller,
        ...body,
        id: 'created-id',
        mustChangePassword: true,
        initialPassword: 'assigned-once',
      };
      users = [...users, created];
      return json(created, 201);
    }
    if (
      path === '/api/admin/users/recovery-requests/request-id/resolve' &&
      init?.method === 'POST'
    ) {
      recoveries = [];
      return json({ request: { ...pending, status: 'APPROVED' }, temporaryPassword: 'temp-once' });
    }
    throw new Error(`Unexpected endpoint: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function mount() {
  const router = createMemoryRouter(appRouter.routes, { initialEntries: ['/users'] });
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

describe('M11 HTTP user administration UI', () => {
  it('creates without credentials and delivers an approved temporary password only once', async () => {
    const user = userEvent.setup();
    mount();

    expect((await screen.findAllByText('Seller existente'))[0]).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
    expect(screen.queryByText('solocamiones')).not.toBeInTheDocument();
    expect(screen.getByText(/se mostrará una sola vez/i)).toBeVisible();
    await user.type(screen.getByLabelText('Nombre'), 'María López');
    await user.type(screen.getByLabelText('Usuario'), 'maria');
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar creación' }));

    expect(await screen.findByTestId('initial-password')).toHaveTextContent('assigned-once');
    await user.click(screen.getByRole('button', { name: 'Ya la entregué' }));
    expect(screen.queryByText('assigned-once')).not.toBeInTheDocument();
    expect(await screen.findByText('María López')).toBeVisible();
    const createCall = fetchMock.mock.calls.find(
      ([path, init]) => path === '/api/admin/users' && init?.method === 'POST',
    );
    expect(createCall).toBeDefined();
    expect(JSON.parse(createCall![1].body)).not.toHaveProperty('password');
    expect(JSON.parse(createCall![1].body)).not.toHaveProperty('active');

    const recoverySection = screen.getByRole('region', { name: 'Solicitudes de recuperación' });
    await user.click(within(recoverySection).getByRole('button', { name: 'Aprobar' }));
    const approve = screen.getByRole('button', { name: 'Aprobar y generar contraseña' });
    expect(approve).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    await user.click(approve);

    expect(await screen.findByTestId('temporary-password')).toHaveTextContent('temp-once');
    const resolveCall = fetchMock.mock.calls.find(([path]) =>
      String(path).endsWith('/recovery-requests/request-id/resolve'),
    );
    expect(JSON.parse(resolveCall![1].body)).toEqual({
      action: 'approve',
      identityVerified: true,
    });
    await user.click(screen.getByRole('button', { name: 'Ya la entregué' }));
    expect(screen.queryByText('temp-once')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('No hay solicitudes pendientes')).toBeVisible());
  });
});
