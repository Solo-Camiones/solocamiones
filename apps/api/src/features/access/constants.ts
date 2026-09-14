// Absolute session lifetime. Sliding expiry is out of scope for Release 1.
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const SESSION_COOKIE_NAME = 'sid';
export const SESSION_COOKIE_PATH = '/';
export const SESSION_COOKIE_SAME_SITE = 'lax' as const;

// 32 bytes → 64 hex chars in the cookie; only the SHA-256 digest is persisted.
export const SESSION_TOKEN_BYTES = 32;

export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 10;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const RECOVERY_RATE_LIMIT_MAX_ATTEMPTS = 10;
export const RECOVERY_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

// Same numeric policy as login: PATCH /me is a credential/profile mutation.
export const PROFILE_MUTATION_RATE_LIMIT_MAX_ATTEMPTS = LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
export const PROFILE_MUTATION_RATE_LIMIT_WINDOW_MS = LOGIN_RATE_LIMIT_WINDOW_MS;

// SPA calls GET /session and GET /me on load and on every tab focus.
export const ACCESS_READ_RATE_LIMIT_MAX_REQUESTS = 120;
export const ACCESS_READ_RATE_LIMIT_WINDOW_MS = 60 * 1000;

// Required on cookie-authenticated mutations. SameSite=Lax is the primary CSRF control.
export const CSRF_REQUEST_HEADER = 'x-requested-with';
export const CSRF_REQUEST_HEADER_VALUE = 'XMLHttpRequest';

export const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';

export const INSUFFICIENT_PERMISSIONS_MESSAGE = 'Insufficient permissions';

/** Placeholder admin-only route until M8 mounts `/api/admin/users`. Used by authorization tests and smoke. */
export const ADMIN_AUTHORIZATION_PROBE_PATH = '/admin-probe';

export function isSessionCookieSecure(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'production';
}
