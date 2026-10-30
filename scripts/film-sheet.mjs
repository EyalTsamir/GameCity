#!/usr/bin/env node
// Storyboard of the opening film (src/ui/camera/film.ts): one frame per stamp, composed into a contact sheet.
//
//   node scripts/film-sheet.mjs --url http://127.0.0.1:5173/ --out docs/progress/director/storyboard.png
//        --every 6 | --stamps 2,8,15   film seconds
//        --mode realtime (default: the film plays in real time, trains arrive on cue; a frame is grabbed at each stamp)
//        --mode seek     (fast path scouting: jump to each stamp; the clock follows, the simulations do not)
//        --width 1280 --height 684  --thumb 480  --cols 4  --dir <folder for the single frames>
//        --q "extra=query"
//
// Shares the screenshot lock with scripts/shot.mjs. Prints a JSON report (console errors, film check, stamps).

import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const baseUrl = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const width = parseInt(args.width ?? '1280', 10);
const height = parseInt(args.height ?? '684', 10);
const thumb = parseInt(args.thumb ?? '480', 10);
const cols = parseInt(args.cols ?? '4', 10);
const mode = args.mode ?? 'realtime';
const out = path.resolve(args.out ?? 'shots/film/storyboard.png');
const dir = args.dir ? path.resolve(args.dir) : path.join(path.dirname(out), path.basename(out, '.png'));
fs.mkdirSync(dir, { recursive: true });
const report = { mode, frames: [], consoleErrors: [], consoleWarnings: [], pageErrors: [] };

await acquireLock();
const { browser } = await launchBrowser({ headless: args.headed !== '1' });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300));
    if (m.type() === 'warning') report.consoleWarnings.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => report.pageErrors.push(String(e).slice(0, 300)));
  await page.goto(`${baseUrl}?film&noidle${args.q ? '&' + args.q : ''}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 1, null, { timeout: 300000, polling: 100 });
  const film = () => page.evaluate(() => {
    const f = window.__city.ctx.services.camera.film;
    return { t: f.time(), total: f.total(), shot: f.shot(), playing: f.playing(), active: f.active(), hours: window.__city.ctx.clock.label() };
  });
  report.check = await page.evaluate(() => window.__city.ctx.services.camera.film.check().slice(0, 40));
  let st = await film();
  const every = parseFloat(args.every ?? '6');
  const stamps = args.stamps ? args.stamps.split(',').map(Number) : Array.from({ length: Math.floor(st.total / every) }, (_, i) => (i + 0.5) * every);
  const shots = [];
  for (const s of stamps) {
    if (mode === 'seek') {
      await page.evaluate((t) => window.__city.ctx.services.camera.film.seek(t), s);
      for (let k = 0; k < 3; k++) await page.screenshot({ type: 'jpeg', quality: 1 }).catch(() => {});
      await page.evaluate((t) => window.__city.ctx.services.camera.film.seek(t), s);
    } else {
      await page.waitForFunction((t) => window.__city.ctx.services.camera.film.time() >= t || !window.__city.ctx.services.camera.film.active(), s, { timeout: 300000, polling: 30 });
    }
    st = await film();
    if (!st.active) break;
    const file = path.join(dir, `t${String(s.toFixed(1)).padStart(5, '0')}.png`);
    await page.screenshot({ path: file });
    shots.push({ file, label: `${s.toFixed(1)} s · ${st.shot} · ${st.hours}` });
    report.frames.push({ stamp: s, t: st.t, shot: st.shot, hours: st.hours });
    process.stderr.write(`${s.toFixed(1)} ${st.shot} ${st.hours}\n`);
  }
  report.frameErrors = await page.evaluate(() => window.__city.frameErrors);
  report.stats = await page.evaluate(() => {
    const s = window.__city.stats();
    return { programs: s.programs, postfx: s.postfx };
  });

  // the sheet, composed in a blank page
  const sheet = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const urls = shots.map((s) => ({ label: s.label, url: `data:image/png;base64,${fs.readFileSync(s.file).toString('base64')}` }));
  const b64 = await sheet.evaluate(
    async ({ urls, thumb, cols, aspect }) => {
      const th = Math.round(thumb / aspect);
      const rows = Math.ceil(urls.length / cols);
      const c = document.createElement('canvas');
      c.width = cols * thumb;
      c.height = rows * (th + 22);
      const g = c.getContext('2d');
      g.fillStyle = '#111';
      g.fillRect(0, 0, c.width, c.height);
      g.font = '13px sans-serif';
      for (let i = 0; i < urls.length; i++) {
        const img = new Image();
        img.src = urls[i].url;
        await img.decode();
        const x = (i % cols) * thumb,
          y = Math.floor(i / cols) * (th + 22);
        g.drawImage(img, x, y, thumb, th);
        g.fillStyle = '#eee';
        g.fillText(urls[i].label, x + 6, y + th + 16);
      }
      return c.toDataURL('image/png').split(',')[1];
    },
    { urls, thumb, cols, aspect: width / height },
  );
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  report.sheet = out;
} catch (e) {
  report.harnessError = String(e?.stack ?? e);
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
console.log(JSON.stringify(report, null, 1));
