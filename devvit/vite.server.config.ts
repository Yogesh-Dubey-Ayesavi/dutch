import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

const engine = fileURLToPath(new URL('../packages/engine/src/index.ts', import.meta.url));

// Devvit runs the server as one self-contained CommonJS file: everything except Node built-ins is bundled.
export default defineConfig({
  resolve: { alias: { '@engine': engine } },
  ssr: { noExternal: true },
  build: {
    ssr: 'src/server/index.ts',
    outDir: 'dist/server',
    emptyOutDir: true,
    target: 'node22',
    sourcemap: true,
    rollupOptions: {
      external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
      output: { format: 'cjs', entryFileNames: 'index.cjs', inlineDynamicImports: true },
    },
  },
});
