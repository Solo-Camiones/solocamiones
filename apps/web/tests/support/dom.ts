// jest-dom's /vitest entry imports `vitest` from the hoisted package at the
// repo root. npm keeps vitest inside apps/web, so Node cannot resolve that
// optional peer. Load the matchers here and extend the expect instance this
// file already imports. The type-only import keeps Vitest's Assertion
// augmentation without evaluating dist/vitest.mjs.
import type {} from '@testing-library/jest-dom/vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

expect.extend(matchers);

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub;
}

afterEach(() => {
  cleanup();
});
