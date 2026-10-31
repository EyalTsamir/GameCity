#!/usr/bin/env node
// Which lit meshes on show have no lamp light in their fragment shader (black at night)? node unlitprobe.mjs <url> [view]
import { launchBrowser, acquireLock, releaseLock } from 'file:///C:/Projects/GameCity/scripts/browser.mjs';
const url = (process.argv[2] ?? 'http://127.0.0.1:5213/') + '?nofilm&nointro&noidle&adaptive=0';
const view = (process.argv[3] ?? '5,1.5,-65,9,0,6').split(',').map(Number);
await acquireLock();
let browser;
try {
  ({ browser } = await launchBrowser({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.routeWebSocket(/.*/, () => {});
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
  const res = await page.evaluate(async (v) => {
    const c = window.__city;
    c.setHours(21.5);
    c.view({ x: v[0], y: v[1], z: v[2], distance: v[3], yaw: v[4], pitch: v[5] });
    await new Promise((d) => setTimeout(d, 2000));
    const { renderer, scene } = c.ctx;
    const gl = renderer.getContext();
    const out = {};
    scene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      const mm = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mm) {
        if (!m || m.isMeshBasicMaterial || m.isLineBasicMaterial) continue;
        const prog = renderer.properties.get(m).currentProgram;
        if (!prog) continue;
        const src = gl.getShaderSource(prog.fragmentShader) || '';
        if (!/thLampLight/.test(src)) out[o.name || '(unnamed)'] = (m.type || '?') + (o.castShadow ? ' caster' : '') + (o.visible ? '' : ' hidden');
      }
    });
    return out;
  }, view);
  console.log(JSON.stringify(res, null, 1));
} finally {
  await browser?.close();
  releaseLock();
}
