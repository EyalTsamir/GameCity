#!/usr/bin/env node
// Marginal GPU cost by hiding: for every view, measure the frame's GPU passes (shadow / scene / refl / post) with
// everything drawn, then with each target hidden (object.visible = false) — the drop is what the target really costs
// (binning, early-z / LRZ interactions and its shadow casting included), without reloading the page.
//
//   node scripts/hideprof.mjs --views "overview;street=5,1.5,-65,9,0,6" --hours 12 [--targets "landmarks;pedestrians;..."]
//   targets: object names or name prefixes (matched against each object's name path "group/child"); default = the
//   top-level scene children (≈ modules) plus every renderable that drawprof would rank (--top n, default 24);
//   "js:<label>=<apply code>|<restore code>" runs code instead of hiding (runtime A/B of a uniform / setting), e.g.
//   "js:winrefl=__city.ctx.services.buildings.uniforms.uWinRefl.value=0|__city.ctx.services.buildings.uniforms.uWinRefl.value=1"
//
// Uses timer queries (framerec.installGpuProfiler) with ?adaptive=0; ms are averaged over --seconds per sample and
// the baseline is re-measured between targets (drift / GPU clocks), the drop is against the mean of the two.

import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import { installGpuProfiler, resetGpu, readGpu } from './framerec.mjs';
import fs from 'node:fs';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const baseUrl = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const width = parseInt(args.width ?? '1920', 10);
const height = parseInt(args.height ?? '1025', 10);
const seconds = parseFloat(args.seconds ?? '1.5');
const hours = (args.hours ?? '12').split(',').map(Number);
const views = (args.views ?? 'overview')
  .split(';')
  .filter(Boolean)
  .map((s) => (s.includes('=') ? { name: s.slice(0, s.indexOf('=')), spec: s.slice(s.indexOf('=') + 1) } : { name: s, spec: s }));
const q = [args.q, 'adaptive=0', 'nointro', 'noidle'].filter(Boolean).join('&');
const userTargets = args.targets ? args.targets.split(';').filter(Boolean) : null;

await acquireLock();
const out = { url: `${baseUrl}?${q}`, results: [] };
const { browser } = await launchBrowser({ extraArgs: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  await page.goto(out.url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 3, null, { timeout: 300000 });
  await installGpuProfiler(page);
  await page.evaluate(() => {
    const scene = window.__city.ctx.scene;
    const pathOf = (o) => {
      const parts = [];
      for (let p = o; p && p !== scene; p = p.parent) parts.unshift(p.name || `#${p.id}`);
      return parts.join('/');
    };
    // objects matching a target (exact path, path prefix, or name); hide() keeps the previous visibility to restore
    window.__hp = {
      list(prefix) {
        const hits = [];
        scene.traverse((o) => {
          if (o === scene) return;
          const p = pathOf(o);
          if (p === prefix || p.startsWith(prefix + '/') || o.name === prefix) hits.push(o);
        });
        // only the outermost matches (hiding a parent hides its children)
        return hits.filter((o) => !hits.includes(o.parent));
      },
      hide(prefix) {
        const objs = this.list(prefix);
        this.saved = objs.map((o) => [o, o.visible]);
        // modules re-set .visible every frame for some objects: pin it with a getter while hidden
        for (const o of objs) Object.defineProperty(o, 'visible', { configurable: true, get: () => false, set: () => {} });
        return objs.length;
      },
      restore() {
        for (const [o, v] of this.saved ?? []) {
          delete o.visible;
          o.visible = v;
        }
        this.saved = [];
      },
      defaults(top) {
        const mods = scene.children.filter((o) => o.isObject3D).map((o) => pathOf(o));
        const rend = [];
        scene.traverse((o) => {
          if ((o.isMesh || o.isPoints || o.isLine) && o.visible) {
            const g = o.geometry;
            const t = g ? (g.index ? g.index.count : g.attributes.position?.count ?? 0) * (o.isInstancedMesh ? o.count : g.isInstancedBufferGeometry ? Math.min(g.instanceCount, 1e6) : 1) : 0;
            rend.push([pathOf(o), t]);
          }
        });
        rend.sort((a, b) => b[1] - a[1]);
        return { mods, rend: rend.slice(0, top).map((r) => r[0]) };
      },
    };
  });
  const sample = async () => {
    await page.waitForTimeout(400);
    await resetGpu(page);
    await page.waitForTimeout(seconds * 1000);
    return readGpu(page);
  };
  for (const h of hours)
    for (const v of views) {
      await page.evaluate(
        ([spec, hh]) => {
          window.__city.setHours(hh);
          if (/^[a-z]/i.test(spec)) window.__city.view(spec);
          else {
            const [x, y, z, distance, yaw, pitch] = spec.split(',').map(Number);
            window.__city.view({ target: { x, y, z }, distance, yaw, pitch });
          }
        },
        [v.spec, h],
      );
      await page.waitForTimeout(2500);
      let targets = userTargets;
      if (!targets) {
        const d = await page.evaluate((top) => window.__hp.defaults(top), parseInt(args.top ?? '24', 10));
        targets = [...d.mods, ...d.rend.filter((r) => !d.mods.includes(r))];
      }
      let base = await sample();
      const rows = [];
      for (const t of targets) {
        const js = t.startsWith('js:') ? /^js:([^=]+)=(.*)\|(.*)$/s.exec(t) : null;
        const n = js ? (await page.evaluate((c) => (0, eval)(c), js[2]), 1) : await page.evaluate((tt) => window.__hp.hide(tt), t);
        if (!n) continue;
        const hid = await sample();
        if (js) await page.evaluate((c) => (0, eval)(c), js[3]);
        else await page.evaluate(() => window.__hp.restore());
        const base2 = await sample();
        const ref = (k) => ((base[k] ?? 0) + (base2[k] ?? 0)) / 2;
        const d = (k) => Math.round((ref(k) - (hid[k] ?? 0)) * 100) / 100;
        rows.push({ target: js ? `js:${js[1]}` : t, n, dTotal: d('total'), dScene: d('scene'), dShadow: d('shadow'), dRefl: d('refl'), dPost: d('post'), base: Math.round(ref('total') * 100) / 100 });
        base = base2;
      }
      rows.sort((a, b) => b.dTotal - a.dTotal);
      out.results.push({ view: v.name, hours: h, rows });
      console.log(`\n== ${v.name} @ ${h}h  (baseline GPU ${rows[0]?.base ?? '?'} ms)`);
      for (const r of rows) console.log(`${String(r.dTotal).padStart(7)} ms  (scene ${String(r.dScene).padStart(6)}, shadow ${String(r.dShadow).padStart(5)}, refl ${String(r.dRefl).padStart(5)}, post ${String(r.dPost).padStart(5)})  ${r.target}${r.n > 1 ? ` [${r.n}]` : ''}`);
    }
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 1));
