import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { execSync } from 'node:child_process';

// Shown under the title, so a published copy can be told apart from the last one: build date and time, commit.
function buildId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  let commit = '';
  try {
    commit = ' · ' + execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    // not a git checkout: the date alone
  }
  return `${d.getDate()}.${d.getMonth() + 1} ${pad(d.getHours())}:${pad(d.getMinutes())}${commit}`;
}

// Dev: normal Vite dev server with HMR.
// Build: everything (JS + CSS) is inlined into dist/index.html, so the finished city still opens straight from
// disk (file://) with no server and no CDN. The baked files (public/bake, scripts/bake.mjs) land next to it in dist/bake:
// over http they make it cheaper, without them (file://, not baked) it computes the same picture in the browser.
export default defineConfig(({ command }) => ({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(command === 'build' ? buildId() : 'dev') },
  plugins: command === 'build' ? [viteSingleFile({ removeViteModuleLoader: true })] : [],
  build: {
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 10_000,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
  server: { host: '127.0.0.1' },
}));
