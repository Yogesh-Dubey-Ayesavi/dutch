import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { buildInfo } from './build-info';

const engine = fileURLToPath(new URL('../packages/engine/src/index.ts', import.meta.url));

export default defineConfig({
  root: 'src/client',
  publicDir: 'public',
  base: './',
  plugins: [react()],
  define: buildInfo,
  resolve: { alias: { '@engine': engine } },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    // SVGs are inlined (the Reddit web view won't load them as separate files); everything else stays a file.
    assetsInlineLimit: (file) => file.endsWith('.svg'),
    rollupOptions: {
      input: {
        launch: fileURLToPath(new URL('src/client/launch.html', import.meta.url)),
        game: fileURLToPath(new URL('src/client/game.html', import.meta.url)),
        tutorial: fileURLToPath(new URL('src/client/tutorial.html', import.meta.url)),
      },
    },
  },
});
