import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../../features/auth/useAuth';
import { useAppCapabilities } from '../config/CapabilitiesProvider';
import {
  clearDiscardedLoginReturnPath,
  resolvePostLoginRequestedPath,
} from './login-return-path';
import { postLoginPath } from './navigation';

export type GuestRouteProps = {
  children: ReactNode;
};

function resolveReturnPath(state: unknown): string | null {
  if (!state || typeof state !== 'object' || !('from' in state)) {
    return null;
  }

  const { from } = state as { from?: { pathname?: string } | string };

  if (typeof from === 'string') {
    return from;
  }

  if (from?.pathname && from.pathname !== '/login') {
    return from.pathname;
  }

  return null;
}

/** Redirects authenticated users away from the login screen. */
export function GuestRoute({ children }: GuestRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const capabilities = useAppCapabilities();

  useEffect(() => {
    if (user) {
      clearDiscardedLoginReturnPath();
    }
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-shell text-white">
        <p className="text-sm text-white/70">Cargando…</p>
      </div>
    );
  }

  if (user) {
    if (user.mustChangePassword) {
      return <Navigate to={user.role === 'MECHANIC' ? '/mechanic/profile' : '/profile'} replace />;
    }
    return (
      <Navigate
        to={postLoginPath(
          resolvePostLoginRequestedPath(resolveReturnPath(location.state)),
          user.role,
          capabilities,
        )}
        replace
      />
    );
  }

  return <>{children}</>;
}
