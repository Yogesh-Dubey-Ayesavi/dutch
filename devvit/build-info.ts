/** Build-time facts the About sheet shows (version, build date, Devvit SDK). Shared by the client build configs. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8')) as {
  version: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
};
const devvit = (pkg.dependencies?.['@devvit/web'] ?? pkg.devDependencies?.devvit ?? '').replace(/^[^\d]*/, '');

export const buildInfo = {
  __APP_VERSION__: JSON.stringify(pkg.version),
  __BUILT_AT__: JSON.stringify(new Date().toISOString()),
  __DEVVIT_VERSION__: JSON.stringify(devvit),
};
