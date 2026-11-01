// W8 debug probe: load the city once, run page-side JS snippets (each may be async), print their JSON results.
//   node scripts/agent-tools/w8probe.mjs "<js expr returning a promise or value>" ...
import { launchBrowser, acquireLock, releaseLock } from '../browser.mjs';
const url = process.env.URL ?? 'http://127.0.0.1:5173/?nointro&noidle';
await acquireLock();
const { browser } = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.routeWebSocket(/.*/, () => {});
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 400)));
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 400)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
  for (const code of process.argv.slice(2)) {
    const r = await page.evaluate(async (c) => { try { return JSON.stringify(await (0, eval)(c)); } catch (e) { return 'ERR ' + e; } }, code);
    console.log(r);
  }
  console.log('errors:', JSON.stringify(errs));
} finally {
  await browser.close();
  releaseLock();
}
