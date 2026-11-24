// Production build of the client wired to the local fake server (for profiling). Usage:
//   OUT=/some/dir npx vite build --config dev/vite.prod-local.config.ts && npx vite preview --config dev/vite.prod-local.config.ts --port 5190
import { defineConfig, mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import local from './vite.local.config';
const p = (f: string) => fileURLToPath(new URL(f, import.meta.url));
export default mergeConfig(local, defineConfig({
  build: { assetsInlineLimit: (file: string) => file.endsWith('.svg'), outDir: process.env.OUT ?? p('../dist/prod-local'), emptyOutDir: true, rollupOptions: { input: { game: p('../src/client/game.html') } } },
  preview: { proxy: { '^/api/': 'http://localhost:5181', '^/dev/': 'http://localhost:5181' } },
}));
