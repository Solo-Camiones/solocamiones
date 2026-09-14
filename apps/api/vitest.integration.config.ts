import { defineConfig } from 'vitest/config';

import baseConfig from './vitest.config.js';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    globalSetup: ['./tests/integration/setup.ts'],
    include: ['tests/integration/**/*.test.ts'],
    coverage: {
      ...baseConfig.test?.coverage,
      reportsDirectory: './coverage/integration',
    },
  },
});
