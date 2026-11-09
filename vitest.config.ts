import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests (tests/**/*.test.ts): pure logic and the sharp image pipeline. No database and no network —
// the invariants that need the real `invoices` table stay in scripts/check-*.mjs (npm run check:all).
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
  },
})
