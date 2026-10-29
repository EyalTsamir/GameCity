import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
await acquireLock();
const { browser } = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
await page.routeWebSocket(/.*/, () => {});
await page.goto('http://127.0.0.1:5173/?nointro&noidle', { timeout: 300000 });
await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 300000 });
await page.evaluate(() => {
  window.__city.setHours(11); window.__city.view({ target: { x: -216.8, y: 0.6, z: 1.4 }, distance: 5, yaw: 90, pitch: 8 });
  const g = window.__city.ctx.scene.getObjectByName('land-farmlife');
  const herd = g.getObjectByName('land-herds');
  window.__hlog = [];
  const orig = herd.onBeforeRender;
  herd.onBeforeRender = function (r, s, cam, ...rest) { if (window.__hlog.length < 40) window.__hlog.push([cam.type, cam.name, +cam.position.x.toFixed(1), +cam.position.y.toFixed(1), +cam.position.z.toFixed(1), r.getRenderTarget()?.width ?? 'screen', window.__city.frames()]); return orig.call(this, r, s, cam, ...rest); };
});
for (let i = 0; i < 8; i++) { await page.screenshot({ path: `/tmp/claude-0/-home-user-GameCity/84ce0e16-d912-5b31-a3c0-249b824f7685/scratchpad/hp${i}.png`, timeout: 240000 }); await page.waitForTimeout(500); }
const r = await page.evaluate(() => {
  const g = window.__city.ctx.scene.getObjectByName('land-farmlife');
  const near = ['land-sheep-near', 'land-cows-near'].map((n) => { const m = g.getObjectByName(n); return [m.visible, Array.from(m.geometry.getAttribute('iA').array.slice(0, 8)).map((v) => +v.toFixed(1)).join(',')]; });
  return { frames: window.__city.frames(), log: window.__hlog, near };
});
console.log(JSON.stringify(r));
await browser.close(); releaseLock();
