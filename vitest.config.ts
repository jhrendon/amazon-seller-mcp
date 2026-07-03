import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      thresholds: {
        // Aspirational 80% global coverage. Currently fails because only a
        // handful of modules have dedicated tests; add more tests to clear it.
        global: { branches: 80, functions: 80, lines: 80, statements: 80 },
      },
    },
  },
});
