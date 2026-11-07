import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 77,
        functions: 77,
        branches: 74,
        statements: 77,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/types.ts', 'src/index.ts'],
    },
    include: ['tests/**/*.test.ts'],
  },
});
