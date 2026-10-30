#!/usr/bin/env node
// Runtime A/B in ONE page load: alternates windows of the base state and of each variant, uncapped ms/frame (vsync and
// frame cap off, adaptive off). Alternating windows cancel GPU clock drift and outside load far better than page reloads.
//
//   node scripts/abprof.mjs --url http://127.0.0.1:5192/ --views "overview;street=5,1.5,-65,9,0,6" --hours 12 --cycles 4 --seconds 2 \
//     --ab "noao=__city.ctx.services.postfx.setEnabled('ao',false)|__city.ctx.services.postfx.setEnabled('ao',true)"
//
// --ab is a ";;"-separated list of label=apply|restore page code; --init page code run once after boot (helpers), --preinit page code run before the page's scripts.
import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import fs from 'node:fs';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const baseUrl = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const seconds = parseFloat(args.seconds ?? '2');
const cycles = parseInt(args.cycles ?? '4', 10);
const hours = (args.hours ?? '12').split(',').map(Number);
const views = (args.views ?? 'overview')
  .split(';')
  .filter(Boolean)
  .map((s) => (s.includes('=') ? { name: s.slice(0, s.indexOf('=')), spec: s.slice(s.indexOf('=') + 1) } : { name: s, spec: s }));
const ab = (args.ab ?? '')
  .split(';;')
  .filter(Boolean)
  .map((s) => {
    const m = /^([^=]+)=(.*)\|(.*)$/s.exec(s);
    return { label: m[1], apply: m[2], restore: m[3] };
  });
const q = [args.q, 'adaptive=0', 'nointro', 'noidle'].filter(Boolean).join('&');

await acquireLock();
const out = [];
const { browser } = await launchBrowser({ extraArgs: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1025 }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  if (args.preinit) await page.addInitScript(args.preinit);
  await page.goto(`${baseUrl}?${q}`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 3, null, { timeout: 600000 });
  if (args.init) await page.evaluate((c) => (0, eval)(c), args.init);
  const win = () =>
    page.evaluate(async (sec) => {
      await new Promise((r) => setTimeout(r, 500));
      const f0 = window.__city.frames(),
        t0 = performance.now();
      await new Promise((r) => setTimeout(r, sec * 1000));
      return (performance.now() - t0) / Math.max(1, window.__city.frames() - f0);
    }, seconds);
  for (const h of hours)
    for (const v of views) {
      await page.evaluate(
        ([s, hh]) => {
          window.__city.setHours(hh);
          if (/^[a-z]/i.test(s)) window.__city.view(s);
          else {
            const [x, y, z, distance, yaw, pitch] = s.split(',').map(Number);
            window.__city.view({ target: { x, y, z }, distance, yaw, pitch });
          }
        },
        [v.spec, h],
      );
      await page.waitForTimeout(2500);
      const rows = [];
      for (const t of ab) {
        const b = [],
          w = [];
        for (let c = 0; c < cycles; c++) {
          b.push(await win());
          await page.evaluate((code) => (0, eval)(code), t.apply);
          w.push(await win());
          await page.evaluate((code) => (0, eval)(code), t.restore);
        }
        b.push(await win());
        const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
        const diffs = w.map((x, i) => x - (b[i] + b[i + 1]) / 2);
        const sd = Math.sqrt(mean(diffs.map((d) => (d - mean(diffs)) ** 2)));
        rows.push({ variant: t.label, base: +mean(b).toFixed(2), with: +mean(w).toFixed(2), delta: +mean(diffs).toFixed(2), sd: +sd.toFixed(2) });
      }
      console.log(`== ${v.name} @ ${h}h`);
      for (const r of rows) console.log(`${r.variant.padEnd(22)} base ${r.base}  with ${r.with}  delta ${r.delta} ±${r.sd}`);
      out.push({ view: v.name, hours: h, rows });
    }
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 1));
