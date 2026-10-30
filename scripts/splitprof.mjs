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
import { installGpuProfiler, resetGpu, readGpu, installDrawProfiler, resetDraws, readDraws } from './framerec.mjs';
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
  } else if (mode === 'split' || mode === 'vdraws') {
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
    if (mode === 'vdraws') {
      // the draw ranking with the main view scissored to 1x1: vertices + binning per draw, no shading
      await installDrawProfiler(page);
      await page.evaluate(() => (window.__split.mode = 'scissor'));
      for (const h of hours)
        for (const v of views) {
          await go(page, v.spec, h);
          await page.waitForTimeout(3000);
          await resetDraws(page);
          await page.waitForTimeout(Math.max(seconds, 3) * 1000);
          const rows = (await readDraws(page)).filter((r) => r.ms < 1000);
          out.results.push({ view: v.name, hours: h, rows });
          console.log(`
== ${v.name} @ ${h}h vertex/binning sum ${rows.reduce((a, r) => a + r.ms, 0).toFixed(1)} ms`);
          for (const r of rows.slice(0, parseInt(args.top ?? '22', 10))) console.log(r.ms.toFixed(2).padStart(7), String(r.tris).padStart(8), r.label.slice(0, 70));
        }
      if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 1));
      await browser.close().catch(() => {});
      releaseLock();
      process.exit(0);
    }
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
  } else if (mode === 'passes') {
    // every framebuffer bind of a frame starts a new TIME_ELAPSED query: ms per render-pass segment, in frame order,
    // with the viewport size, draw calls and whether the segment cleared
    await page.evaluate(() => {
      const r = window.__city.ctx.renderer;
      const gl = r.getContext();
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const P = (window.__pp = { on: false, rows: new Map(), frames: 0 });
      const pool = [],
        pending = [];
      let seg = 0,
        active = null,
        cur = null,
        vw = 0,
        vh = 0;
      const close = () => {
        if (!active) return;
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        pending.push([active, cur]);
        active = null;
      };
      const open = () => {
        close();
        if (!P.on) return;
        active = pool.pop() ?? gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, active);
        cur = { i: seg++, draws: 0, tris: 0, w: vw, h: vh, clear: 0 };
      };
      const bind = gl.bindFramebuffer.bind(gl);
      gl.bindFramebuffer = (t, f) => {
        bind(t, f);
        if (t !== gl.READ_FRAMEBUFFER) open();
      };
      const vp = gl.viewport.bind(gl);
      gl.viewport = (x, y, w, h) => {
        vw = w;
        vh = h;
        if (cur) {
          cur.w = w;
          cur.h = h;
        }
        vp(x, y, w, h);
      };
      const clr = gl.clear.bind(gl);
      gl.clear = (m) => {
        if (cur) cur.clear |= m;
        clr(m);
      };
      for (const n of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const f = gl[n].bind(gl);
        gl[n] = (...a) => {
          if (cur) {
            cur.draws++;
            cur.tris += n.includes('Elements') ? a[1] / 3 : a[2] / 3;
          }
          f(...a);
        };
      }
      const tick = () => {
        close();
        seg = 0;
        P.frames++;
        while (pending.length) {
          const [q, c] = pending[0];
          if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
          const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
          pending.shift();
          pool.push(q);
          if (!P.on) continue;
          const key = `${String(c.i).padStart(2, '0')} ${c.w}x${c.h}`;
          const row = P.rows.get(key) ?? { ms: 0, n: 0, draws: 0, tris: 0, clear: c.clear };
          row.ms += ms;
          row.n++;
          row.draws += c.draws;
          row.tris += c.tris;
          P.rows.set(key, row);
        }
        open();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    for (const h of hours)
      for (const v of views) {
        await go(page, v.spec, h);
        await page.waitForTimeout(3000);
        const rows = await page.evaluate(async (sec) => {
          const P = window.__pp;
          P.rows.clear();
          P.frames = 0;
          P.on = true;
          await new Promise((res) => setTimeout(res, sec * 1000));
          P.on = false;
          await new Promise((res) => setTimeout(res, 300));
          const n = Math.max(1, P.frames);
          return [...P.rows].map(([k, x]) => ({ seg: k, ms: +(x.ms / x.n).toFixed(3), seen: +(x.n / n).toFixed(2), draws: Math.round(x.draws / x.n), kTris: Math.round(x.tris / x.n / 1000), clear: x.clear })).sort((a, b) => (a.seg < b.seg ? -1 : 1));
        }, Math.max(seconds, 3));
        out.results.push({ view: v.name, hours: h, rows });
        console.log(`\n== ${v.name} @ ${h}h, sum ${rows.reduce((s, r) => s + r.ms * r.seen, 0).toFixed(2)} ms`);
        console.table(rows);
      }
  } else if (mode === 'overdraw') {
    const top =parseInt(args.top ?? '40', 10);
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
            // state is forced right before the GL draw: three sets its own blend state after onBeforeRender
            let mainDraw = false;
            let base0 = 0;
            for (const n of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'multiDrawArraysWEBGL', 'multiDrawElementsWEBGL']) {
              const fn = gl[n];
              if (!fn) continue;
              gl[n] = function (...a) {
                if (on && mainDraw) force();
                return fn.apply(gl, a);
              };
            }
            const res = new Map();
            let first = new Map();
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
                if (cam === ctx.camera) {
                  mainDraw = true;
                  if (on && prev < 0) base0 = sum();
                }
              };
              o.onAfterRender = function (rr, s, cam, g, m, gr) {
                if (on && cam === ctx.camera) {
                  mainDraw = false;
                  const t = sum();
                  const l = labelOf(this);
                  const row = res.get(l) ?? { px: 0, calls: 0 };
                  // (the first draw's reading also holds the clear colour: taken from an empty read before it, below)
                  row.px += t - (prev < 0 ? base0 : prev);
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
                prev = -1; // the target's clear colour is in the first reading
                res.clear();
                on = true;
              }
              render.call(this, scene, camera);
              if (main) {
                // second pass over the finished depth buffer: what passes now is what is really visible, per draw
                first = new Map(res);
                res.clear();
                prev = sum();
                const ac = this.autoClear,
                  bg = scene.background,
                  au = this.shadowMap.autoUpdate,
                  mw = scene.matrixWorldAutoUpdate,
                  ob = scene.onBeforeRender;
                this.autoClear = false;
                scene.background = null;
                this.shadowMap.autoUpdate = false;
                scene.matrixWorldAutoUpdate = false;
                scene.onBeforeRender = () => {};
                render.call(this, scene, camera);
                this.autoClear = ac;
                scene.background = bg;
                this.shadowMap.autoUpdate = au;
                scene.matrixWorldAutoUpdate = mw;
                scene.onBeforeRender = ob;
                on = false;
              }
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
            const list = [...first].map(([label, x]) => {
              const vis = (res.get(label)?.px ?? 0) / screen,
                all = x.px / screen;
              return { label, shaded: +all.toFixed(3), visible: +vis.toFixed(3), wasted: +(all - vis).toFixed(3), calls: x.calls };
            }).sort((p, n) => n.wasted - p.wasted);
            const total = list.reduce((s, x) => s + x.shaded, 0);
            const wasted = list.reduce((s, x) => s + x.wasted, 0);
            return { total: +total.toFixed(3), wasted: +wasted.toFixed(3), screen, list: list.slice(0, topN) };
          },
          top,
        );
        out.results.push({ view: v.name, hours: h, ...rows });
        console.log(`\n== ${v.name} @ ${h}h: fragments shaded / screen = ${rows.total}, wasted ${rows.wasted}`);
        console.table(rows.list);
      }
  }
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 1));
