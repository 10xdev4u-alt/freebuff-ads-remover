import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 78,
        functions: 78,
        branches: 76,
        statements: 78,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/types.ts', 'src/index.ts'],
    },
    include: ['tests/**/*.test.ts'],
  },
});
