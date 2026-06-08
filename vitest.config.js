import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    clearMocks: true,
    // Keep vitest's defaults, but never scan trees that aren't vitest's to run:
    //  - Foundry deps under `lib/` (OpenZeppelin ships a Hardhat `*.test.js`
    //    suite that errors with "Cannot find module 'hardhat'").
    //  - the headed Playwright/Synpress specs under e2e-synpress, and the
    //    pyramid's e2e/ui layers (run by playwright / shell, not vitest).
    exclude: [
      ...configDefaults.exclude,
      '**/lib/**',
      'smartcontracts/e2e-synpress/**',
      'tests/e2e/**',
      'tests/ui/**',
      // Playwright/Synpress specs (`*.spec.ts`) are driven by Playwright, not
      // vitest — importing @synthetixio/synpress pulls in esbuild and blows up
      // under vitest's collector.
      'tests/**/*.spec.ts',
      // local-only scratch tree (gitignored): the unpacked MetaMask extension
      // source ships its own *.test.tsx/*.spec.ts which aren't ours to run.
      'scratch/**',
    ],
    coverage: {
      provider: 'v8',
      include: ['smartcontracts/buckets/**/*.js'],
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 60,
      },
    },
  },
  resolve: {
    // Allow web3-core.js to import viem from CDN in the browser,
    // but resolve to the installed npm package during tests.
    alias: {
      'https://esm.sh/viem@2': 'viem',
    },
  },
});
