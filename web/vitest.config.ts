import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { VitePWA } from 'vite-plugin-pwa';
import {
  coverageIncludes,
  coverageExcludes,
} from '../scripts/coverage-scope.mjs';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    environment: 'node',
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts'],
          sequence: { groupOrder: 1 },
        },
      },
      {
        extends: true,
        plugins: [
          react(),
          VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            injectRegister: false,
          }),
        ],
        optimizeDeps: {
          noDiscovery: true,
          include: [
            'react',
            'react-dom/client',
            'react/jsx-runtime',
            'maplibre-gl',
            '@base-ui/react/dialog',
            '@base-ui/react/menu',
            '@base-ui/react/toggle-group',
            '@base-ui/react/toggle',
            'terra-draw',
            'terra-draw-maplibre-gl-adapter',
            'workbox-precaching',
            'workbox-routing',
            'workbox-window',
            'three/addons/controls/OrbitControls.js',
            'three/addons/exporters/GLTFExporter.js',
            'three/addons/exporters/STLExporter.js',
            'three/addons/loaders/GLTFLoader.js',
            'three/addons/loaders/OBJLoader.js',
            'three/addons/loaders/STLLoader.js',
            'lucide-react',
            'react-resizable-panels',
            '@base-ui/react/button',
            '@base-ui/react/tooltip',
            'three',
            'class-variance-authority',
            'clsx',
            'tailwind-merge',
            'idb',
            '@kninnug/constrainautor',
            'delaunator',
            'proj4',
            'jsts/org/locationtech/jts/algorithm/Centroid.js',
            'jsts/org/locationtech/jts/algorithm/InteriorPointArea.js',
            'jsts/org/locationtech/jts/geom/GeometryFactory.js',
            'jsts/org/locationtech/jts/io/GeoJSONReader.js',
            'jsts/org/locationtech/jts/io/GeoJSONWriter.js',
            'jsts/org/locationtech/jts/operation/buffer/BufferOp.js',
            'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js',
            'jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js',
            'jsts/org/locationtech/jts/operation/valid/IsValidOp.js',
          ],
        },
        test: {
          name: 'components',
          include: ['tests/components/**/*.test.tsx'],
          sequence: { groupOrder: 2 },
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: coverageIncludes,
      exclude: coverageExcludes,
      reporter: ['text-summary', 'json', 'json-summary', 'lcov', 'html'],
      reportsDirectory: 'coverage/unit',
      thresholds: {
        statements: 38,
        lines: 38,
        functions: 32,
        branches: 35,
        'server/local-dispatch.ts': {
          perFile: true,
          statements: 80,
          lines: 80,
          functions: 80,
          branches: 70,
        },
        'server/{diagnostics.mjs,request-envelope.ts}': {
          perFile: true,
          statements: 80,
          lines: 80,
          functions: 80,
          branches: 70,
        },
        'api/health.ts': {
          perFile: true,
          statements: 80,
          lines: 80,
          functions: 80,
          branches: 70,
        },
      },
    },
  },
});
