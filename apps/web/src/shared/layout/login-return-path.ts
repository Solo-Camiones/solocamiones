const DISCARD_LOGIN_RETURN_PATH_KEY = 'auth.discard-login-return-path';

/**
 * Explicit logout must not restore the previous screen: that URL belongs to the
 * signed-out user. Session expiry still keeps `location.state.from` so the same
 * person can continue where they left off.
 */
export function markLogoutDiscardsReturnPath(): void {
  try {
    sessionStorage.setItem(DISCARD_LOGIN_RETURN_PATH_KEY, '1');
  } catch {
    // Private-mode or blocked storage must not prevent logout.
  }
}

export function shouldDiscardLoginReturnPath(): boolean {
  try {
    return sessionStorage.getItem(DISCARD_LOGIN_RETURN_PATH_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearDiscardedLoginReturnPath(): void {
  try {
    sessionStorage.removeItem(DISCARD_LOGIN_RETURN_PATH_KEY);
  } catch {
    // Same storage restriction as mark/read.
  }
}

export function resolvePostLoginRequestedPath(requestedPath: string | null): string | null {
  return shouldDiscardLoginReturnPath() ? null : requestedPath;
}
