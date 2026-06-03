/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Vitest configuration. Inherits the same Vite plugin set as the dev/build
// pipeline so React, JSX and TS just work in tests.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.*',
        '**/*.d.ts',
        'src/test/**',
        'src/main.tsx',
      ],
    },
    // Most of our components rely on browser APIs not present in jsdom by default.
    // We mock individual ones (matchMedia, IntersectionObserver) in setup.ts.
  },
})
