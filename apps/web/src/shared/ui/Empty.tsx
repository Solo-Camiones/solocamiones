import type { ReactNode } from 'react';

export type EmptyProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
};

function DefaultEmptyIcon() {
  return (
    <svg className="h-10 w-10 text-navy-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
    </svg>
  );
}

export function Empty({ title, description, action, icon }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-navy-200 bg-navy-50/50 px-6 py-12 text-center">
      <div className="mb-3">{icon ?? <DefaultEmptyIcon />}</div>
      <p className="text-base font-medium text-navy">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-navy-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
