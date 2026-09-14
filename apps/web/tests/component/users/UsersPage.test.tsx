// @vitest-environment jsdom

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getInitialPassword } from '../../../src/mocks/services/users';
import { UsersPage } from '../../../src/features/users/UsersPage';
import { mockAuthRepository } from '../../../src/mocks/repositories/MockAuthRepository';
import { getMockState, resetMockState } from '../../../src/mocks/state';
import { renderWithProviders } from '../../support/render';
import { chooseSelectOption } from '../../support/select-menu';
import { signInAs } from '../../support/session';
import '../../support/dom';

describe('UsersPage', () => {
  beforeEach(() => {
    resetMockState();
    signInAs('ADMINISTRATOR');
  });

  afterEach(() => {
    resetMockState();
  });

  it('creates a user with the server-assigned initial password', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />, { route: '/users' });

    expect(await screen.findByText('Laura Pérez')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    await user.type(screen.getByLabelText('Nombre'), 'María López');
    await user.type(screen.getByLabelText('Usuario'), 'maria');
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
    expect(screen.queryByText(getInitialPassword())).not.toBeInTheDocument();
    expect(screen.getByText(/se mostrará una sola vez/i)).toBeVisible();
    await chooseSelectOption(user, 'Rol', 'SELLER');
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }));
    expect(screen.queryByTestId('initial-password')).not.toBeInTheDocument();
    expect(screen.getByText('maria')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Confirmar creación' }));

    expect(await screen.findByText('Usuario creado')).toBeVisible();
    expect(await screen.findByTestId('initial-password')).toHaveTextContent(getInitialPassword());
    expect(await screen.findByText('María López')).toBeVisible();

    const login = await mockAuthRepository.login('maria', getInitialPassword());
    expect(login.ok).toBe(true);
  });

  it('shows recovery requests as a separate empty administrator flow', async () => {
    renderWithProviders(<UsersPage />, { route: '/users' });

    expect(await screen.findByText('Solicitudes de recuperación')).toBeVisible();
    expect(await screen.findByText('No hay solicitudes pendientes')).toBeVisible();
  });

  it('shows Carlos as inactive and can filter by username', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />, { route: '/users' });

    const carlos = await screen.findByText('Carlos Méndez');
    const row = carlos.closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getByText('Inactivo')).toBeVisible();
    expect(within(row!).getByRole('button', { name: 'Activar' })).toBeVisible();

    await user.type(screen.getByLabelText('Buscar por nombre o usuario'), 'pedro');
    expect(await screen.findByText('Pedro Santana')).toBeVisible();
    expect(screen.queryByText('Laura Pérez')).not.toBeInTheDocument();
  });

  it('finds a user outside the current page', async () => {
    const state = getMockState();
    for (let index = 0; index < 10; index += 1) {
      state.users.push({
        id: `U-PAGE-${index}`,
        name: index === 9 ? 'Zeta Remoto' : `Usuario ${String(index).padStart(2, '0')}`,
        username: index === 9 ? 'zeta' : `usuario-${index}`,
        password: 'demo1234',
        role: 'SELLER',
        active: true,
      });
    }

    const user = userEvent.setup();
    renderWithProviders(<UsersPage />, { route: '/users' });
    expect(await screen.findByText('Mostrando 1–10 de 14')).toBeVisible();
    expect(screen.queryByText('Zeta Remoto')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Buscar por nombre o usuario'), 'zeta');

    expect(await screen.findByText('Zeta Remoto')).toBeVisible();
    expect(screen.getByText('Mostrando 1–1 de 1')).toBeVisible();
  });

  it('asks before deactivating and keeps the account if cancelled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />, { route: '/users' });

    const laura = await screen.findByText('Laura Pérez');
    const row = laura.closest('tr');
    expect(row).not.toBeNull();
    await user.click(within(row!).getByRole('button', { name: 'Desactivar' }));

    const dialog = await screen.findByRole('dialog', { name: 'Desactivar usuario' });
    expect(within(dialog).getByText(/no podrá iniciar sesión/i)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog', { name: 'Desactivar usuario' })).not.toBeInTheDocument();
    expect(within(row!).getByText('Activo')).toBeVisible();
  });

  it('deactivates only after confirmation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />, { route: '/users' });

    const laura = await screen.findByText('Laura Pérez');
    const row = laura.closest('tr');
    expect(row).not.toBeNull();
    await user.click(within(row!).getByRole('button', { name: 'Desactivar' }));

    const dialog = await screen.findByRole('dialog', { name: 'Desactivar usuario' });
    await user.click(within(dialog).getByRole('button', { name: 'Desactivar' }));

    expect(await screen.findByText('Usuario desactivado')).toBeVisible();
    expect(within(row!).getByText('Inactivo')).toBeVisible();
    expect(within(row!).getByRole('button', { name: 'Activar' })).toBeVisible();
  });

  it('activates a deactivated account only after confirmation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />, { route: '/users' });

    const carlos = await screen.findByText('Carlos Méndez');
    const row = carlos.closest('tr');
    expect(row).not.toBeNull();
    await user.click(within(row!).getByRole('button', { name: 'Activar' }));

    const dialog = await screen.findByRole('dialog', { name: 'Activar usuario' });
    await user.click(within(dialog).getByRole('button', { name: 'Activar' }));

    expect(await screen.findByText('Usuario activado')).toBeVisible();
    expect(within(row!).getByText('Activo')).toBeVisible();
  });
});
