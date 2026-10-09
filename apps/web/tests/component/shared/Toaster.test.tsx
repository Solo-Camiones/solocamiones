// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider, Toaster, useToast } from '../../../src/shared/ui';
import '../../support/dom';

function ToastTrigger({ durationMs }: { durationMs?: number }) {
  const { pushToast } = useToast();
  return (
    <button type="button" onClick={() => pushToast('Hola', 'info', { durationMs })}>
      Show toast
    </button>
  );
}

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-dismisses a toast after its duration', () => {
    render(
      <ToastProvider>
        <ToastTrigger durationMs={1000} />
        <Toaster />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show toast' }));
    expect(screen.getByText('Hola')).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByText('Hola')).not.toBeInTheDocument();
  });

  it('clears pending auto-dismiss timers on unmount', () => {
    render(
      <ToastProvider>
        <ToastTrigger durationMs={4000} />
        <Toaster />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show toast' }));
    expect(screen.getByText('Hola')).toBeVisible();

    cleanup();

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(4000);
      });
    }).not.toThrow();
  });
});
