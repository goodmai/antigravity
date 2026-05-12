import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    clearMocks: true,
  },
  resolve: {
    // Allow web3-core.js to import viem from CDN in the browser,
    // but resolve to the installed npm package during tests.
    alias: {
      'https://esm.sh/viem@2': 'viem',
    },
  },
});
