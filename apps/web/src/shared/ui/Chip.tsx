import type { HTMLAttributes, ReactNode } from 'react';

type ChipTone = 'neutral' | 'brand' | 'violet' | 'orange' | 'amber' | 'success' | 'danger';

export type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  tone?: ChipTone;
};

const toneClasses: Record<ChipTone, string> = {
  neutral: 'bg-navy-50 text-navy-700 border-navy-100',
  brand: 'bg-brand/10 text-brand-dark border-brand/30',
  violet: 'bg-violet-50 text-violet-900 border-violet-200',
  orange: 'bg-orange-50 text-orange-900 border-orange-200',
  amber: 'bg-amber-50 text-amber-900 border-amber-200',
  success: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  danger: 'bg-red-50 text-red-900 border-red-200',
};

export function Chip({ children, tone = 'neutral', className = '', ...props }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
