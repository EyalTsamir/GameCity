// node scripts/.probe-multi.mjs outDir hours "name=x,y,z,d,yaw,pitch;..."  -> name_f0.png (first frame) + name_f5.png (6th screenshot)
import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import fs from 'node:fs';
const [out, hours, spec] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
await acquireLock();
const { browser } = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.routeWebSocket(/.*/, () => {});
await page.goto('http://127.0.0.1:5173/?nointro&noidle', { timeout: 300000 });
await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 300000 });
for (const v of spec.split(';')) {
  const [name, s] = v.split('=');
  const [x, y, z, distance, yaw, pitch] = s.split(',').map(Number);
  await page.evaluate(([h, view]) => { window.__city.setHours(h); window.__city.view(view); }, [parseFloat(hours), { target: { x, y, z }, distance, yaw, pitch }]);
  for (let i = 0; i < 6; i++) await page.screenshot({ path: `${out}/${name}_f${i}.png`, timeout: 240000 });
  for (let i = 1; i < 5; i++) fs.unlinkSync(`${out}/${name}_f${i}.png`);
  console.log(name, await page.evaluate(() => window.__city.frames()));
}
await browser.close(); releaseLock();
