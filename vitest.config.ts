import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@kujiale/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@kujiale/scene-schema': resolve(__dirname, 'packages/scene-schema/src/index.ts'),
      '@kujiale/asset-manager': resolve(__dirname, 'packages/asset-manager/src/index.ts'),
      '@kujiale/materials': resolve(__dirname, 'packages/materials/src/index.ts'),
      '@kujiale/lighting': resolve(__dirname, 'packages/lighting/src/index.ts'),
      '@kujiale/house-generator': resolve(__dirname, 'packages/house-generator/src/index.ts'),
      '@kujiale/landscape': resolve(__dirname, 'packages/landscape/src/index.ts'),
      '@kujiale/furniture': resolve(__dirname, 'packages/furniture/src/index.ts'),
      '@kujiale/walkthrough': resolve(__dirname, 'packages/walkthrough/src/index.ts'),
      '@kujiale/three-engine': resolve(__dirname, 'packages/three-engine/src/index.ts'),
      '@kujiale/floorplan-editor': resolve(__dirname, 'packages/floorplan-editor/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: true,
  },
});
