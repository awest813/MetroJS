import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    host: true,
    strictPort: true,
  },
  optimizeDeps: {
    // Vite 6 esbuild-prebundles Babylon so the browser does not fetch the
    // hundreds of raw ESM files (that stalls Chrome). Do not `exclude` core
    // on Vite 6 — that path is only a workaround for Vite 8 Rolldown, which
    // crashes with MatrixTrackPrecisionChange.
    // The glTF loader imports core by deep paths: prebundle it with core so
    // both share one copy (and one registry of file loaders).
    include: ['@babylonjs/core', '@babylonjs/loaders/glTF', 'simplex-noise', 'alea'],
  },
});
