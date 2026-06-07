import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    clearMocks: true,

    // Test pyramid includes: unit (node) and module (jsdom).
    // integration/*.docker.test.js are run separately via test:integration.
    // e2e and ui layers run outside vitest (playwright, shell scripts).
    include: [
      'tests/unit/**/*.test.{js,ts}',
      'tests/module/**/*.test.{js,ts}',
    ],

    exclude: [
      // integration layer — requires running Docker services
      'tests/integration/**',
      // e2e / ui layers — playwright/synpress, not vitest
      'tests/e2e/**',
      'tests/ui/**',
      // smartcontracts e2e-synpress — Playwright specs (headed browser)
      'smartcontracts/e2e-synpress/**',
      // forge lib/ — contains Hardhat test stubs that trip vitest
      '**/lib/**',
      '**/node_modules/**',
    ],

    // Per-layer environment overrides via the @vitest-environment docblock:
    //   tests/unit/**  → node (default, fastest)
    //   tests/module/** → jsdom (declared per-file with // @vitest-environment jsdom)
    environment: 'node',

    coverage: {
      provider: 'v8',
      include: ['academy/**/*.js'],
      exclude: ['**/node_modules/**', '**/lib/**'],
    },
  },

  resolve: {
    // viem is imported from CDN in browser; resolve to npm package in tests.
    alias: {
      'https://esm.sh/viem@2': 'viem',
    },
  },
});
