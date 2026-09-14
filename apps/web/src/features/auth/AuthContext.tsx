import type { AuthSession } from '../../api/contracts/auth';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { authRepository } from '../../api/repositories';
import { useMockApi } from '../../api/client/http-client';
import { err, ok, type AppError, type Result } from '../../shared/auth/types';
import { markLogoutDiscardsReturnPath } from '../../shared/layout/login-return-path';
import { Button, Info, useToast } from '../../shared/ui';
import { AuthContext, type AuthUser } from './auth-context';

export type { AuthUser } from './auth-context';
type AuthState = { user: AuthUser | null; session: AuthSession | null };
const SIGNED_OUT: AuthState = { user: null, session: null };

async function loadAuthUser(): Promise<Result<AuthState>> {
  const sessionResult = await authRepository.getSession();
  if (!sessionResult.ok) return sessionResult;
  if (!sessionResult.value) return ok(SIGNED_OUT);
  const userResult = await authRepository.getCurrentUser();
  if (!userResult.ok) {
    if (
      userResult.error.code === 'UNAUTHORIZED' ||
      (useMockApi && userResult.error.code === 'FORBIDDEN')
    )
      return ok(SIGNED_OUT);
    return userResult;
  }
  if (!userResult.value) return ok(SIGNED_OUT);
  // Only copy public fields, including when the prototype repository returns its internal user.
  const profile = userResult.value;
  const identity = 'id' in sessionResult.value ? sessionResult.value : profile;
  return ok({
    session: sessionResult.value,
    user: {
      id: identity.id,
      name: profile.name,
      username: identity.username,
      role: identity.role,
      active: profile.active,
      phone: profile.phone,
      email: profile.email,
      mustChangePassword: identity.mustChangePassword,
    },
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(SIGNED_OUT);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<AppError | null>(null);
  const generation = useRef(0);
  const { pushToast } = useToast();

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    const next = await loadAuthUser();
    if (current !== generation.current) return;
    if (next.ok) {
      setAuth(next.value);
      setLoadError(null);
    } else setLoadError(next.error);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    if (useMockApi) return;
    // Returning to a tab rechecks revocation and role changes without persisting client credentials.
    const revalidate = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
    };
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await authRepository.login(username, password);
    if (!result.ok) return result;
    const current = ++generation.current;
    const next = await loadAuthUser();
    if (current !== generation.current)
      return err({ code: 'UNAUTHORIZED', message: 'Inicie sesión nuevamente.' });
    if (!next.ok) return next;
    setAuth(next.value);
    setLoadError(null);
    if (!next.value.user)
      return err({
        code: 'UNAUTHORIZED',
        message: 'La sesión no está disponible. Inicie sesión nuevamente.',
      });
    return result;
  }, []);

  const clearSession = useCallback(() => {
    generation.current += 1;
    setAuth(SIGNED_OUT);
    setLoadError(null);
  }, []);

  const logout = useCallback(async () => {
    const result = await authRepository.logout();
    if (!result.ok) {
      pushToast(result.error.message, 'error');
      return;
    }
    clearSession();
    markLogoutDiscardsReturnPath();
  }, [pushToast, clearSession]);

  const value = useMemo(
    () => ({ ...auth, isLoading, login, logout, refresh, clearSession }),
    [auth, isLoading, login, logout, refresh, clearSession],
  );

  if (loadError)
    return (
      <div className="mx-auto max-w-lg p-6">
        <Info tone="error" title="No se pudo comprobar la sesión">
          {loadError.message}
        </Info>
        <Button onClick={() => void refresh()}>Reintentar</Button>
      </div>
    );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
