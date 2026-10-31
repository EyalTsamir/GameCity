#!/usr/bin/env node
// What is in the glass mirror? The reflected scene alone (?bdbg=refl) with the pass restricted by name, one shot per filter.
// node reflprobe.mjs <url> <outdir> "x,y,z,dist,yaw,pitch" hour filter1 filter2 ...   ('all' = no filter)
import { launchBrowser, acquireLock, releaseLock } from 'file:///C:/Projects/GameCity/scripts/browser.mjs';
import fs from 'node:fs';
const [, , base, out, viewS, hourS, ...filters] = process.argv;
const url = base + '?nofilm&nointro&noidle&adaptive=0&bdbg=refl';
const v = viewS.split(',').map(Number);
fs.mkdirSync(out, { recursive: true });
await acquireLock();
let browser;
try {
  ({ browser } = await launchBrowser({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 560, height: 300 } });
  await page.routeWebSocket(/.*/, () => {});
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
  await page.addStyleTag({ content: '#ui{display:none!important}' });
  await page.evaluate(([v, h]) => {
    __city.setHours(h);
    __city.setSpeed(0);
    __city.view({ target: { x: v[0], y: v[1], z: v[2] }, distance: v[3], yaw: v[4], pitch: v[5] });
  }, [v, Number(hourS)]);
  for (const f of filters) {
    await page.evaluate((f) => __city.ctx.services.water._debugReflectFilter(f === 'all' ? null : f), f);
    await page.waitForTimeout(800);
    for (let i = 0; i < 3; i++) await page.screenshot({ type: 'jpeg', quality: 1 }).catch(() => {});
    await page.screenshot({ path: `${out}/${f.replace(/[^a-z0-9]/gi, '_')}.png` });
  }
  console.log(JSON.stringify(await page.evaluate(() => { const s = __city.stats().water; return { calls: s?.reflCalls, tris: s?.reflTris, res: s?.reflRes }; })));
} finally {
  await browser?.close();
  releaseLock();
}
