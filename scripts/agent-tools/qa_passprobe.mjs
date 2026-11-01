// Lead QA probe: per-render-call cost split (reflection pass vs everything else), JS-only and with
// gl.finish() (includes SwiftShader raster). node scripts/agent-tools/qa_passprobe.mjs [view] [hours]
import { launchBrowser, acquireLock, releaseLock } from '../browser.mjs';
const [view = 'harbor', hours = '21.5'] = process.argv.slice(2);
await acquireLock();
const { browser } = await launchBrowser({ extraArgs: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto('http://127.0.0.1:5173/?nointro&noidle&adaptive=0&quality=high', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city?.ctx?.services?.camera, null, { timeout: 300000 });
  await page.evaluate(([v, h]) => { window.__city.setHours(+h); window.__city.setSpeed(0); window.__city.view(v); }, [view, hours]);
  await page.waitForTimeout(8000);
  const res = await page.evaluate(async () => {
    const r = window.__city.ctx.renderer, gl = r.getContext();
    const orig = r.render.bind(r);
    const acc = {};
    let depth = 0, sync = false;
    r.render = (scene, cam) => {
      const tgt = r.getRenderTarget();
      const key = (depth > 0 ? 'nested:' : 'top:') + (tgt ? `${tgt.width}x${tgt.height}` : 'canvas') + (scene.isScene && scene === window.__city.ctx.scene ? ':scene' : ':other');
      if (sync) gl.finish();
      const t0 = performance.now();
      depth++;
      try { orig(scene, cam); } finally { depth--; }
      if (sync) gl.finish();
      const dt = performance.now() - t0;
      (acc[key] ??= { n: 0, ms: 0 }); acc[key].n++; acc[key].ms += dt;
    };
    const run = async (s, frames) => { sync = s; for (const k in acc) delete acc[k]; const t0 = performance.now(); for (let i = 0; i < frames; i++) await new Promise((res) => requestAnimationFrame(res)); const total = performance.now() - t0; const o = { totalPerFrame: +(total / frames).toFixed(1) }; for (const k in acc) o[k] = { n: acc[k].n / frames, msPerFrame: +(acc[k].ms / frames).toFixed(1) }; return o; };
    const jsOnly = await run(false, 8);
    const withFinish = await run(true, 6);
    r.render = orig;
    return { jsOnly, withFinish };
  });
  console.log(JSON.stringify(res, null, 1));
} finally { await browser.close(); releaseLock(); }
