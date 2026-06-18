import { defineConfig } from 'vite'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Copy the production HTML template into the build output as index.html.
function emitIndexHtml() {
  return {
    name: 'emit-index-html',
    closeBundle() {
      copyFileSync(
        resolve(import.meta.dirname, 'template.html'),
        resolve(import.meta.dirname, '../src/pview/viewer_assets/index.html'),
      )
    },
  }
}

export default defineConfig({
  // JSX transform is driven by tsconfig's jsxImportSource: 'preact' (rolldown
  // reads it at build time). No top-level esbuild key — Vite 8 bundles via
  // rolldown and Vitest 4 via oxc, both of which ignore it (and Vitest warns).
  // M2 will add Vitest-side JSX transform config when it introduces component tests.
  build: {
    outDir: '../src/pview/viewer_assets',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/main.tsx'),
      formats: ['iife'],
      name: 'PviewViewer',
      fileName: () => 'app.js',
      cssFileName: 'app',
    },
  },
  plugins: [emitIndexHtml()],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
