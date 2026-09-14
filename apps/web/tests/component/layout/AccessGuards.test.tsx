// @vitest-environment jsdom

import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { GuestRoute } from '../../../src/shared/layout/GuestRoute';
import { markLogoutDiscardsReturnPath } from '../../../src/shared/layout/login-return-path';
import { ProtectedRoute } from '../../../src/shared/layout/ProtectedRoute';
import { RouteAccessGuard } from '../../../src/shared/layout/RouteAccessGuard';
import { CAPABILITY_PRESETS } from '../../../src/shared/config/capabilities';
import { createAuthValue, renderWithProviders } from '../../support/render';
import '../../support/dom';

afterEach(() => {
  sessionStorage.clear();
});

describe('access guards', () => {
  it('redirects guests from a protected route to login', async () => {
    const guest = { ...createAuthValue(), user: null, session: null };

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<div>Inicio de sesión</div>} />
        <Route
          path="/inventory"
          element={
            <ProtectedRoute roles={['ADMINISTRATOR', 'SELLER']}>
              <div>Inventario privado</div>
            </ProtectedRoute>
          }
        />
      </Routes>,
      { route: '/inventory', auth: guest },
    );

    expect(await screen.findByText('Inicio de sesión')).toBeVisible();
    expect(screen.queryByText('Inventario privado')).not.toBeInTheDocument();
  });

  it('redirects an authenticated seller away from login to the role home', async () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/login"
          element={
            <GuestRoute>
              <div>Inicio de sesión</div>
            </GuestRoute>
          }
        />
        <Route path="/dashboard" element={<div>Inicio vendedor</div>} />
      </Routes>,
      { route: '/login', auth: createAuthValue('SELLER') },
    );

    expect(await screen.findByText('Inicio vendedor')).toBeVisible();
  });

  it('does not send a mechanic back to a previous administrator URL after login', async () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/login"
          element={
            <GuestRoute>
              <div>Inicio de sesión</div>
            </GuestRoute>
          }
        />
        <Route path="/users" element={<div>Usuarios</div>} />
        <Route path="/mechanic" element={<div>Inicio mecánico</div>} />
      </Routes>,
      {
        route: '/login',
        locationState: { from: { pathname: '/users' } },
        auth: createAuthValue('MECHANIC'),
      },
    );

    expect(await screen.findByText('Inicio mecánico')).toBeVisible();
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument();
  });

  it('sends an administrator to the role home after logout instead of a previous seller screen', async () => {
    markLogoutDiscardsReturnPath();

    renderWithProviders(
      <Routes>
        <Route
          path="/login"
          element={
            <GuestRoute>
              <div>Inicio de sesión</div>
            </GuestRoute>
          }
        />
        <Route path="/customers" element={<div>Clientes</div>} />
        <Route path="/dashboard" element={<div>Inicio administrador</div>} />
      </Routes>,
      {
        route: '/login',
        locationState: { from: { pathname: '/customers' } },
        auth: createAuthValue('ADMINISTRATOR'),
      },
    );

    expect(await screen.findByText('Inicio administrador')).toBeVisible();
    expect(screen.queryByText('Clientes')).not.toBeInTheDocument();
  });

  it('returns a seller to an allowed previous URL after login', async () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/login"
          element={
            <GuestRoute>
              <div>Inicio de sesión</div>
            </GuestRoute>
          }
        />
        <Route path="/inventory" element={<div>Inventario</div>} />
        <Route path="/dashboard" element={<div>Inicio vendedor</div>} />
      </Routes>,
      {
        route: '/login',
        locationState: { from: { pathname: '/inventory' } },
        auth: createAuthValue('SELLER'),
      },
    );

    expect(await screen.findByText('Inventario')).toBeVisible();
  });

  it('sends a seller to the role home when the previous URL is administrator-only', async () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/login"
          element={
            <GuestRoute>
              <div>Inicio de sesión</div>
            </GuestRoute>
          }
        />
        <Route path="/users" element={<div>Usuarios</div>} />
        <Route path="/dashboard" element={<div>Inicio vendedor</div>} />
      </Routes>,
      {
        route: '/login',
        locationState: { from: '/users' },
        auth: createAuthValue('SELLER'),
      },
    );

    expect(await screen.findByText('Inicio vendedor')).toBeVisible();
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument();
  });

  it('shows unauthorized for a mechanic entering a known desktop route', async () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/inventory"
          element={
            <ProtectedRoute roles={['ADMINISTRATOR', 'SELLER']}>
              <div>Inventario privado</div>
            </ProtectedRoute>
          }
        />
      </Routes>,
      { route: '/inventory', auth: createAuthValue('MECHANIC') },
    );

    expect(await screen.findByRole('heading', { name: 'Acceso no autorizado' })).toBeVisible();
  });

  it('distinguishes an unknown path from a forbidden desktop route', async () => {
    renderWithProviders(
      <Routes>
        <Route
          path="*"
          element={
            <ProtectedRoute roles={['ADMINISTRATOR', 'SELLER']}>
              <div>Contenido privado</div>
            </ProtectedRoute>
          }
        />
      </Routes>,
      { route: '/invenray', auth: createAuthValue('MECHANIC') },
    );

    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
    expect(screen.queryByText('Acceso no autorizado')).not.toBeInTheDocument();
  });

  it('blocks a seller from the work-order administration screens', async () => {
    renderWithProviders(
      <Routes>
        <Route element={<RouteAccessGuard />}>
          <Route path="/work-orders" element={<div>Cola administrativa</div>} />
        </Route>
      </Routes>,
      { route: '/work-orders', auth: createAuthValue('SELLER') },
    );

    expect(await screen.findByRole('heading', { name: 'Acceso no autorizado' })).toBeVisible();
    expect(screen.queryByText('Cola administrativa')).not.toBeInTheDocument();
  });

  it('blocks administrator-only sections inside the desktop shell', async () => {
    renderWithProviders(
      <Routes>
        <Route element={<RouteAccessGuard />}>
          <Route path="/users" element={<div>Gestión de usuarios</div>} />
        </Route>
      </Routes>,
      { route: '/users', auth: createAuthValue('SELLER') },
    );

    expect(await screen.findByRole('heading', { name: 'Acceso no autorizado' })).toBeVisible();
    expect(screen.queryByText('Gestión de usuarios')).not.toBeInTheDocument();
  });

  it('blocks a known route when its capability is disabled even for an administrator', async () => {
    renderWithProviders(
      <Routes>
        <Route element={<RouteAccessGuard />}>
          <Route path="/inventory" element={<div>Inventario visible</div>} />
        </Route>
      </Routes>,
      {
        route: '/inventory',
        auth: createAuthValue('ADMINISTRATOR'),
        capabilities: CAPABILITY_PRESETS['release-1'],
      },
    );

    expect(await screen.findByRole('heading', { name: 'Acceso no autorizado' })).toBeVisible();
    expect(screen.queryByText('Inventario visible')).not.toBeInTheDocument();
  });
});
