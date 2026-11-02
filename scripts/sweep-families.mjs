#!/usr/bin/env node
// Merges the judges' answers into families, one cause with many instances, as they come, and writes docs/progress/sweep-findings.md,
// so fix sessions can start on the top ones before the whole set is done. Text only, one headless `claude -p` per batch.
//
//   node scripts/sweep-families.mjs                    merge what's new, then write the findings
//   ... --batch 40 --max-batches 5 --model claude-haiku-5-5 --min-sev 4
//   ... --consolidate                                  one pass that merges families that turned out to be the same cause
//   ... --render                                       only write the findings
//
// State: <out>/judged/families.json (resumes). Known items come from docs/progress/sweep-known.md and are tagged, not hidden.
// What a person has checked by eye, the owner in the code and a rough cost go by family id in docs/progress/sweep-family-notes.json,
// which this script reads and never writes. Touching <out>/STOP-JUDGES stops it too.

import fs from 'node:fs';
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
const judgedDir = path.join(outDir, 'judged');
const stateFile = path.join(judgedDir, 'families.json');
// (sorting text doesn't need the judges' model: Sonnet here cost $0.019 per subject, a fifth of the judging)
const model = args.model ?? 'claude-haiku-5-5';
const batchSize = parseInt(args.batch ?? '40', 10);
const maxBatches = parseInt(args['max-batches'] ?? '0', 10);
// (4: sorting every 3 cost $0.03-0.05 per subject, and the judges score harshly. Earlier 3s stay in the state, and the score ignores them)
const minSev = parseInt(args['min-sev'] ?? '4', 10);
const known = fs.readFileSync(path.join(root, 'docs/progress/sweep-known.md'), 'utf8');
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { families: [], merged: {}, cost: 0, lines: 0 };
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state));

const ask = (prompt) =>
  new Promise((resolve) => {
    const cmd = ['claude', '-p', '--model', model, '--output-format', 'json', '--tools', '""', '--strict-mcp-config', '--setting-sources', '""', '--no-session-persistence', '--system-prompt', '"You sort reports into families and answer with one JSON object, nothing else."'].join(' ');
    const child = spawn(cmd, { cwd: judgedDir, shell: true, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    child.stdout.on('data', (b) => (out += b));
    child.stderr.on('data', () => {});
    child.stdin.end(prompt);
    child.on('close', () => {
      try {
        const r = JSON.parse(out);
        state.cost += r.total_cost_usd ?? 0;
        const m = /\{[\s\S]*\}/.exec(r.result ?? '');
        resolve(m ? JSON.parse(m[0]) : null);
      } catch {
        resolve(null);
      }
    });
  });

const familyList = () => state.families.map((f) => `${f.id}: ${f.title} (${new Set(f.instances.map((i) => i.id)).size} places)`).join('\n') || '(none yet)';

const mergeBatch = async (files) => {
  const lines = [];
  for (const file of files) {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const raw of String(j.result).split('\n')) {
      const p = raw.replace(/^`|`$/g, '').split('|').map((x) => x.trim());
      const sev = /^[1-5]$/.test(p[0]) ? +p[0] : 0;
      if (p.length < 4 || sev < minSev) continue;
      lines.push({ id: j.id, part: j.part, h: j.h, group: j.group, sev, img: p[1], thing: p[2], why: p.slice(3).join(' | ') });
    }
  }
  if (lines.length) {
    const prompt = `Judges looked at pictures of a procedural city, one place or kind of thing at a time. Sort their reports into families. A family is ONE CAUSE in the code or the assets with many instances (for example "people have blank faces and rigid poses", "shop windows read as flat pictures"), not one place. Things that would be fixed by the same system belong together; don't make a family for a single place unless it really is one object. Same flaw in different words: same family.

Existing families (use these ids when a report fits):
${familyList()}

Flaws already known to the project, for the "known" field of a NEW family, a short quote from the matching line, or null:
${known}

Reports, numbered: subject, then the thing and why it reads as fake.
${lines.map((l, i) => `${i}. [${l.part === 'objects' ? l.id : 'cell'}] ${l.thing} — ${l.why}`).join('\n')}

Answer with one JSON object:
{"new":[{"id":"kebab-case-id","title":"short plain title of the cause","known":null}],"assign":{"<report number>":"<family id>"}}
Every report gets a family. A report that names no real flaw gets "not-a-flaw".`;
    const a = await ask(prompt);
    if (!a?.assign) return false;
    for (const n of a.new ?? []) if (!state.families.some((f) => f.id === n.id)) state.families.push({ id: n.id, title: n.title, known: n.known ?? null, instances: [] });
    for (const [k, fid] of Object.entries(a.assign)) {
      const l = lines[+k];
      if (!l || fid === 'not-a-flaw') continue;
      let f = state.families.find((q) => q.id === fid);
      if (!f) {
        f = { id: fid, title: fid.replace(/-/g, ' '), known: null, instances: [] };
        state.families.push(f);
      }
      f.instances.push(l);
      state.lines++;
    }
  }
  return true;
};

const consolidate = async () => {
  const a = await ask(`These families of flaws in a procedural city were made in batches. Some are the same cause under two names. Say which to merge; keep the distinction where the fix would be different.
${familyList()}
Answer with one JSON object: {"merge":[{"keep":"id","drop":["id","id"],"title":"better title or null"}]}`);
  for (const m of a?.merge ?? []) {
    const keep = state.families.find((f) => f.id === m.keep);
    if (!keep) continue;
    if (m.title) keep.title = m.title;
    for (const d of m.drop ?? []) {
      const f = state.families.find((q) => q.id === d);
      if (!f || f === keep) continue;
      keep.instances.push(...f.instances);
      keep.known ??= f.known;
      state.families = state.families.filter((q) => q !== f);
    }
  }
  save();
};

// ───────────────────────────────── the findings
const render = () => {
  for (const f of state.families) f.instances = f.instances.filter((i) => i.sev <= 5);
  const notesFile = path.join(root, 'docs/progress/sweep-family-notes.json');
  const notes = fs.existsSync(notesFile) ? JSON.parse(fs.readFileSync(notesFile, 'utf8')) : {};
  const summary = fs.existsSync(path.join(judgedDir, 'summary.json')) ? JSON.parse(fs.readFileSync(path.join(judgedDir, 'summary.json'), 'utf8')) : {};
  const scored = state.families.map((f) => {
    // reach times how badly it reads: each place counts once, at its worst
    const worst = new Map();
    const counted = f.instances.filter((i) => i.sev >= minSev);
    for (const i of counted) worst.set(i.id, Math.max(worst.get(i.id) ?? 0, i.sev));
    const score = [...worst.values()].reduce((a, s) => a + s, 0);
    const kinds = new Set(counted.filter((i) => i.part === 'objects').map((i) => i.id)).size;
    const cells = new Set(counted.filter((i) => i.part === 'squares').map((i) => i.id)).size;
    const mean = worst.size ? score / worst.size : 0;
    const ex = [];
    const seen = new Set();
    for (const i of [...f.instances].sort((a, b) => b.sev - a.sev)) {
      if (seen.has(i.id)) continue;
      seen.add(i.id);
      ex.push(i);
      if (ex.length >= 3) break;
    }
    return { f, score, kinds, cells, mean, ex };
  });
  scored.sort((a, b) => b.score - a.score);
  let md = `# Sweep findings\n\nGenerated by \`scripts/sweep-families.mjs\` from the judges' answers, updated as they come: **partial until this line says otherwise**. Judged so far: ${summary.subjects ?? 0} subjects, ${summary.images ?? 0} images. Rules: \`SWEEP.md\`. The pictures are under \`shots/sweep/\` in the city-sweep worktree, \`.claude/worktrees/gifted-goldwasser-f1fa64/\`.\n\n`;
  md += `Ranked by reach times how badly it reads: each place counts once, at its worst severity (1–5), from reports of ${minSev} or more. **A family is a judge's claim until "checked" says a person looked.** The city is frozen in these pictures: motion isn't judged here, and the temporal AA tearing is with sweep-fix-d. "Known" means it matches a line in \`sweep-known.md\`.\n\n`;
  if (notes._intro) md += `${notes._intro}\n`;
  md += `| # | family | score | kinds | cells | mean | known | checked by eye | owner, rough cost | examples |\n|---|---|---|---|---|---|---|---|---|---|\n`;
  const esc = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
  scored.forEach((r, i) => {
    const n = notes[r.f.id] ?? {};
    const ex = r.ex.map((e) => `\`${e.part}/${e.id}/${String(e.img).split(',')[0].trim().replace(/\.jpg$/, '')}\``).join(' ');
    md += `| ${i + 1} | **${esc(n.title ?? r.f.title)}** \`${r.f.id}\` | ${r.score} | ${r.kinds} | ${r.cells} | ${r.mean.toFixed(1)} | ${r.f.known ? esc(r.f.known).slice(0, 60) : ''} | ${esc(n.checked)} | ${esc(n.owner)} | ${ex} |\n`;
  });
  md += `\n## Top families, what the judges said\n`;
  for (const r of scored.slice(0, 15)) {
    md += `\n### ${esc(notes[r.f.id]?.title ?? r.f.title)} (\`${r.f.id}\`)\n`;
    for (const e of r.ex) md += `- ${e.sev}: \`${e.part}/${e.id}/${esc(e.img)}\`: ${esc(e.thing)}. ${esc(e.why)}\n`;
  }
  fs.writeFileSync(path.join(root, 'docs/progress/sweep-findings.md'), md);
  return scored.length;
};

if (args.consolidate) await consolidate();
if (!args.render && !args.consolidate) {
  const all = ['objects', 'squares'].flatMap((p) => {
    const d = path.join(judgedDir, p);
    return fs.existsSync(d) ? fs.readdirSync(d).map((n) => path.join(d, n)) : [];
  });
  const fresh = all.filter((f) => !state.merged[path.basename(f)]);
  let batches = 0;
  for (let k = 0; k < fresh.length; k += batchSize) {
    if (fs.existsSync(path.join(outDir, 'STOP-JUDGES')) || (maxBatches && batches >= maxBatches)) break;
    const part = fresh.slice(k, k + batchSize);
    if (!(await mergeBatch(part))) {
      console.log('a batch got no usable answer; left for the next run');
      continue;
    }
    for (const f of part) state.merged[path.basename(f)] = 1;
    save();
    batches++;
  }
}
const n = render();
save();
console.log(JSON.stringify({ families: n, mergedFiles: Object.keys(state.merged).length, lines: state.lines, cost: +state.cost.toFixed(2) }));
