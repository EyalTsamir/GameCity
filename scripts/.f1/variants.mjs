// scratch probe (F1): one page load, several runtime variants of one view. Not committed.
// node scripts/.f1/variants.mjs <q> <outdir> <viewJS> <variantsJSON:[{name, js}]>
import { launchBrowser, acquireLock, releaseLock } from '../browser.mjs';
import fs from 'node:fs';
const [q, out, viewJs, varJson] = process.argv.slice(2);
const variants = JSON.parse(fs.readFileSync(varJson, 'utf8'));
fs.mkdirSync(out, { recursive: true });
await acquireLock();
const { browser } = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  await page.goto('http://127.0.0.1:5173/?nointro&noidle&' + q, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 600000, polling: 250 });
  const vr = await page.evaluate((c) => (0, eval)(c), viewJs);
  console.log('view', JSON.stringify(vr));
  for (const v of variants) {
    const r = await page.evaluate((c) => { try { return (0, eval)(c) ?? null; } catch (e) { return String(e); } }, v.js || 'null');
    for (let i = 0; i < 4; i++) await page.screenshot({ type: 'jpeg', quality: 1 }).catch(() => {});
    await page.screenshot({ path: `${out}/${v.name}.png`, timeout: 240000 });
    console.log(v.name, JSON.stringify(r));
  }
  console.log('errors', errs.length, errs.slice(0, 3));
} finally {
  await browser.close();
  releaseLock();
}
