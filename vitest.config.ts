import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The .env file is loaded by config.ts on import, so each run should start
    // from a known state rather than inheriting one from a previous run.
    env: {
      NODE_ENV: 'test',
    },
  },
});
