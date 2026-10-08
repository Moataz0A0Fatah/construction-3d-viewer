import { defineConfig } from 'vite';

export default defineConfig({
  base: '/construction-3d-viewer/',
  server: {
    fs: {
      allow: ['..']
    }
  },
  optimizeDeps: {
    exclude: ['openskp']
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});