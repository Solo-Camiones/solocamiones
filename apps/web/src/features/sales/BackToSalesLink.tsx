import { useContext } from 'react';
import { UNSAFE_NavigationContext, useNavigate } from 'react-router-dom';

const SALES_FALLBACK_PATH = '/sales';

/**
 * In-app stack depth: MemoryRouter exposes `navigator.index`;
 * BrowserRouter stores the same counter on `history.state.idx`.
 * `window.history.length` is not used because it includes pages outside this SPA.
 */
function canGoBackInApp(navigator: unknown): boolean {
  if (
    typeof navigator === 'object' &&
    navigator !== null &&
    'index' in navigator &&
    typeof navigator.index === 'number'
  ) {
    return navigator.index > 0;
  }

  const browserIndex = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof browserIndex === 'number' && browserIndex > 0;
}

export function BackToSalesLink() {
  const navigate = useNavigate();
  const { navigator } = useContext(UNSAFE_NavigationContext);

  function handleBack() {
    if (canGoBackInApp(navigator)) {
      navigate(-1);
      return;
    }

    navigate(SALES_FALLBACK_PATH);
  }

  return (
    <button
      type="button"
      aria-label="Volver atrás"
      onClick={handleBack}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-navy hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light/50"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path
          fill="currentColor"
          d="M15.53 4.22a.75.75 0 0 1 0 1.06L9.81 11l5.72 5.72a.75.75 0 1 1-1.06 1.06l-6.25-6.25a.75.75 0 0 1 0-1.06l6.25-6.25a.75.75 0 0 1 1.06 0Z"
        />
      </svg>
    </button>
  );
}
