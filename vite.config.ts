// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/construction-3d-viewer/', // ⬅️ Add this line. Use your repo's exact name.
  server: {
    fs: { allow: ['..'] }
  },
  optimizeDeps: {
    exclude: ['openskp']
  }
});