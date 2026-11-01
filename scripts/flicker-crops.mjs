#!/usr/bin/env node
// Is the steady picture as sharp as the trembling one? The same views with and without a switch, settled, with 1:1 crops side by
// side (docs/progress/sweep-flicker.md). Always Read the PNG.
//
//   node scripts/flicker-crops.mjs --url http://127.0.0.1:5234/ --b notaa --out shots/flick/crops --hours 12
//   ... --views "downtown;street=5,1.5,-65,9,0,6" --q "..."  --settle 3000  --crop 480x340

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { launchBrowser, acquireLock, releaseLock } = await import(process.env.TH_HARNESS ? pathToFileURL(process.env.TH_HARNESS).href : './browser.mjs');
const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const views = (args.views ?? 'downtown;overview;street=5,1.5,-65,9,0,6;market=27.5,1,78.5,16,200,28').split(';').map((s) => {
  const k = s.indexOf('=');
  return k < 0 ? { name: s, poi: s } : { name: s.slice(0, k), spec: s.slice(k + 1).split(',').map(Number) };
});
const hours = (args.hours ?? '12').split(',').map(Number);
const settle = parseInt(args.settle ?? '3000', 10);
const [cw, ch] = (args.crop ?? '480x340').split('x').map(Number);
const outDir = path.resolve(args.out ?? 'shots/flick/crops');
fs.mkdirSync(outDir, { recursive: true });
const base = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const urlFor = (x) => `${base}?${['nointro', 'noidle', 'nofilm', 'adaptive=0', args.q, x].filter(Boolean).join('&')}`;

await acquireLock();
const { browser } = await launchBrowser();
try {
  const shots = {};
  for (const tag of ['a', 'b']) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1025 }, deviceScaleFactor: 1 });
    await page.routeWebSocket(/.*/, () => {});
    await page.goto(urlFor(tag === 'b' ? args.b : ''), { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
    await page.addStyleTag({ content: '#ui{display:none!important}' });
    for (const h of hours)
      for (const v of views) {
        await page.evaluate(([vv, hh]) => {
          window.__city.setSpeed(0);
          window.__city.setHours(hh);
          window.__city.view(vv.poi ?? { target: { x: vv.spec[0], y: vv.spec[1], z: vv.spec[2] }, distance: vv.spec[3], yaw: vv.spec[4], pitch: vv.spec[5] });
        }, [v, h]);
        await page.waitForTimeout(settle);
        const buf = await page.screenshot({ type: 'png', timeout: 240000 });
        shots[`${tag}_${v.name}_${h}`] = buf.toString('base64');
      }
    await page.close();
  }
  const sheet = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  for (const h of hours)
    for (const v of views) {
      // three crops of each view, A on the left and B on the right
      const b64 = await sheet.evaluate(
        async ([a, b, cw, ch]) => {
          const load = (s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s; });
          const [ia, ib] = await Promise.all([load(a), load(b)]);
          const spots = [[0.25, 0.3], [0.55, 0.55], [0.75, 0.75]];
          const c = document.createElement('canvas');
          c.width = cw * 2 + 6;
          c.height = (ch + 6) * spots.length;
          const g = c.getContext('2d');
          g.fillStyle = '#fff';
          g.fillRect(0, 0, c.width, c.height);
          spots.forEach(([sx, sy], k) => {
            const x = Math.round(sx * (ia.width - cw)),
              y = Math.round(sy * (ia.height - ch));
            g.drawImage(ia, x, y, cw, ch, 0, k * (ch + 6), cw, ch);
            g.drawImage(ib, x, y, cw, ch, cw + 6, k * (ch + 6), cw, ch);
          });
          return c.toDataURL('image/png').split(',')[1];
        },
        [shots[`a_${v.name}_${h}`], shots[`b_${v.name}_${h}`], cw, ch],
      );
      const file = path.join(outDir, `${v.name}_${String(h).replace('.', 'h')}.png`);
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      console.log(file);
    }
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
