import type { ButtonHTMLAttributes } from 'react';

import { SpinnerIcon } from './icons';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Disables the control and sets aria-busy to prevent double submit. */
  busy?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark focus-visible:ring-brand-light/50',
  secondary: 'bg-white text-navy border border-navy-200 hover:bg-navy-50',
  ghost: 'bg-transparent text-navy hover:bg-navy-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3 py-2 text-sm',
  md: 'min-h-11 px-4 py-2 text-sm',
  lg: 'min-h-12 px-5 py-2.5 text-base',
  icon: 'h-11 w-11 min-h-11 min-w-11 p-0',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  busy = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
      disabled={Boolean(disabled) || busy}
      aria-busy={busy || undefined}
    >
      {busy ? <SpinnerIcon /> : null}
      {children}
    </button>
  );
}
