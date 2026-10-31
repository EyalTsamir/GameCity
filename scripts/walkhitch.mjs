#!/usr/bin/env node
// Stutter while walking: real keys (V, then W with Shift held) along a pavement, every frame interval, the shaders and
// geometries created on the way, and what the near-detail bubble built. Near detail appearing must not show here.
//
//   node scripts/walkhitch.mjs --url http://127.0.0.1:5211/ [--q "nonear"] [--seconds 25] [--at "-100,0.15,50.4,-90"] [--hours 12] [--jog 1]
//
// --at x,y,z,yaw: where to start, yaw the side the camera comes from (it walks away from there). 1920×1025, adaptive off.

import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import { installRecorder, recMark, readFrames, frameStats } from './framerec.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const base = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const seconds = parseFloat(args.seconds ?? '25');
const [x, y, z, yaw] = (args.at ?? '-100,0.15,50.4,-90').split(',').map(Number);
const hours = parseFloat(args.hours ?? '12');
const out = { url: null };

await acquireLock();
const { browser } = await launchBrowser({ extraArgs: ['--enable-precise-memory-info'] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1025 }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await installRecorder(page);
  out.url = `${base}?${['nointro', 'noidle', 'nofilm', 'adaptive=0', args.q].filter(Boolean).join('&')}`;
  await page.goto(out.url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
  await page.waitForTimeout(4000);
  await page.evaluate(([xx, yy, zz, yw, h]) => {
    window.__city.setHours(h);
    window.__city.view({ target: { x: xx, y: yy, z: zz }, distance: 6, yaw: yw, pitch: 12 });
  }, [x, y, z, yaw, hours]);
  await page.waitForTimeout(2500);
  await page.mouse.move(960, 512);
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(2500);
  const start = await page.evaluate(() => {
    const c = window.__city.ctx.camera.position;
    return [c.x, c.z];
  });
  if (args.jog !== '0') await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  const m = await recMark(page);
  const before = await readFrames(page, m);
  await page.waitForTimeout(seconds * 1000);
  const fr = await readFrames(page, m);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  const end = await page.evaluate(() => {
    const c = window.__city.ctx.camera.position;
    return { at: [c.x, c.z], near: window.__city.near.stats(), frameErrors: window.__city.frameErrors };
  });
  const st = frameStats(fr);
  Object.assign(out, { walked: Math.round(Math.hypot(end.at[0] - start[0], end.at[1] - start[1])), from: start.map(Math.round), to: end.at.map(Math.round) });
  Object.assign(out, { meanMs: st.meanMs, p99: st.p99, max: st.max, jank25: st.jank25, hitch50: st.hitch50, freeze100: st.freeze100, longTasks: st.longTasks, longTaskMax: st.longTaskMax, allocMBs: st.allocMBs });
  out.newPrograms = fr.progKeys.filter((k) => !before.progKeys.includes(k));
  out.newGeometries = fr.geometries - before.geometries;
  out.near = end.near;
  out.frameErrors = end.frameErrors;
  out.errors = errors;
} catch (e) {
  out.harnessError = String(e?.stack ?? e);
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
console.log(JSON.stringify(out, null, 1));
