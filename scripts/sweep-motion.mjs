#!/usr/bin/env node
// The motion pass of the city sweep (docs/progress/city-sweep.md): stills can't show what flickers, pops in or jumps. It walks every
// street at walking speed with the city and the clock running, and flags frames where part of the picture changes suddenly, against
// the frames around it. Those frames go to judges under the `bug` tag.
//
//   node scripts/sweep-motion.mjs --url http://127.0.0.1:5198/ [--minutes 60] [--speed 3.4] [--start 0] [--seconds 40]   walk
//                 (3.4 m/s is the walker's jog: the route is 16.5 km, every walkway both ways, so about 80 minutes)
//   node scripts/sweep-motion.mjs --retremble 30 --url ...     the worst cells of tremble.jsonl again: is it in the same place every time?
//   node scripts/sweep-motion.mjs --judge [--max-events 300]   judge what the walk flagged (needs no browser)
//
// Use the newest build for --url: the capture's stays at one build, but this looks for what's still wrong now.
// Writes <out>/motion/: events.jsonl, <event>.jpg (before, at, after, the change in a red box), walk.json (where it got to; a rerun
// goes on from there), judged/<event>.json. Stops on disk under 5 GB and battery under 25 %. Stop file: <out>/STOP-CAPTURE.
//
// How a frame is flagged, on 64×34 block means of each frame, with F the frame under test:
//   step    F differs from the frame before, and neither the step before nor the step after moved anything like as much
//   flash   F differs from both neighbours, and those two match
// and the change is at least 4× what the blocks around it have done for the last second (a fence passing close by keeps them busy),
// and the patch isn't found a few blocks away in the other frame, which is what a near edge that moved looks like.
// Steady motion, also of a car or a person near the camera, changes the blocks in every frame, so it doesn't count. A late frame
// (over 1.7× the median interval) moves everything further than usual, so it and its neighbours are skipped and only counted.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[a.slice(2)] = '1';
  else args[a.slice(2)] = process.argv[++i];
}
const outDir = path.resolve(root, args.out ?? 'shots/sweep');
const motionDir = path.join(outDir, 'motion');
const judgedDir = path.join(motionDir, 'judged');
const eventsFile = path.join(motionDir, 'events.jsonl');
const walkFile = path.join(motionDir, 'walk.json');
const stopFile = path.join(outDir, 'STOP-CAPTURE');
fs.mkdirSync(judgedDir, { recursive: true });

// ───────────────────────────────── judges
if (args.judge) {
  const model = args.model ?? 'claude-sonnet-5-5';
  const maxEvents = parseInt(args['max-events'] ?? '300', 10);
  const jobs = parseInt(args.jobs ?? '3', 10);
  const brief = `You judge frames from a walk through a procedural 3D city. The picture holds three consecutive frames side by side, about 1/30 s apart: before, at, after a sudden change that a detector flagged inside the red box. The walker moves slowly, so from one frame to the next almost nothing should change.\n\nRead the image once, then answer straight away. Use no other tool and no other file.\n\nSay whether something is plainly wrong: a thing that pops into or out of existence, a flash, a wall or surface changing colour or material, a thing jumping, tearing or doubling, shadows or lights snapping. A person or car simply moving is not a fault, and neither is a change you can't see.\n\nAnswer with at most 3 lines, or the single word none, and nothing else:\n\`<1-5> | bug | <image name> | <the exact thing> | <why>\`\n5 means anyone walking there sees it at once, 1 means only someone looking for it.`;
  const raw = fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  // the strongest of each 5 m square and kind: one street lamp popping in on every walk past is one thing to judge
  const best = new Map();
  for (const e of raw) {
    const k = `${Math.round(e.x / 5)},${Math.round(e.z / 5)},${e.type}`;
    if (!best.has(k) || best.get(k).score < e.score) best.set(k, e);
  }
  const queue = [...best.values()].sort((a, b) => b.score - a.score).slice(0, maxEvents).filter((e) => !fs.existsSync(path.join(judgedDir, `${e.id}.json`)));
  let cost = 0,
    done = 0,
    running = 0;
  const one = (e) =>
    new Promise((resolve) => {
      const cmd = ['claude', '-p', '--model', model, '--output-format', 'json', '--tools', 'Read', '--allowedTools', 'Read', '--strict-mcp-config', '--setting-sources', '""', '--no-session-persistence', '--system-prompt', '"You judge images. Use only the Read tool."'].join(' ');
      const child = spawn(cmd, { cwd: motionDir, shell: true, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      let out = '';
      child.stdout.on('data', (b) => (out += b));
      child.stderr.on('data', () => {});
      child.stdin.end(`${brief}\nImage in the current folder: ${e.id}.jpg`);
      child.on('close', () => {
        try {
          const r = JSON.parse(out);
          if (!r.is_error && typeof r.result === 'string') {
            fs.writeFileSync(path.join(judgedDir, `${e.id}.json`), JSON.stringify({ id: e.id, part: 'motion', at: `${e.x}, ${e.z}, ${e.hour}h`, type: e.type, score: e.score, result: r.result, cost: r.total_cost_usd }, null, 1));
            cost += r.total_cost_usd ?? 0;
            done++;
          }
        } catch {
          /* no answer: left for the next run */
        }
        resolve();
      });
    });
  console.log(`${raw.length} events, ${best.size} after one per 5 m square, ${queue.length} to judge`);
  await new Promise((finish) => {
    const next = () => {
      if (!queue.length && !running) return finish();
      while (running < jobs && queue.length && !fs.existsSync(path.join(outDir, 'STOP-JUDGES'))) {
        running++;
        one(queue.shift()).finally(() => {
          running--;
          next();
        });
      }
      if (!running) finish();
    };
    next();
  });
  console.log(JSON.stringify({ judged: done, cost: +cost.toFixed(2) }));
  process.exit(0);
}

// ───────────────────────────────── in the page
const installWalk = (opts) => {
  const c = window.__city.ctx;
  const W = 64,
    H = 34,
    RW = 640,
    RH = 342,
    RING = 5;
  const gl = c.renderer.domElement;
  // the frames are kept small on GPU canvases and read back only when flagged; the blocks are read every frame
  const ring = Array.from({ length: RING }, () => {
    const k = document.createElement('canvas');
    k.width = RW;
    k.height = RH;
    return { k, x: k.getContext('2d'), blocks: new Float32Array(W * H * 3), t: 0, gap: false };
  });
  const small = document.createElement('canvas');
  small.width = W;
  small.height = H;
  const sx = small.getContext('2d', { willReadFrequently: true });
  const s = { frames: 0, events: [], late: 0, walked: 0, leg: 0, done: false, ms: [], bestAt: new Map(), busy: new Float32Array(W * H) };
  window.__motion = s;

  // the route: the walkway graph, depth first, every edge once, there and back where it dead-ends (so both directions get seen);
  // a jump only where the graph falls apart, with time to settle after it
  const ped = c.peds;
  const usable = (e) => e.kind !== 'door';
  const seen = new Set();
  const legs = [];
  const walkFrom = (start) => {
    const stack = [{ n: start, via: null }];
    let leg = [];
    while (stack.length) {
      const top = stack[stack.length - 1];
      const node = ped.nodes[top.n];
      if (!leg.length || leg[leg.length - 1] !== top.n) leg.push(top.n);
      let went = false;
      for (const ei of node.edges) {
        const e = ped.edges[ei];
        if (seen.has(ei) || !usable(e)) continue;
        seen.add(ei);
        stack.push({ n: e.a === top.n ? e.b : e.a });
        went = true;
        break;
      }
      if (!went) stack.pop();
    }
    if (leg.length > 1) legs.push(leg);
  };
  const order = ped.nodes.map((n, i) => i).sort((a, b) => ped.nodes[a].x - ped.nodes[b].x || ped.nodes[a].z - ped.nodes[b].z);
  for (const i of order) walkFrom(i);
  s.route = legs.map((l) => l.map((i) => [ped.nodes[i].x, ped.nodes[i].z]));
  s.length = s.route.reduce((a, l) => a + l.reduce((b, p, i) => (i ? b + Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) : 0), 0), 0);
  const eye = 1.6;
  const pos = { leg: opts.leg ?? 0, i: opts.i ?? 0, f: 0, yaw: null, settle: 3 };
  s.pos = pos;
  const heightAt = (x, z) => c.services.terrain?.height?.(x, z) ?? 0;
  const place = (dt) => {
    const route = s.route[pos.leg];
    if (!route) {
      s.done = true;
      return;
    }
    if (pos.settle > 0) {
      pos.settle -= dt;
      dt = 0;
    }
    let left = dt * opts.speed;
    let a = route[pos.i],
      b = route[pos.i + 1];
    while (b && left > 0) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-3;
      const step = Math.min(left, (1 - pos.f) * len);
      pos.f += step / len;
      left -= step;
      s.walked += step;
      if (pos.f >= 0.999) {
        pos.i++;
        pos.f = 0;
        a = route[pos.i];
        b = route[pos.i + 1];
      }
    }
    if (!b) {
      pos.leg++;
      pos.i = 0;
      pos.f = 0;
      pos.yaw = null;
      pos.settle = 3;
      s.jumped = true;
      return;
    }
    const x = a[0] + (b[0] - a[0]) * pos.f,
      z = a[1] + (b[1] - a[1]) * pos.f;
    // heading is smoothed: a walker turns, and doesn't snap at a corner. Yaw is the side the camera comes from, so it looks along -dir.
    const want = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
    if (pos.yaw === null) pos.yaw = want;
    let d = want - pos.yaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    pos.yaw += d * Math.min(1, dt * 1.6);
    const y = heightAt(x, z) + eye;
    // (not __city.view: it flushes the near-detail queue, and pop-in is what this looks for)
    // (looking 3° down, as the walker does when it starts)
    c.services.camera.flyTo({ target: { x: x + Math.sin(pos.yaw) * -1.2, y: y - 1.2 * Math.sin((opts.pitch * Math.PI) / 180), z: z + Math.cos(pos.yaw) * -1.2 }, distance: 1.2, yaw: (pos.yaw * 180) / Math.PI, pitch: opts.pitch }, 0);
    pos.x = x;
    pos.z = z;
  };

  // testing the frame before the newest, against two before it and one after
  const TAU = opts.tau * 3; // block mean, sum of three channels
  const test = () => {
    const at = (k) => ring[((s.frames - k) % RING + RING) % RING];
    const [p2, p1, f, n1] = [at(3), at(2), at(1), at(0)];
    if (p2.gap || p1.gap || f.gap || n1.gap) return;
    const flagged = new Uint8Array(W * H);
    const kinds = { step: 0, flash: 0 };
    // how busy each block has been for about the last second, up to the frame before: a fence passing close by keeps its blocks busy,
    // and only what stands out from its own surroundings' recent past counts
    for (let i = 0; i < W * H; i++) {
      const j = i * 3;
      s.busy[i] += 0.1 * (Math.abs(p2.blocks[j] - p1.blocks[j]) + Math.abs(p2.blocks[j + 1] - p1.blocks[j + 1]) + Math.abs(p2.blocks[j + 2] - p1.blocks[j + 2]) - s.busy[i]);
    }
    for (let i = 0; i < W * H; i++) {
      const j = i * 3;
      const dist = (A, B) => Math.abs(A[j] - B[j]) + Math.abs(A[j + 1] - B[j + 1]) + Math.abs(A[j + 2] - B[j + 2]);
      const here = dist(p1.blocks, f.blocks);
      if (here < TAU) continue;
      const x = i % W,
        y = (i / W) | 0;
      let busy = 0;
      for (let v = Math.max(0, y - 1); v <= Math.min(H - 1, y + 1); v++) for (let u = Math.max(0, x - 1); u <= Math.min(W - 1, x + 1); u++) busy = Math.max(busy, s.busy[v * W + u]);
      if (here < 4 * busy) continue;
      const before = dist(p2.blocks, p1.blocks);
      const after = dist(f.blocks, n1.blocks);
      const across = dist(p1.blocks, n1.blocks);
      if (after > here * 0.6 && across < here * 0.35 && before < here * 0.35) {
        flagged[i] = 2;
        kinds.flash++;
      } else if (before < here * 0.3 && after < here * 0.3) {
        flagged[i] = 1;
        kinds.step++;
      }
    }
    if (!kinds.step && !kinds.flash) return;
    // A near edge that moves more than a block per frame changes a block only once, like a step. So a flagged block stays only if its
    // 3×3 patch, or the one it replaced, can't be found nearby in the other frame: it came from nowhere rather than from next door.
    const R = opts.tau * 3 * 9;
    const unmatched = (A, B, cx, cy) => {
      let best = Infinity;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          let sad = 0;
          for (let y = cy - 1; y <= cy + 1 && sad < best; y++) {
            for (let x = cx - 1; x <= cx + 1; x++) {
              const u = x + dx,
                v = y + dy;
              if (x < 0 || y < 0 || x >= W || y >= H || u < 0 || v < 0 || u >= W || v >= H) {
                sad += R / 9;
                continue;
              }
              const a = (y * W + x) * 3,
                b = (v * W + u) * 3;
              sad += Math.abs(A[a] - B[b]) + Math.abs(A[a + 1] - B[b + 1]) + Math.abs(A[a + 2] - B[b + 2]);
            }
          }
          if (sad < best) best = sad;
          if (best < R) return false;
        }
      }
      return true;
    };
    let kept = 0;
    for (let i = 0; i < W * H; i++) {
      if (!flagged[i]) continue;
      const x = i % W,
        y = (i / W) | 0;
      if (unmatched(f.blocks, p1.blocks, x, y) || unmatched(p1.blocks, f.blocks, x, y)) kept++;
      else flagged[i] = 0;
    }
    if (!kept) return;
    // the largest connected patch
    const label = new Int32Array(W * H);
    let best = null;
    for (let i = 0; i < W * H; i++) {
      if (!flagged[i] || label[i]) continue;
      const q = [i];
      label[i] = i + 1;
      let x0 = W,
        x1 = 0,
        y0 = H,
        y1 = 0,
        n = 0;
      while (q.length) {
        const v = q.pop();
        const vx = v % W,
          vy = (v / W) | 0;
        n++;
        x0 = Math.min(x0, vx);
        x1 = Math.max(x1, vx);
        y0 = Math.min(y0, vy);
        y1 = Math.max(y1, vy);
        for (const u of [vx > 0 ? v - 1 : -1, vx < W - 1 ? v + 1 : -1, vy > 0 ? v - W : -1, vy < H - 1 ? v + W : -1]) {
          if (u >= 0 && flagged[u] && !label[u]) {
            label[u] = i + 1;
            q.push(u);
          }
        }
      }
      if (!best || n > best.n) best = { n, x0, x1, y0, y1 };
    }
    if (!best || best.n < opts.minBlocks) return;
    // (under 3 blocks across it's a bar or a post going past, and the score favours a solid patch of moderate size: the huge ones are a
    // person or a gull at the lens)
    const bw0 = best.x1 - best.x0 + 1,
      bh0 = best.y1 - best.y0 + 1;
    if (bw0 < 3 || bh0 < 3) return;
    const score = +((Math.min(best.n, 60) * best.n) / (bw0 * bh0)).toFixed(1);
    // only the strongest of each 5 m square and kind is worth a read-back
    const type = kinds.flash > kinds.step ? 'flash' : 'step';
    const key = `${Math.round((pos.x ?? 0) / 5)},${Math.round((pos.z ?? 0) / 5)},${type}`;
    if ((s.bestAt.get(key) ?? 0) >= score) return;
    s.bestAt.set(key, score);
    const m = document.createElement('canvas');
    m.width = RW * 3 + 8;
    m.height = RH;
    const mx = m.getContext('2d');
    [p1, f, n1].forEach((r, i) => mx.drawImage(r.k, i * (RW + 4), 0));
    mx.strokeStyle = '#f00';
    mx.lineWidth = 2;
    const bx = (RW / W) * best.x0,
      by = (RH / H) * best.y0,
      bw = (RW / W) * (best.x1 - best.x0 + 1),
      bh = (RH / H) * (best.y1 - best.y0 + 1);
    for (let i = 0; i < 3; i++) mx.strokeRect(i * (RW + 4) + bx - 2, by - 2, bw + 4, bh + 4);
    s.events.push({ type, blocks: best.n, score, frame: s.frames, x: +(pos.x ?? 0).toFixed(1), z: +(pos.z ?? 0).toFixed(1), yaw: Math.round(((pos.yaw ?? 0) * 180) / Math.PI), hour: +(c.clock.hours ?? 0).toFixed(2), box: [best.x0, best.y0, best.x1, best.y1], jpeg: m.toDataURL('image/jpeg', 0.85) });
  };

  const orig = c.render;
  let last = performance.now();
  let lateFor = 0;
  c.render = (dt) => {
    const now = performance.now();
    const ms = now - last;
    last = now;
    if (s.ms.length < 120) s.ms.push(ms);
    const med = s.median ?? 33;
    if (s.ms.length === 120 && !s.median) s.median = s.ms.slice().sort((a, b) => a - b)[60];
    if (opts.keys) {
      const p = c.camera.position;
      pos.x = p.x;
      pos.z = p.z;
      pos.settle = 0;
    }
    if (ms > 1.7 * med) {
      lateFor = 3;
      s.late++;
    }
    if (pos.settle > 0 || s.jumped) lateFor = Math.max(lateFor, 3);
    s.jumped = false;
    if (!s.done && !opts.keys) place(Math.min(ms / 1000, 0.2));
    orig(dt);
    const r = ring[s.frames % RING];
    r.x.drawImage(gl, 0, 0, RW, RH);
    sx.drawImage(r.k, 0, 0, W, H);
    const d = sx.getImageData(0, 0, W, H).data;
    for (let i = 0, j = 0; i < W * H; i++, j += 4) {
      r.blocks[i * 3] = d[j];
      r.blocks[i * 3 + 1] = d[j + 1];
      r.blocks[i * 3 + 2] = d[j + 2];
    }
    r.gap = lateFor > 0;
    if (lateFor > 0) lateFor--;
    if (s.frames > RING) test();
    s.frames++;
  };
};

// ───────────────────────────────── the run
const browserFile = ['scripts/browser.mjs', '../../../scripts/browser.mjs'].map((p) => path.resolve(root, p)).reverse().find((p) => fs.existsSync(p));
const { launchBrowser, acquireLock, releaseLock } = await import(pathToFileURL(browserFile).href);
const url = (args.url ?? 'http://127.0.0.1:5198/').replace(/\/?$/, '/');
const q = 'nointro&noidle&nofilm&adaptive=0&quality=high&weather=clear';
let power = { online: true, pct: 100 };
const psPoll =
  process.platform === 'win32'
    ? spawn('powershell', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; while ($true) { $p = [System.Windows.Forms.SystemInformation]::PowerStatus; "$($p.PowerLineStatus) $($p.BatteryLifePercent)"; [Console]::Out.Flush(); Start-Sleep -Seconds 20 }'], { stdio: ['ignore', 'pipe', 'ignore'] })
    : null;
psPoll?.stdout.on('data', (b) => {
  const m = /(\w+) ([\d.,]+)\s*$/.exec(String(b).trim());
  if (m) power = { online: m[1] !== 'Offline', pct: parseFloat(m[2].replace(',', '.')) * 100 };
});
psPoll?.on('error', () => {});
const freeGB = () => {
  const s = fs.statfsSync(outDir);
  return (s.bavail * s.bsize) / 1e9;
};

await acquireLock();
const report = { url, started: new Date().toISOString() };
let browser = null;
try {
  ({ browser } = await launchBrowser());
  const page = await browser.newPage({ viewport: { width: 1920, height: 1025 }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${url}?${q}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
  await page.addStyleTag({ content: '#ui{display:none!important}' });

  if (args.retremble) {
    // Five three-frame reads per cell from where it was worst, as in sweep.mjs, with the city stopped: the worst cells of the capture's
    // list are a person or a lorry passing the lens, and what still changes with nothing moving is the rendering's own flicker
    await page.evaluate(() => window.__city.setSpeed(0));
    const raw = fs.readFileSync(path.join(outDir, 'tremble.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const worst = new Map();
    for (const t of raw) if (!worst.has(t.id) || t.area24 > worst.get(t.id).area24) worst.set(t.id, t);
    const top = [...worst.values()].sort((a, b) => b.area24 - a.area24).slice(0, parseInt(args.retremble, 10));
    await page.evaluate(() => {
      const c = window.__city.ctx;
      const gl = c.renderer.getContext();
      const orig = c.render;
      const s = { grab: null };
      window.__tr = s;
      c.render = (dt) => {
        orig(dt);
        s.grab?.();
      };
      s.read = () =>
        new Promise((resolve) => {
          const W = gl.drawingBufferWidth,
            H = gl.drawingBufferHeight,
            N = W * H;
          const raw = new Uint8Array(N * 4);
          let a = null,
            b = null,
            seen = 0;
          s.grab = () => {
            c.renderer.state.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, raw);
            const l = new Uint8ClampedArray(N);
            for (let i = 0, j = 0; i < N; i++, j += 4) l[i] = (raw[j] * 54 + raw[j + 1] * 183 + raw[j + 2] * 19 + 128) >> 8;
            if (++seen < 3) {
              a = b;
              b = l;
              return;
            }
            s.grab = null;
            let a24 = 0;
            for (let i = 0; i < N; i++) if (Math.abs(l[i] - 2 * b[i] + a[i]) >= 24) a24++;
            resolve(+((100 * a24) / N).toFixed(2));
          };
        });
    });
    const yawOf = { N: 0, E: -90, S: 180, W: 90 };
    const rows = [];
    for (const t of top) {
      await page.evaluate(([x, z, h, yaw]) => {
        const c = window.__city;
        c.ctx.clock.holdTime = false;
        c.setHours(h);
        c.ctx.clock.holdTime = true;
        c.view({ target: { x, y: 1.6, z }, distance: 1.2, yaw, pitch: 0 });
      }, [t.x, t.z, t.h, (yawOf[t.view] ?? 0) + 8]);
      await page.waitForTimeout(2500);
      const reads = [];
      for (let k = 0; k < 5; k++) {
        reads.push(await page.evaluate(() => window.__tr.read()));
        await page.waitForTimeout(700);
      }
      rows.push({ id: t.id, view: t.view, h: t.h, before: t.area24, reads });
    }
    fs.writeFileSync(path.join(motionDir, 'retremble.json'), JSON.stringify({ url, rows }, null, 1));
    report.retremble = rows;
  } else {
    const prev = fs.existsSync(walkFile) ? JSON.parse(fs.readFileSync(walkFile, 'utf8')) : null;
    const opts = { speed: parseFloat(args.speed ?? '3.4'), tau: parseFloat(args.tau ?? '8'), pitch: parseFloat(args.pitch ?? '3'), minBlocks: parseInt(args['min-blocks'] ?? '3', 10), leg: args.start !== undefined ? parseInt(args.start, 10) : (prev?.leg ?? 0), i: args.start !== undefined ? 0 : (prev?.i ?? 0), keys: !!args.keys };
    await page.evaluate(() => {
      window.__city.setHours(10.5);
      window.__city.setSpeed(1);
    });
    // --keys x,z,yaw: instead of the route, the real walker from there with V and Shift+W, in a straight line, to tell a fault of the
    // city from one of driving the camera
    if (args.keys) {
      const [x, z, yaw] = args.keys.split(',').map(Number);
      await page.evaluate(([xx, zz, yw]) => window.__city.view({ target: { x: xx, y: 0.15, z: zz }, distance: 6, yaw: yw, pitch: 12 }), [x, z, yaw]);
      await page.waitForTimeout(2500);
      await page.mouse.move(960, 512);
      await page.keyboard.press('KeyV');
      await page.waitForTimeout(2500);
    }
    await page.evaluate(installWalk, opts);
    if (args.keys) {
      await page.keyboard.down('ShiftLeft');
      await page.keyboard.down('KeyW');
    }
    const seconds = args.seconds ? parseFloat(args.seconds) : parseFloat(args.minutes ?? '60') * 60;
    const t0 = Date.now();
    let stop = null;
    let saved = fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, 'utf8').trim().split('\n').filter(Boolean).length : 0;
    while (!stop) {
      await page.waitForTimeout(5000);
      const batch = await page.evaluate(() => {
        const s = window.__motion;
        const ev = s.events.splice(0, s.events.length);
        return { ev, frames: s.frames, late: s.late, walked: s.walked, length: s.length, legs: s.route.length, leg: s.pos.leg, i: s.pos.i, done: s.done, x: s.pos.x, z: s.pos.z, median: s.median };
      });
      for (const e of batch.ev) {
        e.id = `e${String(saved++).padStart(5, '0')}`;
        fs.writeFileSync(path.join(motionDir, `${e.id}.jpg`), Buffer.from(e.jpeg.split(',')[1], 'base64'));
        delete e.jpeg;
        fs.appendFileSync(eventsFile, `${JSON.stringify(e)}\n`);
      }
      Object.assign(report, { frames: batch.frames, late: batch.late, walkedM: Math.round(batch.walked), routeM: Math.round(batch.length), legs: batch.legs, leg: batch.leg, i: batch.i, medianMs: batch.median, events: saved, minutes: +((Date.now() - t0) / 60000).toFixed(1), at: [batch.x, batch.z] });
      fs.writeFileSync(walkFile, JSON.stringify(report));
      if (batch.done) stop = 'walked everything';
      else if ((Date.now() - t0) / 1000 > seconds) stop = 'time';
      else if (fs.existsSync(stopFile)) stop = 'stop file';
      else if (freeGB() < 5) stop = 'disk under 5 GB';
      else if (!power.online && power.pct < 25) stop = 'battery under 25 %';
    }
    report.stop = stop;
    report.pageErrors = errors.slice(0, 5);
    fs.writeFileSync(walkFile, JSON.stringify(report));
  }
} catch (e) {
  report.error = String(e?.stack ?? e);
} finally {
  await browser?.close().catch(() => {});
  releaseLock();
  psPoll?.kill();
}
console.log(JSON.stringify(report).slice(0, 1500));
