import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    host: true,
  },
  optimizeDeps: {
    // Vite 8's Rolldown prebundle can evaluate Babylon Matrix constructors
    // before PerformanceConfigurator static fields exist, which crashes with
    // "Cannot read properties of undefined (reading 'MatrixTrackPrecisionChange')".
    exclude: ['@babylonjs/core'],
  },
});
