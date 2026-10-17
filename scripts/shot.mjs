#!/usr/bin/env node
// Headless verification harness (real GPU via ANGLE/D3D11).
//
//   node scripts/shot.mjs [options]
//
// Options:
//   --url <url>          page to open (default http://127.0.0.1:5173/)
//   --q "<query>"        extra query string appended to the url, e.g. "only=roads,sky&time=21"
//   --out <file.png>     screenshot path (default shots/shot.png). With --shots N, _1.._N are appended.
//   --width/--height     viewport (default 1280x720)
//   --wait <ms>          wait after the city is ready before the first capture (default 2500)
//   --view <spec>        camera: poi id (e.g. "downtown") or "x,y,z,distance,yaw,pitch"
//   --hours <h>          set time of day after load
//   --speed <s>          sim speed after load
//   --eval "<js>"        extra JS evaluated in the page after load (can be repeated)
//   --shots <n>          number of captures (default 1)  --interval <ms> between captures (default 1000)
//   --stats              print window.__city.stats()      --invariants  print invariants()
//   --validate           print window.__city.validate()
//   --timeout <ms>       max wait for readiness (default 90000)
//
// Prints a JSON report to stdout: console errors/warnings, page errors, failed modules,
// stats, invariants. Only one browser runs at a time (lock dir scripts/.shotlock),
// so several agents can call this concurrently without exhausting memory/GPU.

import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function parseArgs(argv) {
  const o = { evals: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const flag = ['stats', 'invariants', 'validate', 'headed'].includes(key);
    const val = flag ? true : argv[++i];
    if (key === 'eval') o.evals.push(val);
    else o[key] = val;
  }
  return o;
}

const args = parseArgs(process.argv);
const width = parseInt(args.width ?? '1280', 10);
const height = parseInt(args.height ?? '720', 10);
const wait = parseInt(args.wait ?? '2500', 10);
const shots = parseInt(args.shots ?? '1', 10);
const interval = parseInt(args.interval ?? '1000', 10);
const timeout = parseInt(args.timeout ?? '90000', 10);
let url = args.url ?? 'http://127.0.0.1:5173/';
if (args.q) url += (url.includes('?') ? '&' : '?') + args.q;
const out = path.resolve(root, args.out ?? 'shots/shot.png');
fs.mkdirSync(path.dirname(out), { recursive: true });

// ── lock (one browser at a time across processes)
const lockDir = path.join(here, '.shotlock');
async function acquire() {
  const t0 = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      fs.writeFileSync(path.join(lockDir, 'pid'), String(process.pid));
      return;
    } catch {
      try {
        const st = fs.statSync(lockDir);
        if (Date.now() - st.mtimeMs > 150_000) {
          fs.rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {
        /* vanished */
      }
      if (Date.now() - t0 > 600_000) throw new Error('timed out waiting for screenshot lock');
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
    }
  }
}
function release() {
  try {
    fs.rmSync(lockDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
process.on('exit', release);
process.on('SIGINT', () => {
  release();
  process.exit(130);
});

const report = { url, consoleErrors: [], consoleWarnings: [], pageErrors: [], failedModules: [], frameErrors: [], screenshots: [] };

await acquire();
let browser;
try {
  browser = await chromium.launch({
    channel: 'chrome',
    headless: !args.headed,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  // Freeze the page against other agents' file edits: swallow Vite's HMR websocket so no mid-run reloads happen.
  await page.routeWebSocket(/.*/, () => {});
  page.on('console', (msg) => {
    const t = msg.type();
    const text = msg.text();
    if (t === 'error') report.consoleErrors.push(text);
    else if (t === 'warning') report.consoleWarnings.push(text);
  });
  page.on('pageerror', (err) => report.pageErrors.push(String(err?.stack ?? err)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout, polling: 250 });
  const pre = await page.evaluate(() => ({ failed: window.__city.failed, modules: window.__city.modules }));
  report.failedModules = pre.failed;
  report.modules = pre.modules;
  if (args.hours !== undefined) await page.evaluate((h) => window.__city.setHours(h), parseFloat(args.hours));
  if (args.speed !== undefined) await page.evaluate((s) => window.__city.setSpeed(s), parseFloat(args.speed));
  if (args.view) {
    const v = args.view;
    await page.evaluate((spec) => {
      if (/^[a-z]/i.test(spec)) return window.__city.view(spec);
      const [x, y, z, distance, yaw, pitch] = spec.split(',').map(Number);
      window.__city.view({ target: { x, y, z }, distance, yaw, pitch });
    }, v);
  }
  for (const code of args.evals) {
    const r = await page.evaluate((c) => {
      try {
        // eslint-disable-next-line no-eval
        const v = (0, eval)(c);
        return v === undefined ? null : JSON.parse(JSON.stringify(v));
      } catch (e) {
        return { evalError: String(e) };
      }
    }, code);
    (report.evals ??= []).push(r);
  }
  await page.waitForTimeout(wait);
  for (let i = 0; i < shots; i++) {
    const file = shots === 1 ? out : out.replace(/\.png$/i, `_${i + 1}.png`);
    await page.screenshot({ path: file, type: 'png' });
    report.screenshots.push(path.relative(root, file));
    if (i < shots - 1) await page.waitForTimeout(interval);
  }
  if (args.stats) report.stats = await page.evaluate(() => window.__city.stats());
  if (args.invariants) report.invariants = await page.evaluate(() => window.__city.invariants());
  if (args.validate) report.validate = await page.evaluate(() => window.__city.validate());
  report.frameErrors = await page.evaluate(() => window.__city.frameErrors);
} catch (err) {
  report.harnessError = String(err?.stack ?? err);
} finally {
  if (browser) await browser.close().catch(() => {});
  release();
}
console.log(JSON.stringify(report, null, 2));
