#!/usr/bin/env node
// Runs commands one after the other behind an AC-power guard: polls PowerStatus.PowerLineStatus every 3 s and kills
// the running step (with its browser) as soon as the laptop leaves AC. On battery frame times double, which reads
// exactly like a regression, so numbers from an interrupted run must be discarded.
//
//   node scripts/power-guard.mjs --out <dir> [--cwd <dir>] -- name1 node scripts/perf.mjs --a b -- name2 node x.mjs
//
// Each step's stdout + stderr goes to <dir>/<name>.txt, the guard's own log to <dir>/guard.txt and stdout.
// Exit: 0 = all steps done on AC, 3 = stopped by a power loss (or not on AC at the start), 1 = a step failed
// (the later steps still run).
import { spawn, spawnSync } from 'node:child_process';
import { openSync, appendFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';

const argv = process.argv.slice(2);
const opt = { out: '.', cwd: process.cwd() };
while (argv.length && argv[0] !== '--') {
  const k = argv.shift();
  if (k.startsWith('--')) opt[k.slice(2)] = argv.shift();
}
const steps = [];
for (const a of argv) {
  if (a === '--') steps.push([]);
  else steps[steps.length - 1].push(a);
}
mkdirSync(opt.out, { recursive: true });
const log = (s) => {
  const line = `${new Date().toTimeString().slice(0, 8)} ${s}`;
  console.log(line);
  appendFileSync(`${opt.out}/guard.txt`, line + '\n');
};

// One long-lived PowerShell: cheaper and quieter for the GPU numbers than spawning one per poll.
const POLL = 'Add-Type -AssemblyName System.Windows.Forms; while ($true) { [System.Windows.Forms.SystemInformation]::PowerStatus.PowerLineStatus.ToString(); [Console]::Out.Flush(); Start-Sleep -Seconds 3 }';
const ps = spawn('powershell', ['-NoProfile', '-Command', POLL], { stdio: ['ignore', 'pipe', 'ignore'] });
let child = null;
let current = '';
let lost = false;
let started = false;
let failed = false;

const finish = (code) => {
  try { ps.kill(); } catch { /* already gone */ }
  process.exit(code);
};

const run = (name, cmd, args) => new Promise((resolve) => {
  current = name;
  log(`start ${name}`);
  const fd = openSync(`${opt.out}/${name}.txt`, 'w');
  child = spawn(cmd, args, { cwd: opt.cwd, stdio: ['ignore', fd, fd] });
  child.on('exit', (code) => {
    child = null;
    log(`end ${name} exit ${code}`);
    if (code) failed = true;
    resolve(code);
  });
});

const go = async () => {
  for (const [name, cmd, ...args] of steps) {
    await run(name, cmd, args);
    if (lost) finish(3);
  }
  log('ALL DONE on AC');
  finish(failed ? 1 : 0);
};

createInterface({ input: ps.stdout }).on('line', (raw) => {
  const state = raw.trim();
  if (!state) return;
  if (state !== 'Online' && !lost) {
    lost = true;
    log(`POWER LOST (${state}) during ${current || 'start'}: stopping, discard this run`);
    if (child) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else finish(3);
    return;
  }
  if (!started && !lost) {
    started = true;
    go();
  }
});
