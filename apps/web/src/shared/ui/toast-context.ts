import { createContext, useContext } from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOptions = {
  durationMs?: number;
  action?: ToastAction;
};

export type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
  durationMs: number;
  action?: ToastAction;
};

export type ToastContextValue = {
  toasts: Toast[];
  pushToast: (message: string, tone?: ToastTone, options?: ToastOptions) => void;
  dismissToast: (id: string) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
