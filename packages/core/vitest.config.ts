import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json'],
      thresholds: {
        lines: 85,
        statements: 85,
        branches: 75,
        functions: 85,
      },
      include: ['src/**/*.{ts,tsx}'],
    },
  },
});
