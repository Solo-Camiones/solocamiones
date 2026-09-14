import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(process.cwd(), '../..');
  const env = loadEnv(mode, envDir, 'CLOUDFLARE_');
  const appEnv = loadEnv(mode, envDir, '');
  const tunnelHostname = env.CLOUDFLARE_TUNNEL_HOSTNAME?.trim();
  const isVitest = Boolean(process.env.VITEST);
  const mockInitialPassword =
    !isVitest && appEnv.VITE_USE_MOCK_API === 'true' ? appEnv.INITIAL_PASSWORD : undefined;

  return {
    envDir,
    plugins: [react(), tailwindcss()],
    // Prototype mock assigns the same INITIAL_PASSWORD as the API. Do not expose it
    // via envPrefix: HTTP builds still import mock modules and must not embed the secret.
    define: mockInitialPassword
      ? { 'import.meta.env.INITIAL_PASSWORD': JSON.stringify(mockInitialPassword) }
      : undefined,
    test: {
      // Prototype regressions must not depend on the developer's selected HTTP mode.
      // HTTP integration tests explicitly override this baseline with vi.stubEnv.
      env: {
        VITE_USE_MOCK_API: 'true',
        VITE_CAPABILITIES_PRESET: 'prototype',
        VITE_ENABLE_DEMO_CONTROLS: 'true',
        INITIAL_PASSWORD: 'test-initial-password',
      },
      environment: 'node',
      include: ['tests/**/*.test.{ts,tsx}'],
      pool: 'forks',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        reportsDirectory: './coverage',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.d.ts'],
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: tunnelHostname ? [tunnelHostname] : [],
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
