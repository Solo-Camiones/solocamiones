const UUID_SEGMENT =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/** Paths tools may emit (M4). Relative app paths only — no scheme or host. */
const APPROVED_APP_PATH = new RegExp(
  `^/(?:customers|receivables|profitability|sales/${UUID_SEGMENT})$`,
);

/**
 * Returns a same-origin React Router path when the href is an approved internal appPath.
 * External URLs, schemes, and unknown paths are rejected (rendered as plain text).
 */
export function toApprovedAppPath(href: string | undefined): string | null {
  if (href == null) return null;
  const trimmed = href.trim();
  if (trimmed.length === 0) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;
  if (trimmed.startsWith('//')) return null;

  let pathname = trimmed;
  try {
    if (trimmed.startsWith('/') && typeof window !== 'undefined') {
      pathname = new URL(trimmed, window.location.origin).pathname;
    } else if (trimmed.startsWith('/')) {
      pathname = trimmed.split(/[?#]/)[0] ?? trimmed;
    } else {
      return null;
    }
  } catch {
    return null;
  }

  return APPROVED_APP_PATH.test(pathname) ? pathname : null;
}
