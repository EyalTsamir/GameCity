// Lead QA probe: in-page A/B of runtime-switchable features (no reload noise). Alternates states
// A,B,A,B,… measuring the mean uncapped frame interval over --secs each (vsync/frame cap off, like perf.mjs).
//   node scripts/agent-tools/qa_toggleprobe.mjs --view harbor --hours 21.5 --probe refl|light|table|veg [--url …] [--secs 5] [--rounds 3]
import { launchBrowser, acquireLock, releaseLock } from '../browser.mjs';
const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const base = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const secs = parseFloat(args.secs ?? '5'), rounds = parseInt(args.rounds ?? '3', 10);
const PROBES = {
  refl: ['s.water.setReflectionQuality(2)', 's.water.setReflectionQuality(0)'],
  light: ['s.sky.setLegacy(false)', 's.sky.setLegacy(true)'],
  table: ['s.sky.setTable(true)', 's.sky.setTable(false)'],
  veg: ['s.vegetation.knobs.fx.value = 1', 's.vegetation.knobs.fx.value = 0'],
  vegcheap: ['s.vegetation.knobs.cheap.value = 0', 's.vegetation.knobs.cheap.value = 1'],
};
const [onCode, offCode] = PROBES[args.probe ?? 'refl'];
await acquireLock();
const { browser } = await launchBrowser({ extraArgs: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
try {
  const page = await browser.newPage({ viewport: { width: parseInt(args.width ?? '1600'), height: parseInt(args.height ?? '900') } });
  await page.goto(base + '?nointro&noidle&adaptive=0&quality=high', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city?.ctx?.services?.camera, null, { timeout: 300000 });
  await page.evaluate(([v, h]) => { window.__city.setHours(+h); window.__city.setSpeed(0); window.__city.view(v); }, [args.view ?? 'harbor', args.hours ?? '21.5']);
  await page.waitForTimeout(6000);
  const measure = (code) => page.evaluate(async ([code, secs]) => {
    const s = window.__city.ctx.services; (0, eval)(code);
    await new Promise((r) => setTimeout(r, 1500)); // settle (shader compile, target alloc)
    return await new Promise((res) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < secs * 1000) requestAnimationFrame(tick); else res((performance.now() - t0) / n); }; requestAnimationFrame(tick); });
  }, [code, secs]);
  const out = { probe: args.probe, view: args.view, hours: args.hours, on: [], off: [] };
  for (let r = 0; r < rounds; r++) { out.on.push(+(await measure(onCode)).toFixed(1)); out.off.push(+(await measure(offCode)).toFixed(1)); }
  const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  out.medOn = med(out.on); out.medOff = med(out.off); out.deltaPct = +((100 * (out.medOn - out.medOff)) / out.medOff).toFixed(1);
  console.log(JSON.stringify(out));
} finally { await browser.close(); releaseLock(); }
