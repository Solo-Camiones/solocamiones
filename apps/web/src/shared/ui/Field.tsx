import {
  useEffect,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';

import { FieldControlContext, mergeDescribedBy, useFieldControl } from './field-context';

export type FieldProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  describedBy?: string;
  invalid?: boolean;
  children: ReactNode;
};

export function Field({
  label,
  htmlFor,
  hint,
  error,
  describedBy,
  invalid = false,
  children,
}: FieldProps) {
  const hintId = useId();
  const errorId = useId();
  const showHint = Boolean(hint) && !error;
  const isInvalid = Boolean(error) || invalid;
  const describedByIds = mergeDescribedBy(
    showHint ? hintId : undefined,
    error ? errorId : undefined,
    describedBy,
  );

  useEffect(() => {
    if (!error) {
      return;
    }

    const control = document.getElementById(htmlFor);
    if (!control) {
      return;
    }

    const root = control.closest('form') ?? control.closest('[role="dialog"]') ?? document.body;
    const firstInvalid = root.querySelector('[aria-invalid="true"]');
    if (firstInvalid === control) {
      control.focus();
    }
  }, [error, htmlFor]);

  return (
    <FieldControlContext.Provider
      value={{ controlId: htmlFor, describedBy: describedByIds, invalid: isInvalid }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={htmlFor} className="text-sm font-medium text-navy">
          {label}
        </label>
        {children}
        {showHint && (
          <p id={hintId} className="text-xs text-navy-400">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </FieldControlContext.Provider>
  );
}

function useControlA11y(
  explicitId: string | undefined,
  describedByFromProps: string | undefined,
  invalidFromProps: InputHTMLAttributes<HTMLInputElement>['aria-invalid'],
) {
  const field = useFieldControl();
  const id = explicitId ?? field?.controlId;
  const describedBy = mergeDescribedBy(field?.describedBy, describedByFromProps);
  const invalid =
    invalidFromProps === true || invalidFromProps === 'true' || (invalidFromProps == null && field?.invalid)
      ? true
      : undefined;

  return { id, describedBy, invalid };
}

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = '', id, ...props }: InputProps) {
  const a11y = useControlA11y(id, props['aria-describedby'], props['aria-invalid']);
  const borderClass = a11y.invalid
    ? 'border-red-400 focus:border-red-500 focus:ring-red-300/30'
    : 'border-navy-200 focus:border-brand focus:ring-brand-light/30';

  return (
    <input
      className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-navy placeholder:text-navy-300 focus:outline-none focus:ring-2 ${borderClass} ${className}`}
      {...props}
      id={a11y.id}
      aria-describedby={a11y.describedBy}
      aria-invalid={a11y.invalid}
    />
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className = '', id, ...props }: TextareaProps) {
  const a11y = useControlA11y(id, props['aria-describedby'], props['aria-invalid']);
  const borderClass = a11y.invalid
    ? 'border-red-400 focus:border-red-500 focus:ring-red-300/30'
    : 'border-navy-200 focus:border-brand focus:ring-brand-light/30';

  return (
    <textarea
      className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-navy placeholder:text-navy-300 focus:outline-none focus:ring-2 ${borderClass} ${className}`}
      {...props}
      id={a11y.id}
      aria-describedby={a11y.describedBy}
      aria-invalid={a11y.invalid}
    />
  );
}
