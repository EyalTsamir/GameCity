#!/usr/bin/env node
// Meshes on show with triangles and material type, biggest first: node meshlist.mjs <url> [view] [hour]
import { launchBrowser, acquireLock, releaseLock } from 'file:///C:/Projects/GameCity/scripts/browser.mjs';
const url = (process.argv[2] ?? 'http://127.0.0.1:5223/') + '?nofilm&nointro&noidle&adaptive=0';
const view = (process.argv[3] ?? '5,1.5,-65,9,0,6').split(',').map(Number);
const hour = Number(process.argv[4] ?? 12);
await acquireLock();
let browser;
try {
  ({ browser } = await launchBrowser({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.routeWebSocket(/.*/, () => {});
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
  const res = await page.evaluate(async ([v, h]) => {
    const c = window.__city;
    c.setHours(h);
    c.view({ target: { x: v[0], y: v[1], z: v[2] }, distance: v[3], yaw: v[4], pitch: v[5] });
    await new Promise((d) => setTimeout(d, 1500));
    const out = [];
    c.ctx.scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      let vis = true;
      for (let p = o; p; p = p.parent) if (!p.visible) vis = false;
      if (!vis) return;
      const g = o.geometry;
      const n = g.drawRange.count !== Infinity ? g.drawRange.count : g.index ? g.index.count : g.attributes.position?.count ?? 0;
      const inst = o.isInstancedMesh ? o.count : g.isInstancedBufferGeometry ? g.instanceCount : 1;
      out.push([o.name || '?', Math.round((n / 3) * Math.max(1, Math.min(inst, 1e6))), inst, o.material?.type ?? '?']);
    });
    out.sort((a, b) => b[1] - a[1]);
    return { stats: c.stats().water ?? null, out };
  }, [view, hour]);
  console.log(JSON.stringify(res.stats));
  for (const r of res.out) console.log(r.join('  '));
} finally {
  await browser?.close();
  releaseLock();
}
