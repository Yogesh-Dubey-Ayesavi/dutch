import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@engine': fileURLToPath(new URL('../packages/engine/src/index.ts', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts'] },
});
