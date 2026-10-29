#!/usr/bin/env node
// Capture a matrix of views x times of day in ONE browser session (fast review sets).
//
//   node scripts/capture-set.mjs [--out shots/review] [--q "extra=query"] [--views a,b,c] [--hours 11,18,21.5]
//                                [--width 1600 --height 900] [--settle 2500] [--warmup 6000] [--hideui 1]
//
// Views: POI ids from plan.pois, or "name=x,y,z,distance,yaw,pitch" entries separated by ';'.
// Writes <out>/<view>_<hours>.png and <out>/report.json (stats per capture + console errors).

import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Headless Chromium only renders while a screenshot is taken (frames() stays constant through waitForTimeout), so a
// capture right after a camera jump is the FIRST frame — anything selected a frame late (near herds, near cells, LOD)
// looks wrong. Pump a few throw-away frames before every real capture.
async function pumpFrames(page, n = 4) {
  for (let i = 0; i < n; i++) await page.screenshot({ type: 'jpeg', quality: 1 }).catch(() => {});
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i];
}
const outDir = path.resolve(root, args.out ?? 'shots/review');
fs.mkdirSync(outDir, { recursive: true });
const width = parseInt(args.width ?? '1600', 10);
const height = parseInt(args.height ?? '900', 10);
const settle = parseInt(args.settle ?? '2500', 10);
const warmup = parseInt(args.warmup ?? '6000', 10);
let url = args.url ?? 'http://127.0.0.1:5173/';
if (args.q) url += (url.includes('?') ? '&' : '?') + args.q;
const hoursList = (args.hours ?? '11,18.2,21.5').split(',').map(Number);
const viewSpecs = (args.views ?? 'overview,downtown,oldtown,harbor,beach,park,station,riverside,stadium,westbrook,industry')
  .split(/;|,(?=[a-z])/i)
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const eq = s.indexOf('=');
    if (eq < 0) return { name: s, spec: s };
    return { name: s.slice(0, eq), spec: s.slice(eq + 1) };
  });

const report = { url, consoleErrors: [], consoleWarnings: [], pageErrors: [], captures: [] };
await acquireLock();
const { browser, software } = await launchBrowser();
report.softwareGL = software;
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  // Freeze the page against other agents' file edits: swallow Vite's HMR websocket so no mid-run reloads happen.
  await page.routeWebSocket(/.*/, () => {});
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(m.text());
    else if (m.type() === 'warning') report.consoleWarnings.push(m.text());
  });
  page.on('pageerror', (e) => report.pageErrors.push(String(e?.stack ?? e)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
  report.failedModules = await page.evaluate(() => window.__city.failed);
  if (args.hideui !== undefined) await page.addStyleTag({ content: '#ui{display:none!important}' });
  await page.waitForTimeout(warmup);
  for (const h of hoursList) {
    for (const v of viewSpecs) {
      await page.evaluate(
        ([spec, hours]) => {
          window.__city.setHours(hours);
          if (/^[a-z]/i.test(spec)) window.__city.view(spec);
          else {
            const [x, y, z, distance, yaw, pitch] = spec.split(',').map(Number);
            window.__city.view({ target: { x, y, z }, distance, yaw, pitch });
          }
        },
        [v.spec, h],
      );
      await page.waitForTimeout(settle);
      await pumpFrames(page);
      const file = path.join(outDir, `${v.name}_${String(h).replace('.', 'h')}.png`);
      await page.screenshot({ path: file, timeout: 240000 });
      const stats = await page.evaluate(() => window.__city.stats());
      report.captures.push({ view: v.name, hours: h, file: path.relative(root, file), fps: stats.fps, drawCalls: stats.drawCalls, triangles: stats.triangles });
    }
  }
  report.invariants = await page.evaluate(() => window.__city.invariants());
  report.frameErrors = await page.evaluate(() => window.__city.frameErrors);
  report.finalStats = await page.evaluate(() => window.__city.stats());
} catch (e) {
  report.harnessError = String(e?.stack ?? e);
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, captures: report.captures.map((c) => `${c.view}@${c.hours}: ${c.fps}fps ${c.drawCalls}dc ${Math.round(c.triangles / 1000)}k`) }, null, 2));
