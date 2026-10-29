// In-page instruments shared by hitch.mjs / soak.mjs / perf.mjs (no effect on the app unless installed).
//
//   installRecorder(page)      — before page.goto: records every rAF timestamp, JS heap per frame, long tasks
//   readFrames(page, from)     — the recorded slice since index `from` (use recMark(page) to get an index)
//   frameStats(slice)          — mean / p50 / p95 / p99 / max frame interval, jank (> 25 ms), hitch (> 50 ms),
//                                freeze (> 100 ms), GC drops, allocation rate, long tasks
//   installGpuProfiler(page)   — after the city is ready, with ?adaptive=0 (postfx's own timer query must be off):
//                                wraps renderer.render / shadowMap.render in TIME_ELAPSED queries labelled
//                                shadow / scene / refl (ctx.scene with another camera) / post / other
//   readGpu(page) / resetGpu(page)

export async function installRecorder(page) {
  await page.addInitScript(() => {
    const R = (window.__rec = { t: [], heap: [], lt: [] });
    // performance.memory is a snapshot object: read it anew every frame
    const loop = (ts) => {
      R.t.push(ts);
      R.heap.push(performance.memory ? performance.memory.usedJSHeapSize : 0);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) R.lt.push([e.startTime, e.duration]);
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      /* no long-task API */
    }
  });
}

export const recMark = (page) => page.evaluate(() => ({ i: window.__rec.t.length, l: window.__rec.lt.length, now: performance.now() }));

export async function readFrames(page, from) {
  return page.evaluate((f) => {
    const R = window.__rec;
    const r = window.__city?.ctx?.renderer;
    return {
      t: R.t.slice(f.i),
      heap: R.heap.slice(f.i),
      lt: R.lt.slice(f.l),
      now: performance.now(),
      programs: r?.info.programs?.length ?? 0,
      // program identities (three's cacheKey ends with the material's customProgramCacheKey, else the shader name)
      progKeys: (r?.info.programs ?? []).map((p) => `${p.name}:${String(p.cacheKey).split(',').pop().slice(0, 48)}`),
      geometries: r?.info.memory.geometries ?? 0,
      textures: r?.info.memory.textures ?? 0,
    };
  }, from);
}

const pct = (s, p) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0);
const r2 = (v) => Math.round(v * 100) / 100;

export function frameStats(slice) {
  const d = [];
  for (let i = 1; i < slice.t.length; i++) d.push(slice.t[i] - slice.t[i - 1]);
  const s = [...d].sort((a, b) => a - b);
  const span = slice.t.length > 1 ? slice.t[slice.t.length - 1] - slice.t[0] : 0;
  // GC: a drop of the used heap between two frames; allocation: the rises
  let gc = 0,
    gcMB = 0,
    alloc = 0;
  for (let i = 1; i < slice.heap.length; i++) {
    const dh = slice.heap[i] - slice.heap[i - 1];
    if (dh < -256 * 1024) {
      gc++;
      gcMB -= dh / 1048576;
    } else if (dh > 0) alloc += dh;
  }
  const worst = [];
  for (let i = 0; i < d.length; i++) if (d[i] > 50) worst.push([r2(slice.t[i]), r2(d[i])]);
  return {
    frames: d.length,
    meanMs: r2(span / Math.max(1, d.length)),
    p50: r2(pct(s, 0.5)),
    p95: r2(pct(s, 0.95)),
    p99: r2(pct(s, 0.99)),
    max: r2(s[s.length - 1] ?? 0),
    jank25: d.filter((v) => v > 25).length,
    hitch50: d.filter((v) => v > 50).length,
    freeze100: d.filter((v) => v > 100).length,
    gcDrops: gc,
    gcMB: r2(gcMB),
    allocMBs: r2(alloc / 1048576 / Math.max(1e-3, span / 1000)),
    longTasks: slice.lt.length,
    longTaskMs: r2(slice.lt.reduce((a, b) => a + b[1], 0)),
    longTaskMax: r2(slice.lt.reduce((a, b) => Math.max(a, b[1]), 0)),
    worst: worst.slice(0, 12),
  };
}

export async function installGpuProfiler(page) {
  return page.evaluate(() => {
    const ctx = window.__city.ctx;
    const r = ctx.renderer;
    const gl = r.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return false;
    // queries only between resetGpu and readGpu (P.on), so frame-time windows in the same page stay unperturbed
    const P = (window.__gpu = { sums: {}, start: 0, frame: 0, lastDone: -1, on: false });
    const pool = [];
    const pending = [];
    let active = null,
      label = null;
    const begin = (l) => {
      if (active) {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        pending.push([active, label, P.frame]);
        active = null;
      }
      if (!l || !P.on) return;
      active = pool.pop() ?? gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, active);
      label = l;
    };
    const poll = () => {
      while (pending.length) {
        const [q, l, f] = pending[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        pending.shift();
        pool.push(q);
        if (!disjoint && f >= P.start) {
          P.sums[l] = (P.sums[l] ?? 0) + ms;
          P.lastDone = f;
        }
      }
    };
    const render = r.render;
    r.render = function (scene, camera) {
      const prev = label;
      begin(scene === ctx.scene ? (camera === ctx.camera ? 'scene' : 'refl') : 'post');
      render.call(this, scene, camera);
      begin(prev);
    };
    const sm = r.shadowMap;
    const smRender = sm.render;
    sm.render = function (...a) {
      const prev = label;
      begin('shadow');
      smRender.apply(this, a);
      begin(prev);
    };
    const tick = () => {
      begin(null);
      P.frame++;
      poll();
      begin('other');
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  });
}

export const resetGpu = (page) =>
  page.evaluate(() => {
    const P = window.__gpu;
    P.sums = {};
    P.start = P.frame + 1;
    P.lastDone = -1;
    P.on = true;
  });

export const readGpu = (page) =>
  page.evaluate(async () => {
    const P = window.__gpu;
    P.on = false;
    // let the last queries resolve
    for (let k = 0; k < 6; k++) await new Promise((r) => requestAnimationFrame(r));
    const n = Math.max(1, P.lastDone - P.start + 1);
    const out = {};
    let total = 0;
    for (const [k, v] of Object.entries(P.sums)) {
      out[k] = Math.round((v / n) * 100) / 100;
      total += v / n;
    }
    out.total = Math.round(total * 100) / 100;
    out.frames = n;
    return out;
  });

// Per-draw GPU cost of the main view: wraps every renderable's onBeforeRender/onAfterRender (main camera only) in a
// TIME_ELAPSED query; objects created later are picked up by re-scanning. Use with ?adaptive=0 and WITHOUT
// installGpuProfiler (queries cannot nest). readDraws(page) → [{ label, ms (per frame), calls, tris }] sorted by ms.
export async function installDrawProfiler(page) {
  return page.evaluate(() => {
    const ctx = window.__city.ctx;
    const gl = ctx.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return false;
    const D = (window.__draws = { rows: new Map(), start: 0, frame: 0, lastDone: -1 });
    const pool = [];
    const pending = [];
    let active = null;
    const labelOf = (o) => {
      const parts = [];
      for (let p = o; p && p !== ctx.scene && parts.length < 4; p = p.parent) if (p.name) parts.unshift(p.name);
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      const kind = o.isInstancedMesh ? `inst${o.count}` : o.isPoints ? 'points' : o.isLine ? 'line' : o.isSprite ? 'sprite' : 'mesh';
      return `${parts.join('/') || '?'} [${kind} ${mat?.type ?? ''}${mat?.name ? ':' + mat.name : ''}]#${o.id}`;
    };
    const wrap = (o) => {
      if (o.__dp || !(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      o.__dp = labelOf(o);
      const b = o.onBeforeRender,
        a = o.onAfterRender;
      o.onBeforeRender = function (r, s, cam, geo, mat, grp) {
        b.call(this, r, s, cam, geo, mat, grp);
        if (cam !== ctx.camera || active) return;
        active = pool.pop() ?? gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, active);
        const idx = geo.index ? geo.index.count : geo.attributes.position?.count ?? 0;
        const inst = this.isInstancedMesh ? this.count : geo.isInstancedBufferGeometry ? geo.instanceCount : 1;
        active.__l = this.__dp;
        active.__t = ((grp ? grp.count : idx) / 3) * (inst === Infinity ? 1 : inst);
      };
      o.onAfterRender = function (r, s, cam, geo, mat, grp) {
        if (cam === ctx.camera && active) {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          pending.push([active, active.__l, active.__t, D.frame]);
          active = null;
        }
        a.call(this, r, s, cam, geo, mat, grp);
      };
    };
    const scan = () => ctx.scene.traverse(wrap);
    scan();
    const tick = () => {
      D.frame++;
      if (D.frame % 30 === 0) scan();
      while (pending.length) {
        const [q, l, t, f] = pending[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        pending.shift();
        pool.push(q);
        if (disjoint || f < D.start) continue;
        const row = D.rows.get(l) ?? { ms: 0, calls: 0, tris: 0 };
        row.ms += ms;
        row.calls++;
        row.tris += t;
        D.rows.set(l, row);
        D.lastDone = f;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  });
}

export const resetDraws = (page) =>
  page.evaluate(() => {
    const D = window.__draws;
    D.rows.clear();
    D.start = D.frame + 1;
    D.lastDone = -1;
  });

export const readDraws = (page) =>
  page.evaluate(() => {
    const D = window.__draws;
    const n = Math.max(1, D.lastDone - D.start + 1);
    return [...D.rows]
      .map(([label, r]) => ({ label, ms: Math.round((r.ms / n) * 1000) / 1000, calls: Math.round((r.calls / n) * 10) / 10, tris: Math.round(r.tris / Math.max(1, r.calls)) }))
      .sort((a, b) => b.ms - a.ms);
  });
