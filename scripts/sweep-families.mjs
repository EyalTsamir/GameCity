#!/usr/bin/env node
// Merges the judges' answers into families, one cause with many instances, as they come, and writes docs/progress/sweep-findings.md,
// so fix sessions can start on the top ones before the whole set is done. Text only, one headless `claude -p` per batch.
//
// Each answer carries a tag (scripts/sweep-judge-brief.md). The findings open with a ranked list per tag; `shape`, by kind, is the one
// fix sessions work through. Lists take no model. Only bug and fake lines, severity 4 and up, are sorted into families by one.
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
const judgedDir = path.join(outDir, args.judged ?? 'judged2');
const stateFile = path.join(judgedDir, 'families.json');
// (sorting text doesn't need the judges' model: Sonnet here cost $0.019 per subject, a fifth of the judging)
const model = args.model ?? 'claude-haiku-5-5';
const batchSize = parseInt(args.batch ?? '40', 10);
const maxBatches = parseInt(args['max-batches'] ?? '0', 10);
// (4: sorting every 3 cost $0.03-0.05 per subject, and the judges score harshly. Earlier 3s stay in the state, and the score ignores them)
const minSev = parseInt(args['min-sev'] ?? '4', 10);
const known = fs.readFileSync(path.join(root, 'docs/progress/sweep-known.md'), 'utf8');
// (a new state starts from the first brief's family names, so the ids in the notes keep meaning the same thing)
const firstBrief = path.join(outDir, 'judged', 'families.json');
const fresh0 = () => ({ families: fs.existsSync(firstBrief) ? JSON.parse(fs.readFileSync(firstBrief, 'utf8')).families.map((f) => ({ id: f.id, title: f.title, known: f.known, instances: [] })) : [], merged: {}, cost: 0, lines: 0 });
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : fresh0();
const save = () => {
  fs.mkdirSync(judgedDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state));
};
const TAGS = ['shape', 'thought', 'bug', 'fake'];
// `<1-5> | <tag> | <image> | <thing> | <why>`; a line with no known tag counts as fake
const parseAnswer = (j) => {
  const lines = [];
  for (const raw of String(j.result).split('\n')) {
    const p = raw.replace(/^[\s`]+|[\s`]+$/g, '').split('|').map((x) => x.trim());
    if (p.length < 4 || !/^[1-5]$/.test(p[0])) continue;
    const tagged = TAGS.includes(p[1].toLowerCase());
    const q = tagged ? p.slice(2) : p.slice(1);
    if (q.length < 2) continue;
    lines.push({ id: j.id, part: j.part, h: j.h, group: j.group, sev: +p[0], tag: tagged ? p[1].toLowerCase() : 'fake', img: q[0], thing: q[1], why: q.slice(2).join(' | ') });
  }
  return lines;
};

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
  // (shape and thought are listed by kind with no model: only what needs a common cause is sorted)
  const lines = files.flatMap((file) => parseAnswer(JSON.parse(fs.readFileSync(file, 'utf8')))).filter((l) => l.sev >= minSev && (l.tag === 'bug' || l.tag === 'fake'));
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

// ───────────────────────────────── the lists by tag, no model: these read the answers as they are
const esc = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
const imgOf = (l) => `shots/sweep/${l.part}/${l.id}/${String(l.img).split(/[,\s]/)[0].replace(/\.jpg$/, '')}.jpg`;
const answers = () =>
  ['objects', 'squares'].flatMap((p) => {
    const d = path.join(judgedDir, p);
    return fs.existsSync(d) ? fs.readdirSync(d).flatMap((n) => parseAnswer(JSON.parse(fs.readFileSync(path.join(d, n), 'utf8')))) : [];
  });
const planKinds = new Map(JSON.parse(fs.readFileSync(path.join(here, 'sweep-plan.json'), 'utf8')).kinds.map((k) => [k.id, k]));
const isAll = (l) => /^ALL\b/i.test(l.thing);

/** one row per kind: whole-subject shapes first, then the worst, then how many of them stand in the city */
const shapeByKind = (lines) => {
  const by = new Map();
  for (const l of lines) {
    if (l.tag !== 'shape' || l.part !== 'objects') continue;
    if (!by.has(l.id)) by.set(l.id, []);
    by.get(l.id).push(l);
  }
  const rows = [...by].map(([id, ls]) => {
    ls.sort((a, b) => Number(isAll(b)) - Number(isAll(a)) || b.sev - a.sev);
    return { id, ls, all: ls.some(isAll), worst: Math.max(...ls.map((l) => l.sev)), count: planKinds.get(id)?.count ?? 0, name: planKinds.get(id)?.name ?? id };
  });
  rows.sort((a, b) => Number(b.all) - Number(a.all) || b.worst - a.worst || b.count - a.count || b.ls.length - a.ls.length);
  return rows;
};
const shapeTable = (rows, things) => {
  let md = `| # | kind | in the city | worst | lines | image | what |\n|---|---|---|---|---|---|---|\n`;
  rows.forEach((r, i) => {
    md += `| ${i + 1} | ${r.all ? '**whole** ' : ''}\`${r.id}\` ${esc(r.name)} | ${r.count || ''} | ${r.worst} | ${r.ls.length} | \`${imgOf(r.ls[0])}\` | ${r.ls.slice(0, things).map((l) => esc(clip(l.thing, 110))).join('; ')} |\n`;
  });
  return md;
};
/** lines of a tag, worst first; each place gives its worst `perPlace` */
const lineTable = (lines, tag, perPlace, cap) => {
  const seen = new Map();
  const out = [];
  for (const l of lines.filter((q) => q.tag === tag).sort((a, b) => b.sev - a.sev)) {
    const k = seen.get(l.id) ?? 0;
    if (k >= perPlace) continue;
    seen.set(l.id, k + 1);
    out.push(l);
    if (cap && out.length >= cap) break;
  }
  let md = `| sev | place | image | thing | why |\n|---|---|---|---|---|\n`;
  for (const l of out) md += `| ${l.sev} | \`${l.id}\` | \`${imgOf(l)}\` | ${esc(clip(l.thing, 130))} | ${esc(clip(l.why, 130))} |\n`;
  return md;
};
// The tremble check's list, one row per cell at its worst view and hour (a cell shot again counts as the later reading).
const trembleTable = (cap) => {
  const f = path.join(outDir, 'tremble.jsonl');
  if (!fs.existsSync(f)) return { md: '', n: 0 };
  const last = new Map();
  for (const raw of fs.readFileSync(f, 'utf8').trim().split('\n')) {
    const t = JSON.parse(raw);
    last.set(`${t.id}|${t.h}|${t.view}`, t);
  }
  const worst = new Map();
  for (const t of last.values()) if (!worst.has(t.id) || t.area24 > worst.get(t.id).area24) worst.set(t.id, t);
  const rows = [...worst.values()].sort((a, b) => b.area24 - a.area24);
  let md = `| # | cell | view | hour | % of pixels, change ≥ 24 | % ≥ 8 | image |\n|---|---|---|---|---|---|---|\n`;
  rows.slice(0, cap).forEach((t, i) => {
    md += `| ${i + 1} | \`${t.id}\` | ${t.view} | ${t.h} | ${t.area24} | ${t.area8} | \`shots/sweep/squares/${t.id}/${String(t.h).replace('.', 'h')}_${t.view}.jpg\` |\n`;
  });
  return { md, n: rows.length };
};
// What the walk of scripts/sweep-motion.mjs flagged and the judges called a bug.
const motionTable = (cap) => {
  const d = path.join(outDir, 'motion', 'judged');
  if (!fs.existsSync(d)) return '';
  const rows = fs.readdirSync(d).flatMap((n) => {
    const j = JSON.parse(fs.readFileSync(path.join(d, n), 'utf8'));
    return parseAnswer({ ...j, part: 'motion', id: j.id }).filter((l) => l.tag === 'bug').map((l) => ({ ...l, at: j.at }));
  });
  rows.sort((a, b) => b.sev - a.sev);
  let md = `| sev | at (x, z), hour | image | thing | why |\n|---|---|---|---|---|\n`;
  for (const l of rows.slice(0, cap)) md += `| ${l.sev} | ${esc(l.at)} | \`shots/sweep/motion/${l.id}.jpg\` | ${esc(clip(l.thing, 130))} | ${esc(clip(l.why, 130))} |\n`;
  return rows.length ? md : '';
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
  const lines = answers();
  const count = (tag) => lines.filter((l) => l.tag === tag).length;
  const rows = shapeByKind(lines);
  const top = rows.filter((r) => (r.all && r.worst >= 3) || r.worst >= 4);
  let md = `# Sweep findings\n\nGenerated by \`scripts/sweep-families.mjs\` from the judges' answers, updated as they come: **partial until this line says otherwise**. Judged so far under the brief with tags: ${summary.subjects ?? 0} subjects, ${summary.images ?? 0} images. Rules: \`SWEEP.md\`. The pictures are under \`shots/sweep/\` in the city-sweep worktree, \`.claude/worktrees/gifted-goldwasser-f1fa64/\`.\n\n`;
  md += `What the user wants from it: "wow, the AI thought of everything, a city of small details". Every line is a judge's claim until a section says a person looked; the judges score harshly. The city is frozen in the pictures, so motion has its own two sections. Full lists, with every line: \`sweep-tag-shape.md\`, \`sweep-tag-thought.md\`, \`sweep-tag-bug.md\`, \`sweep-tag-fake.md\`. Answers under the first brief: \`sweep-findings-first-brief.md\`.\n\n`;
  if (notes._intro) md += `${notes._intro}\n`;
  md += `## shape: kinds that read as a plain primitive (${top.length} of ${rows.length} kinds with a shape line, ${count('shape')} lines)\n\nWhole-subject shapes first ("whole": the judge says the kind is nothing more than that shape), then the worst, then how many stand in the city. Severity 4 and up here; the rest in \`sweep-tag-shape.md\`.\n\n${shapeTable(top, 2)}\n`;
  const inCells = lines.filter((l) => l.tag === 'shape' && l.part === 'squares');
  if (inCells.length) md += `### shape, seen in the street squares (${inCells.length} lines, worst 40)\n\n${lineTable(lines.filter((l) => l.part === 'squares'), 'shape', 2, 40)}\n`;
  md += `## thought: the detail a person who cared would have put there (${count('thought')} lines, worst 40)\n\n${lineTable(lines, 'thought', 2, 40)}\n`;
  md += `## bug: plainly wrong (${count('bug')} lines, worst 40)\n\n${lineTable(lines, 'bug', 2, 40)}\n`;
  md += `## fake: everything else (${count('fake')} lines, worst 25; families below sort these and the bugs by cause)\n\n${lineTable(lines, 'fake', 1, 25)}\n`;
  const tr = trembleTable(40);
  if (tr.n) md += `## Flicker: the tremble check by cell, worst 40 of ${tr.n}\n\nThree consecutive frames with the city running, one view per cell and hour: how much of the picture reversed or jumped. ${notes._tremble ?? ''}\n\n${tr.md}\n`;
  const mo = motionTable(60);
  if (mo) md += `## Motion: what the walk flagged and the judges called a bug\n\nFrom \`scripts/sweep-motion.mjs\`: before, at and after the sudden change, the red box marks it.\n\n${mo}\n`;
  for (const tag of TAGS) {
    const body = tag === 'shape' ? `${shapeTable(rows, 6)}\n### In the street squares\n\n${lineTable(lines.filter((l) => l.part === 'squares'), 'shape', 99, 0)}` : lineTable(lines, tag, 99, 0);
    fs.writeFileSync(path.join(root, `docs/progress/sweep-tag-${tag}.md`), `# Sweep: every \`${tag}\` line\n\nGenerated by \`scripts/sweep-families.mjs\`, partial while the judges run. ${count(tag)} lines so far.\n\n${body}`);
  }
  md += `## Families: bugs and fakes sorted by cause\n\nRanked by reach times how badly it reads: each place counts once, at its worst severity (1–5), from reports of ${minSev} or more. "Known" means it matches a line in \`sweep-known.md\`.\n\n`;
  md += `| # | family | score | kinds | cells | mean | tags | known | checked by eye | owner, rough cost | examples |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
  scored.forEach((r, i) => {
    if (!r.score) return;
    const n = notes[r.f.id] ?? {};
    const ex = r.ex.map((e) => `\`${e.part}/${e.id}/${String(e.img).split(',')[0].trim().replace(/\.jpg$/, '')}\``).join(' ');
    const tagN = (t) => r.f.instances.filter((q) => q.tag === t).length;
    md += `| ${i + 1} | **${esc(n.title ?? r.f.title)}** \`${r.f.id}\` | ${r.score} | ${r.kinds} | ${r.cells} | ${r.mean.toFixed(1)} | ${tagN('bug')} bug, ${tagN('fake')} fake | ${r.f.known ? esc(r.f.known).slice(0, 60) : ''} | ${esc(n.checked)} | ${esc(n.owner)} | ${ex} |\n`;
  });
  md += `\n## Top families, what the judges said\n`;
  for (const r of scored.slice(0, 15)) {
    if (!r.score) continue;
    md += `\n### ${esc(notes[r.f.id]?.title ?? r.f.title)} (\`${r.f.id}\`)\n`;
    for (const e of r.ex) md += `- ${e.sev} ${e.tag ?? ''}: \`${e.part}/${e.id}/${esc(e.img)}\`: ${esc(e.thing)}. ${esc(e.why)}\n`;
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
