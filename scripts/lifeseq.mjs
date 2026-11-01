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
//     --pedwalk <poi>       a real walk: the camera at eye height along the walkway graph, from the node nearest that POI to one
//                           60-90 m off (--walk speed, default 1.4), --walkseed n picks another way; nothing else is touched
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
                if (w === 'waiter' && !(p.staff && !p.stall && (sub === undefined || p.servePhase > 0))) continue;
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
    if (args.pedwalk) {
      const r = await page.evaluate(
        ([poi, seed, sp]) => {
          const c = window.__city;
          const { peds, plan } = c.ctx;
          const P = plan.pois.find((q) => q.id === poi) ?? plan.pois[0];
          const px = P.x ?? P.target?.x ?? P.view?.target?.x ?? 0,
            pz = P.z ?? P.target?.z ?? P.view?.target?.z ?? 0;
          let a = 0,
            bd = 1e18;
          peds.nodes.forEach((n, i) => {
            const d = (n.x - px) ** 2 + (n.z - pz) ** 2;
            if (d < bd) {
              bd = d;
              a = i;
            }
          });
          const far = [];
          peds.nodes.forEach((n, i) => {
            const d = Math.hypot(n.x - peds.nodes[a].x, n.z - peds.nodes[a].z);
            if (d > 60 && d < 90) far.push(i);
          });
          const b = far[(seed * 7919) % far.length];
          const route = peds.route(a, b);
          if (!route) return null;
          const pts = route.map((i) => [peds.nodes[i].x, peds.nodes[i].z]);
          let i = 0,
            x = pts[0][0],
            z = pts[0][1],
            yaw = null;
          let t0 = performance.now();
          const ter = c.ctx.services.terrain;
          clearInterval(window.__walkI);
          window.__walkI = setInterval(() => {
            const t = performance.now();
            let left = (sp * (t - t0)) / 1000;
            t0 = t;
            while (left > 0 && i < pts.length - 1) {
              const dx = pts[i + 1][0] - x,
                dz = pts[i + 1][1] - z,
                d = Math.hypot(dx, dz);
              if (d <= left) {
                x = pts[i + 1][0];
                z = pts[i + 1][1];
                i++;
                left -= d;
              } else {
                x += (dx / d) * left;
                z += (dz / d) * left;
                left = 0;
              }
            }
            const q = pts[Math.min(i + 1, pts.length - 1)];
            const want = (Math.atan2(-(q[0] - x), -(q[1] - z)) * 180) / Math.PI;
            if (yaw === null) yaw = want;
            let dy = ((want - yaw + 540) % 360) - 180;
            yaw += dy * 0.04;
            const yr = (yaw * Math.PI) / 180;
            c.ctx.services.camera.flyTo({ target: { x: x - Math.sin(yr) * 8, y: (ter?.height?.(x, z) ?? 0) + 1.2, z: z - Math.cos(yr) * 8 }, distance: 8, yaw, pitch: 3 }, 0);
          }, 40);
          return { from: pts[0], to: pts[pts.length - 1], n: pts.length };
        },
        [args.pedwalk, +(args.walkseed ?? 1), walk || 1.4],
      );
      label = `pedwalk ${args.pedwalk} ${JSON.stringify(r)}`;
      await page.waitForTimeout(1500);
      // what a walker meets, in front of them, sampled once a second: printed as seconds with each thing in sight
      await page.evaluate(() => {
        const c = window.__city;
        const M = (window.__meet = { secs: 0, moment: 0, birds: 0, birdsNear: 0, cat: 0, dog: 0, talk: 0, people: 0, litter: 0, kinds: {} });
        const see = (x, z, r) => {
          const cam = c.ctx.camera;
          const e = cam.matrixWorld.elements;
          const dx = x - cam.position.x,
            dz = z - cam.position.z,
            d = Math.hypot(dx, dz);
          return d < r && (dx * -e[8] + dz * -e[10]) / (d || 1) > 0.72;
        };
        window.__meetNow = () => {
          const L = c.ctx.services.smalllife;
          const S = c.ctx.services.scenes?.scenes?.find((q) => q.name === 'moments');
          const cam = c.ctx.camera.position;
          const o = [];
          for (const q of S?.live ?? []) if (see(q.a.m.x, q.a.m.z, 25)) o.push(`${q.a.doing?.split(' ').slice(0, 2).join(' ')} ${Math.round(Math.hypot(q.a.m.x - cam.x, q.a.m.z - cam.z))}m`);
          let bn = 0,
            b = 0;
          for (const g of L?.birds?.allGroups ?? []) for (const k of g.birds ?? []) if (see(k.x, k.z, 25)) (b++, see(k.x, k.z, 10) && bn++);
          if (b) o.push(`birds ${b}/${bn}`);
          let cat = 0;
          for (const g of L?.cats?.cats ?? []) if (g.spot && see(g.x, g.z, 15)) cat++;
          if (cat) o.push('cat');
          let dog = 0,
            talk = 0,
            ppl = 0;
          for (const p of c.ctx.services.pedestrians._crowd.parties) {
            if (p.state === 'gone') continue;
            const m = p.members[0];
            if (!m?.present || !see(m.x, m.z, 15)) continue;
            ppl += p.members.length;
            if (m.look.dog) dog++;
            if (p.members.length > 1 && m.chat > 0) talk++;
          }
          if (dog) o.push('dog');
          if (talk) o.push('talk');
          o.push(`p${ppl}`);
          return o.join(' · ');
        };
        clearInterval(window.__meetI);
        window.__meetI = setInterval(() => {
          const t = window.__meetNow();
          M.secs++;
          if (/m( |$)/.test(t) && /(Sweep|Hav|On the|Talking|Getting)/.test(t)) M.moment++;
          if (t.includes('birds')) M.birds++;
          if (/birds \d+\/[1-9]/.test(t)) M.birdsNear++;
          if (t.includes('cat')) M.cat++;
          if (t.includes('dog')) M.dog++;
          if (t.includes('talk')) M.talk++;
          if (!t.endsWith('p0')) M.people++;
        }, 1000);
        void 0;
      });
    }
    const imgs = [];
    const notes = [];
    for (let i = 0; i < frames; i++) {
      const t0 = Date.now();
      imgs.push((await page.screenshot({ type: 'jpeg', quality: 86 })).toString('base64'));
      if (args.pedwalk) notes.push(await page.evaluate(() => window.__meetNow()));
      const left = every - (Date.now() - t0);
      if (left > 0) await page.waitForTimeout(left);
    }
    await page.evaluate(() => clearInterval(window.__walkI));
    const rows = Math.ceil(frames / cols);
    const cw = Math.round(1920 / cols),
      ch = Math.round((cw * H) / W);
    const b64 = await sheetPage.evaluate(
      async ([imgs, cols, rows, cw, ch, label, notes]) => {
        const c = document.createElement('canvas');
        c.width = cols * cw;
        c.height = rows * ch;
        const g = c.getContext('2d');
        for (let i = 0; i < imgs.length; i++) {
          const im = new Image();
          im.src = `data:image/jpeg;base64,${imgs[i]}`;
          await im.decode();
          g.drawImage(im, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch);
          if (notes[i]) {
            g.font = '13px sans-serif';
            g.fillStyle = '#000a';
            g.fillRect((i % cols) * cw, (Math.floor(i / cols) + 1) * ch - 18, cw, 18);
            g.fillStyle = '#ff8';
            g.fillText(notes[i], (i % cols) * cw + 5, (Math.floor(i / cols) + 1) * ch - 5);
          }
        }
        g.font = '14px sans-serif';
        g.fillStyle = '#000a';
        g.fillRect(0, 0, 560, 20);
        g.fillStyle = '#fff';
        g.fillText(label, 6, 15);
        return c.toDataURL('image/png').split(',')[1];
      },
      [imgs, cols, rows, cw, ch, label, notes],
    );
    const file = shots > 1 ? out.replace(/\.png$/, `_${s + 1}.png`) : out;
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log(`shot ${s}: ${file}  ${label}`);
    if (args.pedwalk) console.log('seconds in sight', JSON.stringify(await page.evaluate(() => window.__meet)));
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
