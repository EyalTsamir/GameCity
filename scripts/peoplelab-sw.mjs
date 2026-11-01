#!/usr/bin/env node
// Quick look at the figures on software GL, with no shared browser lock (see scripts/lab/people.ts): a sheet of faces in seconds.
//   node scripts/peoplelab-sw.mjs --url http://127.0.0.1:5214/ --out shots/lab/x.png --q "n=24&d=1&hour=12"
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const base = (args.url ?? 'http://127.0.0.1:5214/').replace(/\/?$/, '/');
const out = args.out ?? 'shots/lab/sw.png';
fs.mkdirSync(path.dirname(out), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const q = new URLSearchParams(args.q ?? '');
  const n = +(q.get('n') ?? 24),
    cols = +(q.get('cols') ?? 6),
    cell = +(q.get('cell') ?? 320);
  const page = await browser.newPage({ viewport: { width: cols * cell, height: Math.ceil(n / cols) * cell } });
  const errs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text());
  });
  page.on('pageerror', (e) => errs.push(String(e?.stack ?? e)));
  const t0 = Date.now();
  await page.goto(`${base}scripts/lab/people.html?${args.q ?? ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  // (an error in the page never sets __done: stop as soon as one shows, not at the timeout)
  for (let i = 0; i < 300 && !errs.some((e) => /Error|error:/.test(e)); i++) {
    if (await page.evaluate(() => window.__done === true)) break;
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: out, type: out.endsWith('.jpg') ? 'jpeg' : 'png', timeout: 120000 });
  const labels = await page.evaluate(() => window.__labels ?? []);
  console.log(out, (Date.now() - t0) / 1000 + 's', labels.join(' | '));
  const seen = errs.filter((e) => !/GPU stall|swiftshader|software/i.test(e));
  if (seen.length) console.log('ERR', seen.slice(0, 5).join('\n'));
} finally {
  await browser.close();
}
