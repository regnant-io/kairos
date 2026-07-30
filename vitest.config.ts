import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Mirrors the `@shared` / `@main` path aliases used by electron.vite.config.ts and
// the tsconfig `paths` so tests can import the deterministic OMR core the same way
// the app does.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Optional PBT/example tests are added in later tasks; don't fail the
    // script when none are present yet.
    passWithNoTests: true
  }
})
