#!/usr/bin/env node
// Where the scene pass goes, without changing LODs or resolution (perf-deep round).
//
//   node scripts/splitprof.mjs --mode split --views "overview;street=5,1.5,-65,9,0,6" --hours 12 --url http://127.0.0.1:5192/
//     alternates windows in ONE page: base / main-view scene pass scissored to 1x1 px (= vertices, binning and state,
//     no shading) / main-view scene pass skipped (= the pass's own overhead). Prints GPU ms per pass per window.
//   node scripts/splitprof.mjs --mode overdraw --views … [--top 40]
//     every fragment shader's colour is replaced by a constant, the main-view pass is drawn additively with its real
//     depth state and draw order, and the target is read back after every draw: fragments that pass the depth test
//     per draw, and in total against the screen = what a perfect depth pre-pass could remove. Recompiles every program.
//   node scripts/splitprof.mjs --mode programs   census of the linked programs (size, lights, env map, shadow, keys).
//
// Options: --q extra query, --seconds window length (default 2), --cycles n (default 3).
import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import { installGpuProfiler, resetGpu, readGpu } from './framerec.mjs';
import fs from 'node:fs';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const baseUrl = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const mode = args.mode ?? 'split';
const seconds = parseFloat(args.seconds ?? '2');
const cycles = parseInt(args.cycles ?? '3', 10);
const hours = (args.hours ?? '12').split(',').map(Number);
const views = (args.views ?? 'overview')
  .split(';')
  .filter(Boolean)
  .map((s) => (s.includes('=') ? { name: s.slice(0, s.indexOf('=')), spec: s.slice(s.indexOf('=') + 1) } : { name: s, spec: s }));
const q = [args.q, 'adaptive=0', 'nointro', 'noidle'].filter(Boolean).join('&');
const go = (page, spec, h) =>
  page.evaluate(
    ([s, hh]) => {
      window.__city.setHours(hh);
      if (/^[a-z]/i.test(s)) window.__city.view(s);
      else {
        const [x, y, z, distance, yaw, pitch] = s.split(',').map(Number);
        window.__city.view({ target: { x, y, z }, distance, yaw, pitch });
      }
    },
    [spec, h],
  );

await acquireLock();
const out = { mode, url: `${baseUrl}?${q}`, results: [] };
const { browser } = await launchBrowser({ extraArgs: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1025 }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  if (mode === 'overdraw')
    await page.addInitScript(() => {
      const proto = WebGL2RenderingContext.prototype;
      const src = proto.shaderSource;
      proto.shaderSource = function (sh, s) {
        if (this.getShaderParameter(sh, this.SHADER_TYPE) === this.FRAGMENT_SHADER && /void\s+main\s*\(/.test(s) && /pc_fragColor|gl_FragColor/.test(s)) {
          const i = s.lastIndexOf('}');
          s = s.slice(0, i) + '\n#ifdef gl_FragColor\ngl_FragColor = vec4(1.0);\n#else\npc_fragColor = vec4(1.0);\n#endif\n' + s.slice(i);
        }
        return src.call(this, sh, s);
      };
    });
  await page.goto(out.url, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 3, null, { timeout: 600000 });

  if (mode === 'programs') {
    const rows = await page.evaluate(() => {
      const r = window.__city.ctx.renderer;
      const gl = r.getContext();
      return (r.info.programs ?? []).map((p) => {
        const sh = gl.getAttachedShaders(p.program);
        const f = sh.map((s) => gl.getShaderSource(s)).find((s) => /gl_FragColor|pc_fragColor|layout/.test(s) && !/gl_Position\s*=/.test(s)) ?? '';
        const v = sh.map((s) => gl.getShaderSource(s)).find((s) => /gl_Position\s*=/.test(s)) ?? '';
        const def = (n) => (new RegExp(`#define ${n} (\\d+)`).exec(f) ?? [])[1] ?? '';
        return { name: p.name, used: p.usedTimes, key: String(p.cacheKey).split(',').pop().slice(0, 32), fKB: +(f.length / 1024).toFixed(1), vKB: +(v.length / 1024).toFixed(1), dir: def('NUM_DIR_LIGHTS'), pt: def('NUM_POINT_LIGHTS'), spot: def('NUM_SPOT_LIGHTS'), hemi: def('NUM_HEMI_LIGHTS'), shad: def('NUM_DIR_LIGHT_SHADOWS'), env: /#define USE_ENVMAP/.test(f) ? 1 : 0, phys: /#define (USE_CLEARCOAT|USE_SHEEN|USE_TRANSMISSION|USE_IRIDESCENCE|USE_ANISOTROPY)/.exec(f)?.[1] ?? '', discard: (f.match(/\bdiscard\b/g) ?? []).length };
      });
    });
    rows.sort((a, b) => b.fKB - a.fKB);
    console.table(rows);
    const lights = await page.evaluate(() => {
      const l = [];
      window.__city.ctx.scene.traverse((o) => o.isLight && l.push({ type: o.type, name: o.name, visible: o.visible, intensity: o.intensity, shadow: !!o.castShadow }));
      return l;
    });
    console.table(lights);
    out.results = { rows, lights };
  } else if (mode === 'split') {
    await page.evaluate(() => {
      const ctx = window.__city.ctx;
      const r = ctx.renderer;
      const gl = r.getContext();
      const S = (window.__split = { mode: 'base', force: false });
      const sc = gl.scissor.bind(gl),
        en = gl.enable.bind(gl),
        dis = gl.disable.bind(gl);
      let last = [0, 0, 1920, 1025],
        on = false;
      gl.scissor = (x, y, w, h) => {
        last = [x, y, w, h];
        if (!S.force) sc(x, y, w, h);
      };
      gl.enable = (c) => {
        if (c === gl.SCISSOR_TEST) on = true;
        if (!(S.force && c === gl.SCISSOR_TEST)) en(c);
      };
      gl.disable = (c) => {
        if (c === gl.SCISSOR_TEST) on = false;
        if (!(S.force && c === gl.SCISSOR_TEST)) dis(c);
      };
      const lift = () => {
        S.force = false;
        sc(...last);
        (on ? en : dis)(gl.SCISSOR_TEST);
      };
      const render = r.render;
      r.render = function (scene, camera) {
        if (scene === ctx.scene && camera === ctx.camera && S.mode !== 'base') {
          if (S.mode === 'skip') {
            // only the shadow pass stays (three draws it inside render): no view to draw into
            const v = scene.visible;
            scene.visible = false;
            render.call(this, scene, camera);
            scene.visible = v;
            return;
          }
          en(gl.SCISSOR_TEST);
          sc(0, 0, 1, 1);
          S.force = true;
          render.call(this, scene, camera);
          lift();
          return;
        }
        render.call(this, scene, camera);
      };
      const sm = r.shadowMap;
      const smr = sm.render;
      sm.render = function (...a) {
        const was = S.force;
        if (was) lift();
        smr.apply(this, a);
        if (was) {
          en(gl.SCISSOR_TEST);
          sc(0, 0, 1, 1);
          S.force = true;
        }
      };
    });
    await installGpuProfiler(page);
    const sample = async (m) => {
      await page.evaluate((mm) => (window.__split.mode = mm), m);
      await page.waitForTimeout(600);
      await resetGpu(page);
      await page.waitForTimeout(seconds * 1000);
      return readGpu(page);
    };
    for (const h of hours)
      for (const v of views) {
        await go(page, v.spec, h);
        await page.waitForTimeout(2500);
        const acc = {};
        for (let c = 0; c < cycles; c++)
          for (const m of ['base', 'scissor', 'skip']) {
            const g = await sample(m);
            acc[m] ??= {};
            for (const [k, val] of Object.entries(g)) if (k !== 'frames') acc[m][k] = (acc[m][k] ?? 0) + val / cycles;
          }
        await page.evaluate(() => (window.__split.mode = 'base'));
        const r2 = (x) => Math.round((x ?? 0) * 100) / 100;
        const row = { view: v.name, hours: h };
        for (const m of Object.keys(acc)) for (const k of Object.keys(acc[m])) row[`${m}_${k}`] = r2(acc[m][k]);
        row.fragment = r2((acc.base.scene ?? 0) - (acc.scissor.scene ?? 0));
        row.vertexBin = r2((acc.scissor.scene ?? 0) - (acc.skip.scene ?? 0));
        row.passShell = r2(acc.skip.scene ?? 0);
        out.results.push(row);
        console.log(JSON.stringify(row));
      }
  } else if (mode === 'overdraw') {
    const top = parseInt(args.top ?? '40', 10);
    for (const h of hours)
      for (const v of views) {
        await go(page, v.spec, h);
        await page.waitForTimeout(2500);
        const rows = await page.evaluate(
          async (topN) => {
            const ctx = window.__city.ctx;
            const r = ctx.renderer;
            const gl = r.getContext();
            const blend = gl.blendFunc.bind(gl);
            const f = gl.getExtension('EXT_color_buffer_half_float');
            void f;
            let on = false;
            const bs = gl.blendFuncSeparate.bind(gl),
              be = gl.blendEquationSeparate.bind(gl),
              en = gl.enable.bind(gl),
              dis = gl.disable.bind(gl);
            const force = () => {
              en(gl.BLEND);
              be(gl.FUNC_ADD, gl.FUNC_ADD);
              bs(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
            };
            const buf = new Float32Array(4 * 1920 * 1025);
            const sum = () => {
              const fb = gl.getParameter(gl.FRAMEBUFFER_BINDING);
              const w = gl.getParameter(gl.VIEWPORT)[2],
                h2 = gl.getParameter(gl.VIEWPORT)[3];
              if (!fb) return 0;
              gl.readPixels(0, 0, w, h2, gl.RGBA, gl.FLOAT, buf);
              let t = 0;
              for (let i = 0; i < w * h2; i++) t += buf[i * 4];
              return t;
            };
            const res = new Map();
            let prev = 0,
              screen = 1;
            const objs = [];
            const labelOf = (o) => {
              const parts = [];
              for (let p = o; p && p !== ctx.scene && parts.length < 3; p = p.parent) if (p.name) parts.unshift(p.name);
              return parts.join('/') || `#${o.id}`;
            };
            ctx.scene.traverse((o) => {
              if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
              const b = o.onBeforeRender,
                a = o.onAfterRender;
              objs.push([o, b, a]);
              o.onBeforeRender = function (rr, s, cam, g, m, gr) {
                b.call(this, rr, s, cam, g, m, gr);
                if (on && cam === ctx.camera) force();
              };
              o.onAfterRender = function (rr, s, cam, g, m, gr) {
                if (on && cam === ctx.camera) {
                  // three's state cache believes its own blend state: force again before the next draw (above)
                  const t = sum();
                  const l = labelOf(this);
                  const row = res.get(l) ?? { px: 0, calls: 0 };
                  row.px += t - prev;
                  row.calls++;
                  res.set(l, row);
                  prev = t;
                  screen = gl.getParameter(gl.VIEWPORT)[2] * gl.getParameter(gl.VIEWPORT)[3];
                }
                a.call(this, rr, s, cam, g, m, gr);
              };
            });
            const render = r.render;
            r.render = function (scene, camera) {
              const main = scene === ctx.scene && camera === ctx.camera;
              if (main) {
                prev = 0;
                res.clear();
                on = true;
              }
              render.call(this, scene, camera);
              on = false;
            };
            // one frame (the pass clears its target first; the bloom / AO reads are harmless)
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            r.render = render;
            for (const [o, b, a] of objs) {
              o.onBeforeRender = b;
              o.onAfterRender = a;
            }
            void blend;
            void dis;
            const list = [...res].map(([label, x]) => ({ label, Mpx: +(x.px / 1e6).toFixed(3), calls: x.calls, ofScreen: +(x.px / screen).toFixed(3) })).sort((p, n) => n.Mpx - p.Mpx);
            const total = list.reduce((s, x) => s + x.ofScreen, 0);
            return { total: +total.toFixed(3), screen, list: list.slice(0, topN) };
          },
          top,
        );
        out.results.push({ view: v.name, hours: h, ...rows });
        console.log(`\n== ${v.name} @ ${h}h: fragments that passed depth / screen = ${rows.total}`);
        console.table(rows.list);
      }
  }
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 1));
