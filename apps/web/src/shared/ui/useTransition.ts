import { useEffect, useState } from 'react';

export type TransitionState = 'unmounted' | 'enter' | 'exit';

/**
 * Manages the lifecycle of a component that mounts/unmounts with an animation.
 * Returns 'enter' when it should be visible and animating in,
 * 'exit' when it is animating out, and 'unmounted' when it should be removed from the DOM.
 *
 * `enter` / `exit` are derived in render from `isOpen` so the first committed
 * paint already matches the open flag (needed for focus-trap setup).
 */
export function useTransition(isOpen: boolean, exitDurationMs: number): TransitionState {
  const [state, setState] = useState<TransitionState>(isOpen ? 'enter' : 'unmounted');
  const [prevOpen, setPrevOpen] = useState(isOpen);

  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    setState(isOpen ? 'enter' : state === 'unmounted' ? 'unmounted' : 'exit');
  }

  useEffect(() => {
    if (state !== 'exit') {
      return;
    }

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setState('unmounted');
      return;
    }

    const timer = setTimeout(() => {
      setState('unmounted');
    }, exitDurationMs);
    return () => clearTimeout(timer);
  }, [state, exitDurationMs]);

  return state;
}
