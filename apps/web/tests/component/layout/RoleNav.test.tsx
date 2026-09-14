// @vitest-environment jsdom

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_NAME } from '../../../src/shared/config/brand';
import { CAPABILITY_PRESETS } from '../../../src/shared/config/capabilities';
import { AppShell } from '../../../src/shared/layout/AppShell';
import { RoleNav } from '../../../src/shared/layout/RoleNav';
import { createAuthValue, renderWithProviders } from '../../support/render';
import '../../support/dom';

const originalMatchMedia = window.matchMedia;

function stubViewportWidth(width: number) {
  window.matchMedia = ((query: string) => {
    const minWidth = Number(/min-width:\s*(\d+)/.exec(query)?.[1] ?? 0);
    return {
      matches: width >= minWidth,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  }) as typeof window.matchMedia;
}

function renderShell(route = '/dashboard') {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<p>Inicio</p>} />
        <Route path="/users" element={<p>Usuarios</p>} />
      </Route>
    </Routes>,
    { route },
  );
}

describe('RoleNav', () => {
  it('groups administrator links and marks the current page', () => {
    renderWithProviders(<RoleNav role="ADMINISTRATOR" />, { route: '/sales' });

    expect(screen.getByRole('heading', { name: 'Operación' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Administración' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Finanzas y control' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ventas y Facturas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
  });

  it('groups seller links into operation and receivables', () => {
    renderWithProviders(<RoleNav role="SELLER" />, {
      route: '/dashboard',
      auth: createAuthValue('SELLER'),
    });

    expect(screen.getByRole('heading', { name: 'Operación' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Finanzas y control' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Clientes' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Cuentas por cobrar' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
  });

  it('hides group headings whose capabilities are off', () => {
    renderWithProviders(<RoleNav role="ADMINISTRATOR" />, {
      route: '/users',
      capabilities: CAPABILITY_PRESETS['release-1'],
    });

    expect(screen.queryByRole('heading', { name: 'Operación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Administración' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Finanzas y control' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Inventario' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('AppShell sidebar', () => {
  beforeEach(() => {
    stubViewportWidth(1440);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('does not show a section count', () => {
    renderShell();

    expect(screen.queryByText(/sección/i)).not.toBeInTheDocument();
    expect(screen.getByText(APP_NAME)).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Abrir menú' })).not.toBeInTheDocument();
  });

  it('keeps a compact collapsible sidebar on laptop widths', async () => {
    stubViewportWidth(1024);
    const user = userEvent.setup();
    renderShell();

    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ocultar menú' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Ocultar menú' }));
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  });

  it('opens overlay navigation on narrow viewports and closes it after a destination is chosen', async () => {
    stubViewportWidth(640);
    const user = userEvent.setup();
    renderShell();

    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();

    await user.click(screen.getByRole('link', { name: 'Usuarios' }));
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).not.toBeInTheDocument();
    expect(screen.getByText('Usuarios')).toBeVisible();
  });
});
