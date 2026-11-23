import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html'],
      thresholds: {
        lines: 72,
        functions: 73,
        branches: 60,
        statements: 71.5,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/types.ts', 'src/index.ts'],
    },
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
