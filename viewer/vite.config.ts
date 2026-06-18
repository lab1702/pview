import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
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
  plugins: [preact(), emitIndexHtml()],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
})
