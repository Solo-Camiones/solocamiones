import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { Button } from './Button';
import {
  ToastContext,
  type Toast,
  type ToastOptions,
  type ToastTone,
  useToast,
} from './toast-context';
import {
  CheckCircleIcon,
  ErrorCircleIcon,
  InfoCircleIcon,
  WarningTriangleIcon,
  XIcon,
} from './icons';

const DEFAULT_TOAST_DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((message: string, tone: ToastTone = 'info', options?: ToastOptions) => {
    const id = crypto.randomUUID();
    const durationMs = options?.durationMs ?? DEFAULT_TOAST_DURATION_MS;
    setToasts((current) => [...current, { id, message, tone, durationMs, action: options?.action }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, durationMs);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const value = useMemo(
    () => ({ toasts, pushToast, dismissToast }),
    [toasts, pushToast, dismissToast],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

const toneClasses: Record<ToastTone, string> = {
  info: 'border-brand-light/40 bg-white text-navy',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-900',
};

const toneIcons: Record<ToastTone, ReactNode> = {
  info: <InfoCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />,
  success: <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />,
  warning: <WarningTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />,
  error: <ErrorCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />,
};

export function Toaster() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`relative overflow-hidden rounded-lg border px-4 py-3 text-sm shadow-lg animate-slide-up-in ${toneClasses[toast.tone]}`}
        >
          <div className="flex items-start gap-3">
            {toneIcons[toast.tone]}
            <div className="min-w-0 flex-1">
              <span>{toast.message}</span>
              {toast.action ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-auto min-h-0 px-0 py-0 text-sm font-semibold text-brand hover:bg-transparent"
                  onClick={() => {
                    toast.action?.onClick();
                    dismissToast(toast.id);
                  }}
                >
                  {toast.action.label}
                </Button>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-1 -mt-1 h-8 w-8 shrink-0 text-navy-400 hover:text-navy"
              onClick={() => dismissToast(toast.id)}
              aria-label="Cerrar notificación"
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
          {/* Progress bar */}
          <div
            className="absolute bottom-0 left-0 h-1 bg-current opacity-20"
            style={{
              animation: 'toast-progress linear forwards',
              animationDuration: `${toast.durationMs}ms`,
            }}
          />
        </div>
      ))}
    </div>
  );
}
