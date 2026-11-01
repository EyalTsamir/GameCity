#!/usr/bin/env node
// Small life in motion: a contact sheet of frames in real time, from a fixed camera or one walking up to something, so
// that a movement can be judged and not only a still. In one page load, several shots.
//
//   node scripts/lifeseq.mjs --url http://127.0.0.1:5220/ --out shots/life/x.png --at "x,y,z,dist,yaw,pitch" --frames 12 --every 300
//     --hours 12            the time of day
//     --q "nosmalllife"     extra URL parameters
//     --find birds[:kind]   frame the nearest group of birds to --at (kind 0 sparrow, 1 pigeon, 2 gull, 3 blackbird)
//     --find cat | dog | talk | litter | moment | feed | waiter    the nearest of those
//     --walk 1.3            the camera walks at this speed (m/s) towards what it looks at, as someone would
//     --shots 3             the sequence again at other places (--find only: the next nearest), one sheet per shot
//     --follow              the camera stays on what it found (--find only), --yaw d fixes its side (else random)
//     --pre "js"            run once after load, --eval "js" after each framing
//     --size 900x500 --cols 4 --dist 3 --pitch 8
//     --scripts <dir>       where browser.mjs lives (the main checkout's, for its shared browser lock)
// Writes <out> (or <out>_<n>.png) and prints a line per shot.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  if (!process.argv[i].startsWith('--')) continue;
  const k = process.argv[i].slice(2);
  // a flag has no value
  args[k] = k === 'follow' ? '1' : process.argv[++i];
}
const scripts = args.scripts ?? 'C:/Projects/GameCity/scripts';
const { launchBrowser, acquireLock, releaseLock } = await import(pathToFileURL(path.join(scripts, 'browser.mjs')).href);
const base = (args.url ?? 'http://127.0.0.1:5220/').replace(/\/?$/, '/');
const out = path.resolve(args.out ?? 'shots/life/seq.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
const [W, H] = (args.size ?? '900x500').split('x').map(Number);
const frames = +(args.frames ?? 12),
  every = +(args.every ?? 300),
  cols = +(args.cols ?? 4),
  shots = +(args.shots ?? 1),
  hours = +(args.hours ?? 12),
  walk = +(args.walk ?? 0),
  dist0 = +(args.dist ?? 3),
  pitch0 = +(args.pitch ?? 8),
  yaw0 = args.yaw === undefined ? null : +args.yaw,
  follow = args.follow !== undefined;
const at = (args.at ?? '5,1.5,-65,9,0,6').split(',').map(Number);

await acquireLock();
const { browser } = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  const errs = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text());
  });
  page.on('pageerror', (e) => errs.push(String(e?.stack ?? e)));
  await page.goto(`${base}?${['nointro', 'noidle', 'nofilm', 'adaptive=0', args.q].filter(Boolean).join('&')}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
  await page.evaluate(([x, y, z, d, yaw, p, h]) => {
    window.__city.setHours(h);
    window.__city.setSpeed(1);
    window.__city.view({ target: { x, y, z }, distance: d, yaw, pitch: p });
  }, [at[0], at[1], at[2], at[3], at[4], at[5], hours]);
  await page.addStyleTag({ content: '#ui{display:none!important}' });
  await page.waitForTimeout(3000);
  if (args.pre) {
    await page.evaluate(args.pre);
    await page.waitForTimeout(6000);
  }
  const sheetPage = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const taken = new Set();
  for (let s = 0; s < shots; s++) {
    let label = args.at ?? '';
    if (args.find) {
      const found = await page.evaluate(
        ([what, x, z, used, dist, pitch, yaw0, follow]) => {
          const c = window.__city;
          const L = c.ctx.services.smalllife;
          const [w, sub] = what.split(':');
          const list = [];
          if (w === 'birds') for (const g of L?.birds?.allGroups ?? []) if (sub === undefined || g.kind === +sub) if (g.birds[0]) list.push({ x: g.birds[0].x, z: g.birds[0].z, y: g.birds[0].y + 0.1, id: `${w}${Math.round(g.x)},${Math.round(g.z)}`, info: `kind ${g.kind} n ${g.birds.length}` });
          if (w === 'cat') for (const g of L?.cats?.cats ?? []) if (g.spot) list.push({ x: g.x, z: g.z, y: g.y + 0.2, id: `cat${L.cats.cats.indexOf(g)}`, info: `${g.spot.kind} coat ${g.spot.coat}`, ref: g, up: 0.2 });
          if (w === 'moment') {
            const S = c.ctx.services.scenes?.scenes?.find((q) => q.name === 'moments');
            for (const q of S?.live ?? []) list.push({ x: q.a.m.x, z: q.a.m.z, y: q.a.m.y + 1, id: `mo${Math.round(q.x)},${Math.round(q.z)}`, info: q.a.doing, ref: q.a.m, up: 1, yawBase: (Math.atan2(q.spot.nx, q.spot.nz) * 180) / Math.PI });
          }
          if (w === 'litter') for (const g of L?.litter?.spots ?? []) list.push({ x: g.x, z: g.z, y: 0.2, id: `lit${Math.round(g.x)},${Math.round(g.z)}`, info: g.info });
          if (w === 'feed' || w === 'waiter') {
            for (const p of c.ctx.services.pedestrians._crowd.parties) {
              if (p.state === 'gone') continue;
              for (const m of p.members) {
                if (!m.present) continue;
                if (w === 'feed' && m.moment !== 6) continue;
                if (w === 'waiter' && !(p.staff && p.stall === undefined && m.carry > 0)) continue;
                list.push({ x: m.x, z: m.z, y: m.y + 0.8, id: `p${p.id}`, info: `carry ${m.carry}`, ref: m, up: 0.8, yawBase: (m.yaw * 180) / Math.PI });
              }
            }
          }
          if (w === 'dog' || w === 'talk') {
            for (const p of c.ctx.services.pedestrians._crowd.parties) {
              if (p.state === 'gone') continue;
              const m = p.members[0];
              if (!m.present) continue;
              if (w === 'dog' && !m.look.dog) continue;
              if (w === 'talk' && !(p.members.length > 1 && m.chat > 0)) continue;
              list.push({ x: m.x, z: m.z, y: m.y + 1.1, id: `p${p.id}`, info: p.persona ?? '', ref: m, up: w === 'dog' ? 0.35 : 1.1 });
            }
          }
          list.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
          const f = list.find((q) => !used.includes(q.id));
          if (!f) return null;
          const yaw = (yaw0 ?? Math.random() * 360) + (f.yawBase ?? 0);
          c.view({ target: { x: f.x, y: f.y, z: f.z }, distance: dist, yaw, pitch });
          clearInterval(window.__followI);
          if (follow && f.ref) {
            const r = f.ref,
              up = f.up;
            window.__followI = setInterval(() => c.ctx.services.camera.flyTo({ target: { x: r.x, y: r.y + up, z: r.z }, distance: dist, yaw, pitch }, 0), 30);
          }
          const { ref, ...plain } = f;
          return plain;
        },
        [args.find, at[0], at[2], [...taken], dist0, pitch0, yaw0, follow],
      );
      if (!found) {
        console.log(`shot ${s}: nothing found for ${args.find}`);
        continue;
      }
      taken.add(found.id);
      label = `${found.id} ${found.info}`;
      await page.waitForTimeout(1500);
    }
    if (args.eval) await page.evaluate(args.eval);
    if (walk > 0) {
      await page.evaluate((sp) => {
        const c = window.__city;
        clearInterval(window.__walkI);
        const st = c.ctx.services.camera.getState();
        const T = { x: st.target.x, y: st.target.y, z: st.target.z };
        let d = st.distance;
        const yaw = st.yaw,
          pitch = st.pitch;
        let t0 = performance.now();
        window.__walkI = setInterval(() => {
          const t = performance.now();
          d = Math.max(0.6, d - (sp * (t - t0)) / 1000);
          t0 = t;
          c.ctx.services.camera.flyTo({ target: T, distance: d, yaw, pitch }, 0);
        }, 40);
      }, walk);
    }
    const imgs = [];
    for (let i = 0; i < frames; i++) {
      const t0 = Date.now();
      imgs.push((await page.screenshot({ type: 'jpeg', quality: 86 })).toString('base64'));
      const left = every - (Date.now() - t0);
      if (left > 0) await page.waitForTimeout(left);
    }
    await page.evaluate(() => clearInterval(window.__walkI));
    const rows = Math.ceil(frames / cols);
    const cw = Math.round(1920 / cols),
      ch = Math.round((cw * H) / W);
    const b64 = await sheetPage.evaluate(
      async ([imgs, cols, rows, cw, ch, label]) => {
        const c = document.createElement('canvas');
        c.width = cols * cw;
        c.height = rows * ch;
        const g = c.getContext('2d');
        for (let i = 0; i < imgs.length; i++) {
          const im = new Image();
          im.src = `data:image/jpeg;base64,${imgs[i]}`;
          await im.decode();
          g.drawImage(im, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch);
        }
        g.font = '14px sans-serif';
        g.fillStyle = '#000a';
        g.fillRect(0, 0, 560, 20);
        g.fillStyle = '#fff';
        g.fillText(label, 6, 15);
        return c.toDataURL('image/png').split(',')[1];
      },
      [imgs, cols, rows, cw, ch, label],
    );
    const file = shots > 1 ? out.replace(/\.png$/, `_${s + 1}.png`) : out;
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log(`shot ${s}: ${file}  ${label}`);
  }
  const st = await page.evaluate(() => {
    const c = window.__city;
    const sc = c.stats().scenes ?? {};
    return { stats: { ...(c.stats().smalllife ?? {}), mOut: sc.momentsOut, mStarted: sc.momentsStarted, mSpots: sc.momentSpots }, inv: c.invariants(), frameErrors: c.frameErrors?.length ?? 0 };
  });
  console.log(JSON.stringify({ stats: st.stats, inv: st.inv, frameErrors: st.frameErrors, errors: errs.slice(0, 6) }).slice(0, 1500));
} finally {
  await browser.close();
  releaseLock();
}
