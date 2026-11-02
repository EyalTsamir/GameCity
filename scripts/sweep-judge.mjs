#!/usr/bin/env node
// The judges of the city sweep (docs/progress/SWEEP.md): one headless `claude -p` per subject, tool Read only, nothing but the
// pictures of that subject at that hour. Run it beside the capture: it needs no browser, and takes what's ready, in the capture's order.
//
//   node scripts/sweep-judge.mjs                 run until told to stop or everything is judged
//   ... --max-images 200                         stop after this many images (to measure what they cost)
//   ... --jobs 3 --model claude-sonnet-5-5 --out shots/sweep --night-views 3 --dry
//   ... --follow 0                               leave when nothing is ready, instead of waiting for the capture
//
// Stop: touch <out>/STOP-JUDGES. It's checked before every new judge, and those running finish.
// Writes <out>/judged2/<part>/<id>__<hour>.json (the answer, usage, cost), resumes by those files, and keeps totals in
// <out>/judged2/summary.json. An error like a usage limit stops the run, and no result file is written for it.
// RAM here is often under 2 GB: it drops to 2 judges under 1.2 GB free and starts none under 0.6 GB.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
// (judged2: answers under the brief with tags. Those under the first brief stay in judged/ and are never read again)
const judgedDir = path.join(outDir, args.judged ?? 'judged2');
const stopFile = path.join(outDir, 'STOP-JUDGES');
const model = args.model ?? 'claude-sonnet-5-5';
const maxJobs = parseInt(args.jobs ?? '3', 10);
const maxImages = parseInt(args['max-images'] ?? '0', 10);
// (1: walkable cells at night get one view since 2026-11-02, for the disk and the weekly limit; it must match the capture)
const nightViews = parseInt(args['night-views'] ?? '1', 10);
const follow = (args.follow ?? '1') !== '0';
const plan = JSON.parse(fs.readFileSync(path.join(here, 'sweep-plan.json'), 'utf8'));
const brief = fs.readFileSync(path.join(here, 'sweep-judge-brief.md'), 'utf8');
const HOURS = plan.hours;
const hourTag = (h) => String(h).replace('.', 'h');
const hourWord = (h) => (h >= 19 ? 'at night' : h < 11 ? 'in the morning' : h < 14 ? 'at noon' : h < 19 ? 'in the afternoon' : '');

// ───────────────────────────────── the subjects, in the capture's order (scripts/sweep.mjs, rankOf)
const VIEW_ORDER = ['N', 'E', 'S', 'W', 'down'];
const NIGHT_ORDER = ['N', 'S', 'down', 'E', 'W'];
const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
const subjects = [];
const specialHours = [...new Set(plan.kinds.flatMap((k) => k.hours ?? []))].filter((h) => !HOURS.includes(h)).sort((a, b) => a - b);
for (const h of [...HOURS, ...specialHours]) {
  for (const k of plan.kinds) {
    if (!(k.hours ?? HOURS).includes(h)) continue;
    let views = [];
    if (k.poi) views = ['poi'];
    else if (k.x !== undefined || k.find) {
      views = (k.dists ?? plan.dists).map((d) => `${d}m`);
      if (k.top) views.push('up', 'roof');
    }
    if (!views.length) continue;
    const rank = h === HOURS[0] ? 0 : h === HOURS[1] ? 2 : 4;
    const says = k.poi ? `a view over the city, "${k.name}"` : `${k.name}, from the distances in the image names${k.top ? ', from across the street (up) and over its roof (roof)' : ''}`;
    subjects.push({ rank, part: 'objects', id: k.id, h, views, group: k.group, says });
  }
  if (!HOURS.includes(h)) continue;
  for (const c of plan.cells) {
    const hoursOf = plan.hoursOf[c.type];
    if (hoursOf && !hoursOf.includes(h)) continue;
    const all = c.type === 'water' ? [VIEW_ORDER[hash(c.id) % 4]] : VIEW_ORDER;
    const views = h > 19 ? (nightViews === 1 ? [all[hash(c.id) % Math.min(4, all.length)]] : all.slice().sort((a, b) => NIGHT_ORDER.indexOf(a) - NIGHT_ORDER.indexOf(b)).slice(0, nightViews)) : all;
    const walk = c.type === 'walk' || c.type === 'walk-edge';
    const rank = h === HOURS[0] ? (walk ? 1 : 5) : walk ? 3 : 6;
    const place = c.type === 'far' ? 'a place in the countryside beyond the town' : c.type === 'water' ? 'open water' : `one ${c.S} m square of the city`;
    subjects.push({ rank, part: 'squares', id: c.id, h, views, group: c.type, says: `${place}, at eye height looking N, E, S and W, and looking down at the ground (the image names say which)` });
  }
}
subjects.sort((a, b) => a.rank - b.rank);
const resultOf = (s) => path.join(judgedDir, s.part, `${s.id}__${hourTag(s.h)}.json`);
const imagesOf = (s) => s.views.map((v) => `${hourTag(s.h)}_${v}.jpg`);
const dirOf = (s) => path.join(outDir, s.part, s.id);

const absentNow = () => {
  try {
    return new Set(JSON.parse(fs.readFileSync(path.join(outDir, 'absent.json'), 'utf8')));
  } catch {
    return new Set();
  }
};
/** the pictures of a subject once the capture has finished with it, else null */
const ready = (s, absent) => {
  const have = imagesOf(s).filter((n) => fs.existsSync(path.join(dirOf(s), n)));
  if (have.length === s.views.length) return have;
  if (s.part === 'objects' && absent.has(`${s.id}@${s.h}`)) return have.length ? have : [];
  return null;
};

if (args.dry) {
  const absent = absentNow();
  const done = subjects.filter((s) => fs.existsSync(resultOf(s))).length;
  const rdy = subjects.filter((s) => !fs.existsSync(resultOf(s)) && ready(s, absent)?.length).length;
  console.log(JSON.stringify({ subjects: subjects.length, images: subjects.reduce((a, s) => a + s.views.length, 0), done, readyNow: rdy, model }, null, 1));
  process.exit(0);
}

// ───────────────────────────────── one judge
const judge = (s, images) =>
  new Promise((resolve) => {
    const t0 = Date.now();
    const prompt = `${brief}\nSubject: ${s.says}, ${hourWord(s.h)}.\nImages in the current folder: ${images.join(' ')}`;
    const cmd = ['claude', '-p', '--model', model, '--output-format', 'json', '--tools', 'Read', '--allowedTools', 'Read', '--strict-mcp-config', '--setting-sources', '""', '--no-session-persistence', '--system-prompt', '"You judge images. Use only the Read tool. In your first response call Read once for every image listed, all together."'].join(' ');
    const child = spawn(cmd, { cwd: dirOf(s), shell: true, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '',
      err = '';
    child.stdout.on('data', (b) => (out += b));
    child.stderr.on('data', (b) => (err += b));
    const killer = setTimeout(() => child.kill(), 300000);
    child.stdin.end(prompt);
    child.on('close', () => {
      clearTimeout(killer);
      let r = null;
      try {
        r = JSON.parse(out);
      } catch {
        /* not JSON: an error below */
      }
      resolve({ r, ms: Date.now() - t0, err: (r ? '' : out + err).slice(0, 500) });
    });
  });

// ───────────────────────────────── the run
fs.mkdirSync(path.join(judgedDir, 'objects'), { recursive: true });
fs.mkdirSync(path.join(judgedDir, 'squares'), { recursive: true });
const summaryFile = path.join(judgedDir, 'summary.json');
const totals = fs.existsSync(summaryFile) ? JSON.parse(fs.readFileSync(summaryFile, 'utf8')) : { subjects: 0, images: 0, cost: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, errors: [] };
const thisRun = { images: 0, started: new Date().toISOString() };
const running = new Set();
let stopWhy = null;
const log = (m) => console.log(`${new Date().toTimeString().slice(0, 8)} ${m}`);

const limitNow = () => {
  const free = os.freemem() / 1e9;
  return free < 0.6 ? 0 : free < 1.2 ? Math.min(2, maxJobs) : maxJobs;
};
const take = () => {
  const absent = absentNow();
  for (const s of subjects) {
    if (s.taken || fs.existsSync(resultOf(s))) continue;
    const images = ready(s, absent);
    if (images === null) continue;
    if (!images.length) {
      s.taken = true;
      continue;
    }
    s.taken = true;
    return { s, images };
  }
  return null;
};

const runOne = async ({ s, images }) => {
  const { r, ms, err } = await judge(s, images);
  if (!r || r.is_error || typeof r.result !== 'string') {
    const why = String(r?.result ?? err ?? 'no answer').slice(0, 300);
    totals.errors.push({ at: new Date().toISOString(), id: s.id, h: s.h, why });
    if (/limit|quota|overloaded|429|credit/i.test(why)) stopWhy = `usage or rate limit: ${why}`;
    else if (totals.errors.length > 20 && totals.errors.slice(-10).every((e) => Date.now() - Date.parse(e.at) < 600000)) stopWhy = `ten errors in ten minutes: ${why}`;
    log(`error ${s.id} ${s.h}: ${why.slice(0, 120)}`);
    s.taken = false;
    s.failed = (s.failed ?? 0) + 1;
    if (s.failed >= 2) s.taken = true; // left for the next run
    return;
  }
  const u = r.usage ?? {};
  const line = { part: s.part, id: s.id, h: s.h, group: s.group, images, model, result: r.result, ms, cost: r.total_cost_usd, turns: r.num_turns, usage: { input: u.input_tokens, cacheRead: u.cache_read_input_tokens, cacheWrite: u.cache_creation_input_tokens, output: u.output_tokens } };
  fs.writeFileSync(resultOf(s), JSON.stringify(line, null, 1));
  totals.subjects++;
  totals.images += images.length;
  totals.cost += r.total_cost_usd ?? 0;
  totals.input += u.input_tokens ?? 0;
  totals.cacheRead += u.cache_read_input_tokens ?? 0;
  totals.cacheWrite += u.cache_creation_input_tokens ?? 0;
  totals.output += u.output_tokens ?? 0;
  thisRun.images += images.length;
  fs.writeFileSync(summaryFile, JSON.stringify(totals, null, 1));
  log(`${s.id} ${s.h}: ${images.length} images, $${(r.total_cost_usd ?? 0).toFixed(3)}, ${(ms / 1000).toFixed(0)} s, ${r.num_turns} turns; total ${totals.images} images, $${totals.cost.toFixed(2)}`);
};

log(`judges start: ${subjects.length} subjects, model ${model}, stop file ${stopFile}`);
for (;;) {
  if (fs.existsSync(stopFile)) stopWhy = 'stop file';
  if (maxImages && thisRun.images >= maxImages) stopWhy = `limit of ${maxImages} images`;
  if (stopWhy) break;
  if (running.size < limitNow()) {
    const job = take();
    if (job) {
      const p = runOne(job).finally(() => running.delete(p));
      running.add(p);
      continue;
    }
    if (!running.size && !follow) {
      stopWhy = 'nothing ready';
      break;
    }
    if (!running.size && subjects.every((s) => s.taken || fs.existsSync(resultOf(s)))) {
      stopWhy = 'all judged';
      break;
    }
  }
  await new Promise((res) => setTimeout(res, running.size >= maxJobs ? 1000 : 5000));
}
await Promise.all(running);
fs.writeFileSync(summaryFile, JSON.stringify(totals, null, 1));
log(`judges stop: ${stopWhy}; this run ${thisRun.images} images; total ${totals.images} images, $${totals.cost.toFixed(2)}`);
