import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    clearMocks: true,
    // Keep vitest's defaults, but never scan Foundry dependency trees under
    // `lib/` (e.g. OpenZeppelin ships its own Hardhat `*.test.js` suite, which
    // errors with "Cannot find module 'hardhat'" and isn't ours to run).
    exclude: [...configDefaults.exclude, '**/lib/**'],
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
