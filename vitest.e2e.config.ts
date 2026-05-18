import { defineConfig } from 'vitest/config'

/** Headless smoke + policy checks (`npm run test:e2e`). */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/**/*.test.ts'],
    passWithNoTests: false,
  },
})
