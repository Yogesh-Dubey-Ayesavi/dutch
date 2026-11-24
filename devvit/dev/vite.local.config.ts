import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { buildInfo } from '../build-info';
const p = (f: string) => fileURLToPath(new URL(f, import.meta.url));
export default defineConfig({
  root: p('../src/client'),
  plugins: [react()],
  define: buildInfo,
  resolve: { alias: { '@engine': p('../../packages/engine/src/index.ts'), '@devvit/web/client': p('./fake-client.ts') } },
  server: { port: 5180, proxy: { '^/api/': 'http://localhost:5181', '^/dev/': 'http://localhost:5181' }, fs: { allow: [p('../..')] } },
});
