import type { ReactNode } from 'react';

import { SpinnerIcon } from './icons';

type LoadingOverlayProps = {
  active: boolean;
  /** Accessible name announced while the data region is refreshing. */
  label: string;
  children: ReactNode;
};

export function LoadingOverlay({ active, label, children }: LoadingOverlayProps) {
  return (
    <div className="relative">
      {children}
      {active ? (
        <div
          role="status"
          aria-busy="true"
          aria-live="polite"
          aria-label={label}
          className="absolute inset-0 z-10 flex min-h-32 items-center justify-center rounded-xl bg-white/70"
        >
          <p className="sr-only">{label}</p>
          <SpinnerIcon className="h-8 w-8 text-navy" />
        </div>
      ) : null}
    </div>
  );
}
