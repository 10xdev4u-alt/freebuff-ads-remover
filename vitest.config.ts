import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 72,
        functions: 75,
        branches: 60,
        statements: 72,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/types.ts', 'src/index.ts'],
    },
    include: ['tests/**/*.test.ts'],
  },
});
