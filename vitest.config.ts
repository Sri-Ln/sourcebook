import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  test: {
    // Extractors parse real markup, so a full DOM implementation matters more
    // here than raw speed. jsdom is stricter than happy-dom about the kind of
    // deeply nested structure LinkedIn ships.
    environment: 'jsdom',
    include: ['{tests,lib,entrypoints}/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
  // Provides WXT auto-imports and a fake browser API, which the storage tests
  // in #7 will need.
  plugins: [WxtVitest()],
});
