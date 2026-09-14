import { APP_NAME } from '../config/brand';
import { Logo } from './Logo';

type BrandMarkProps = {
  showLogo?: boolean;
  eyebrow?: string;
  className?: string;
};

/**
 * Wordmark de cabecera. El tracking amplio hace que SOLO CAMIONES se lea como
 * marca y no como un título de página en gris.
 */
export function BrandMark({ showLogo = false, eyebrow, className = '' }: BrandMarkProps) {
  return (
    <div className={`flex min-w-0 items-center gap-2.5 ${className}`}>
      {showLogo ? (
        <span aria-hidden="true" className="shrink-0">
          <Logo size="sm" />
        </span>
      ) : null}
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[10px] font-medium uppercase tracking-wider text-navy-400">
            {eyebrow}
          </p>
        ) : null}
        <p className="truncate text-sm font-semibold tracking-[0.18em] text-navy sm:text-base">
          {APP_NAME}
        </p>
      </div>
    </div>
  );
}
