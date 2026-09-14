// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
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

let signedIn: boolean;
let restricted: boolean;
let role: Role;
let failPatch: boolean;
let failLogout: boolean;
let failSession: boolean;
let name: string;
let fetchMock: ReturnType<typeof vi.fn>;
const identity = () => ({
  id: 'real-user',
  username: 'realuser',
  name,
  role,
  mustChangePassword: restricted,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  signedIn = false;
  restricted = true;
  role = 'SELLER';
  failPatch = false;
  failLogout = false;
  failSession = false;
  name = 'Usuario real';
  fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/auth/login') {
      signedIn = true;
      return json(identity());
    }
    if (path === '/api/auth/session' && failSession)
      return json({ error: { code: 'INTERNAL' } }, 500);
    if (path === '/api/auth/logout') {
      if (failLogout) throw new TypeError('offline');
      signedIn = false;
      return new Response(null, { status: 204 });
    }
    if (path === '/api/auth/recovery-requests') return json({ message: 'generic' }, 202);
    if (!signedIn) return json({ error: { code: 'UNAUTHORIZED' } }, 401);
    if (path === '/api/auth/session') return json(identity());
    if (path === '/api/auth/me') {
      if (init?.method === 'PATCH') {
        if (failPatch)
          return json(
            { error: { code: 'VALIDATION', message: 'Current password is incorrect' } },
            400,
          );
        const body = JSON.parse(init.body as string);
        name = body.name;
        if (body.password !== undefined) {
          signedIn = false;
          restricted = false;
        }
      }
      return json({ ...identity(), active: true, phone: null, email: null });
    }
    const url = String(path);
    if (url.startsWith('/api/sales')) {
      return json({ items: [], total: 0, page: 1, pageSize: 10 });
    }
    if (url.startsWith('/api/customers')) {
      return json({ items: [], total: 0, page: 1, pageSize: 10 });
    }
    if (url === '/api/catalogs/services') return json({ items: [] });
    throw new Error(`Unexpected endpoint: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function mount(path = '/login') {
  const router = createMemoryRouter(appRouter.routes, { initialEntries: [path] });
  const view = render(
    <ToastProvider>
      <AuthProvider>
        <CapabilitiesProvider>
          <RouterProvider router={router} />
          <Toaster />
        </CapabilitiesProvider>
      </AuthProvider>
    </ToastProvider>,
  );
  return { ...view, router };
}
async function login(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Usuario'), 'realuser');
  await user.type(screen.getByLabelText('Contraseña'), 'solocamiones');
  await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
}
async function fillPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Contraseña actual'), 'solocamiones');
  await user.type(screen.getByLabelText('Nueva contraseña'), 'nueva-segura');
  await user.type(screen.getByLabelText('Confirmar nueva contraseña'), 'nueva-segura');
}

describe('Release 1 HTTP auth UI', () => {
  it.each<Role>(['ADMINISTRATOR', 'SELLER', 'MECHANIC'])(
    'requires password change and fresh login for %s',
    async (testRole) => {
      role = testRole;
      const user = userEvent.setup();
      const { router } = mount();
      await login(user);
      expect(await screen.findByText(/Debe cambiar su contraseña inicial/)).toBeVisible();
      const profilePath = role === 'MECHANIC' ? '/mechanic/profile' : '/profile';
      expect(router.state.location.pathname).toBe(profilePath);
      expect(screen.queryByRole('link', { name: 'Inicio' })).not.toBeInTheDocument();
      await act(async () => {
        await router.navigate('/users');
      });
      expect(router.state.location.pathname).toBe(profilePath);
      await fillPassword(user);
      failPatch = true;
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
      expect(await screen.findByText('La contraseña actual es incorrecta.')).toBeVisible();
      expect(router.state.location.pathname).toBe(profilePath);
      failPatch = false;
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
      expect(
        await screen.findByText('Contraseña actualizada. Inicie sesión con su nueva contraseña.'),
      ).toBeVisible();
      expect(router.state.location.pathname).toBe('/login');
      await login(user);
      expect(await screen.findByRole('heading', { name: 'Mi perfil' })).toBeVisible();
      expect(screen.queryByText(/Debe cambiar su contraseña inicial/)).not.toBeInTheDocument();
      if (testRole === 'ADMINISTRATOR') {
        expect(screen.getByRole('link', { name: 'Usuarios' })).toBeVisible();
      } else {
        expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
      }
      if (testRole === 'MECHANIC') {
        expect(screen.queryByRole('link', { name: 'Ventas y Facturas' })).not.toBeInTheDocument();
      } else {
        expect(screen.getByRole('link', { name: 'Ventas y Facturas' })).toBeVisible();
      }
      await user.click(screen.getByRole('button', { name: /Cuenta de/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
      const logoutDialog = await screen.findByRole('dialog', { name: 'Cerrar sesión' });
      await user.click(within(logoutDialog).getByRole('button', { name: 'Cerrar sesión' }));
      expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
    },
  );
  it('restores restriction on reload and contact edits do not remove it', async () => {
    signedIn = true;
    const user = userEvent.setup();
    const first = mount('/inventory');
    expect(await screen.findByText(/Debe cambiar su contraseña inicial/)).toBeVisible();
    const field = screen.getByLabelText('Nombre');
    await user.clear(field);
    await user.type(field, 'Nombre persistido');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Perfil actualizado')).toBeVisible();
    first.unmount();
    mount('/sales');
    expect(await screen.findByLabelText('Nombre')).toHaveValue('Nombre persistido');
    expect(screen.getByText(/Debe cambiar su contraseña inicial/)).toBeVisible();
  });
  it('also requires fresh login after a voluntary password change', async () => {
    signedIn = true;
    restricted = false;
    const user = userEvent.setup();
    const { router } = mount('/profile');
    await screen.findByRole('heading', { name: 'Mi perfil' });
    await fillPassword(user);
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(
      await screen.findByText('Contraseña actualizada. Inicie sesión con su nueva contraseña.'),
    ).toBeVisible();
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
  it('revoked sessions return to login on tab focus', async () => {
    signedIn = true;
    restricted = false;
    mount('/profile');
    await screen.findByRole('heading', { name: 'Mi perfil' });
    signedIn = false;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  });
  it('a failed logout retains the session and reports the connection error', async () => {
    signedIn = true;
    restricted = false;
    failLogout = true;
    const user = userEvent.setup();
    mount('/profile');
    await user.click(await screen.findByRole('button', { name: /Cuenta de/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
    const logoutDialog = await screen.findByRole('dialog', { name: 'Cerrar sesión' });
    await user.click(within(logoutDialog).getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByText(/No se pudo conectar con el servidor/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Mi perfil' })).toBeVisible();
  });
  it('shows a retryable failure instead of treating a server outage as signed out', async () => {
    signedIn = true;
    failSession = true;
    const user = userEvent.setup();
    mount('/profile');
    expect(await screen.findByText('No se pudo comprobar la sesión')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    failSession = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Mi perfil' })).toBeVisible();
  });
  it('submits recovery with a generic confirmation and displays 429', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: '¿Olvidó su contraseña?' }));
    await user.type(screen.getByLabelText('Usuario para recuperación'), 'unknown');
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'TOO_MANY_REQUESTS' } }, 429));
    await user.click(screen.getByRole('button', { name: 'Solicitar recuperación' }));
    expect(await screen.findByText(/Demasiados intentos/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Solicitar recuperación' }));
    expect(await screen.findByText('Solicitud recibida')).toBeVisible();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/recovery-requests',
        expect.objectContaining({ body: JSON.stringify({ username: 'unknown' }) }),
      ),
    );
  });
});
