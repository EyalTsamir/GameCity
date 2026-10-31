import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Dev: normal Vite dev server with HMR.
// Build: everything (JS + CSS) is inlined into dist/index.html, so the finished city still opens straight from
// disk (file://) with no server and no CDN. The baked files (public/bake, scripts/bake.mjs) land next to it in dist/bake:
// over http they make it cheaper, without them (file://, not baked) it computes the same picture in the browser.
export default defineConfig(({ command }) => ({
  base: './',
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
