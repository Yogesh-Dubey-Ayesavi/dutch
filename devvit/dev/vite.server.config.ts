import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const p = (f: string) => fileURLToPath(new URL(f, import.meta.url));
export default defineConfig({ resolve: { alias: { '@engine': p('../../packages/engine/src/index.ts'), '@devvit/web/server': p('./fake-server.ts') } } });
