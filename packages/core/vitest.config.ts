import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/helpers/global-setup.ts'],
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text-summary', 'lcov'],
      // The house standard: nothing merges under 60% line coverage.
      thresholds: { lines: 60 },
    },
  },
});
