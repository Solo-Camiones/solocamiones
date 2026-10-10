// @vitest-environment jsdom

import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthUser } from '../../../src/features/auth/auth-context';
import { ProfileForm } from '../../../src/features/profile/ProfileForm';
import { ProfilePage } from '../../../src/features/profile/ProfilePage';
import { getMockState, resetMockState } from '../../../src/mocks/state';
import { createAuthValue, renderWithProviders } from '../../support/render';
import { signInAs } from '../../support/session';
import '../../support/dom';

function sellerAuth() {
  const auth = createAuthValue('SELLER');
  auth.user = {
    id: 'U-LAURA',
    name: 'Laura Pérez',
    username: 'laura',
    role: 'SELLER',
    active: true,
    phone: '809-555-0101',
  };
  auth.session = { userId: 'U-LAURA', createdAt: '2026-08-25T16:00:00.000Z' };
  return auth;
}

describe('ProfilePage', () => {
  beforeEach(() => {
    resetMockState();
    signInAs('SELLER');
  });

  afterEach(() => {
    resetMockState();
  });

  it('shows username and role as read-only and submits contact changes', async () => {
    const user = userEvent.setup();
    const auth = sellerAuth();
    renderWithProviders(<ProfilePage />, { route: '/profile', auth });

    expect(screen.getByLabelText('Usuario')).toBeDisabled();
    expect(screen.getByLabelText('Usuario')).toHaveValue('laura');
    expect(screen.getByLabelText('Rol')).toBeDisabled();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Laura Pérez');

    const phone = screen.getByLabelText('Teléfono');
    await user.clear(phone);
    await user.type(phone, '809-555-8888');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Perfil actualizado')).toBeVisible();
    expect(auth.refresh).toHaveBeenCalled();
    expect(getMockState().users.find((entry) => entry.id === 'U-LAURA')?.phone).toBe(
      '809-555-8888',
    );
    expect(screen.queryByText('Debe cambiar su contraseña')).not.toBeInTheDocument();
  });

  it('shows a warning when the signed-in user must change their password', () => {
    const auth = sellerAuth();
    auth.user = { ...auth.user!, mustChangePassword: true };
    renderWithProviders(<ProfilePage />, { route: '/profile', auth });

    expect(screen.getByText('Debe cambiar su contraseña')).toBeVisible();
    expect(screen.getByText(/Esta cuenta usa una contraseña inicial o temporal/)).toBeVisible();
  });

  it('toggles visibility independently on each password field', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />, { route: '/profile', auth: sellerAuth() });

    const currentPassword = screen.getByLabelText('Contraseña actual');
    const newPassword = screen.getByLabelText('Nueva contraseña');
    const confirmPassword = screen.getByLabelText('Confirmar nueva contraseña');
    const toggles = screen.getAllByRole('button', { name: 'Mostrar contraseña' });

    expect(toggles).toHaveLength(3);
    expect(currentPassword).toHaveAttribute('type', 'password');
    expect(newPassword).toHaveAttribute('type', 'password');
    expect(confirmPassword).toHaveAttribute('type', 'password');

    await user.click(toggles[0]!);
    expect(currentPassword).toHaveAttribute('type', 'text');
    expect(newPassword).toHaveAttribute('type', 'password');
    expect(confirmPassword).toHaveAttribute('type', 'password');

    await user.click(toggles[1]!);
    expect(currentPassword).toHaveAttribute('type', 'text');
    expect(newPassword).toHaveAttribute('type', 'text');
    expect(confirmPassword).toHaveAttribute('type', 'password');
  });

  it('keeps in-progress name edits when session revalidates with the same contact data', async () => {
    const user = userEvent.setup();
    const initialUser = sellerAuth().user!;

    function SessionRevalidateHarness() {
      const [profileUser, setProfileUser] = useState<AuthUser>(initialUser);
      return (
        <>
          <button type="button" onClick={() => setProfileUser({ ...profileUser })}>
            Revalidate session
          </button>
          <ProfileForm user={profileUser} isSaving={false} error={null} onSubmit={vi.fn()} />
        </>
      );
    }

    renderWithProviders(<SessionRevalidateHarness />);
    const nameField = screen.getByLabelText('Nombre');
    await user.clear(nameField);
    await user.type(nameField, 'Nombre editado');
    await user.click(screen.getByRole('button', { name: 'Revalidate session' }));

    expect(screen.getByLabelText('Nombre')).toHaveValue('Nombre editado');
  });

  it('resets the form when server contact fields change after refresh', async () => {
    const user = userEvent.setup();
    const initialUser = sellerAuth().user!;

    function ServerUpdateHarness() {
      const [profileUser, setProfileUser] = useState<AuthUser>(initialUser);
      return (
        <>
          <button
            type="button"
            onClick={() => setProfileUser({ ...profileUser, name: 'Nombre del servidor' })}
          >
            Apply server profile
          </button>
          <ProfileForm user={profileUser} isSaving={false} error={null} onSubmit={vi.fn()} />
        </>
      );
    }

    renderWithProviders(<ServerUpdateHarness />);
    const nameField = screen.getByLabelText('Nombre');
    await user.clear(nameField);
    await user.type(nameField, 'Borrador local');
    await user.click(screen.getByRole('button', { name: 'Apply server profile' }));

    expect(screen.getByLabelText('Nombre')).toHaveValue('Nombre del servidor');
  });
});
