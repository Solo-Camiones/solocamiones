import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

import type { Role } from '../../src/api/contracts/entities';
import {
  AuthContext,
  type AuthContextValue,
  type AuthUser,
} from '../../src/features/auth/auth-context';
import { CapabilitiesProvider } from '../../src/shared/config/CapabilitiesProvider';
import { CAPABILITY_PRESETS, type AppCapabilities } from '../../src/shared/config/capabilities';
import { ToastProvider, Toaster } from '../../src/shared/ui';

function authUser(role: Role): AuthUser {
  return {
    id: `U-${role}`,
    name: role,
    username: role.toLowerCase(),
    role,
    active: true,
  };
}

export function createAuthValue(role: Role = 'ADMINISTRATOR'): AuthContextValue {
  const user = authUser(role);
  return {
    user,
    session: { userId: user.id, createdAt: '2026-08-25T16:00:00.000Z' },
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    clearSession: vi.fn(),
  };
}

export function renderWithProviders(
  ui: ReactElement,
  options: {
    route?: string;
    locationState?: unknown;
    auth?: AuthContextValue;
    capabilities?: AppCapabilities;
  } = {},
) {
  const auth = options.auth ?? createAuthValue();
  const pathname = options.route ?? '/';
  const initialEntry =
    options.locationState !== undefined ? { pathname, state: options.locationState } : pathname;

  return {
    auth,
    ...render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuthContext.Provider value={auth}>
          {/* Component tests use the full prototype set so a local VITE_CAPABILITIES_PRESET does not hide later-release UI. */}
          <CapabilitiesProvider value={options.capabilities ?? CAPABILITY_PRESETS.prototype}>
            <ToastProvider>
              {ui}
              <Toaster />
            </ToastProvider>
          </CapabilitiesProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    ),
  };
}
