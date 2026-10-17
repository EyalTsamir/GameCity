// Shared browser launch + screenshot lock for the verification scripts.
//
// Default: the system Chrome with ANGLE/D3D11 (the real GPU on the dev machine).
// Fallback: a bundled Chromium with ANGLE/SwiftShader (software GL) — used automatically when no
// system Chrome is installed (e.g. a GPU-less Linux container), or forced with
// TH_BROWSER=<path to a chrome binary>. Software frames are ~10x slower and their timings say
// nothing about GPU cost (compare variants within one run only), but the picture is faithful.
//
// The lock (scripts/.shotlock) keeps one browser at a time across processes (TH_LOCK_SLOTS=n allows
// n at once — useful on a many-core machine running software GL). The holder refreshes
// it every few seconds, so a long software-rendered run is never mistaken for a stale lock; a lock
// whose holder process is gone is taken over at once.

import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// TH_LOCK_SLOTS=n lets n browsers run at once (slot 1 = scripts/.shotlock, slot k = .shotlock<k>)
const SLOTS = Math.max(1, parseInt(process.env.TH_LOCK_SLOTS ?? '1', 10) || 1);
const slotDir = (k) => path.join(here, k === 0 ? '.shotlock' : `.shotlock${k + 1}`);
let lockDir = slotDir(0);
const pidFileOf = (dir) => path.join(dir, 'pid');

const COMMON_ARGS = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];

function findBundledChromium() {
  if (process.env.TH_BROWSER) return process.env.TH_BROWSER;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean);
  for (const root of roots) {
    let dirs = [];
    try {
      dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
    } catch {
      continue;
    }
    for (const d of dirs) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-win/chrome.exe', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(root, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return null;
}

/**
 * Launch the test browser. Returns { browser, software } — `software` is true when frames are
 * rendered by SwiftShader (timings are then only meaningful relative to each other).
 */
export async function launchBrowser({ headless = true, extraArgs = [] } = {}) {
  const gpuArgs = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'];
  if (!process.env.TH_BROWSER) {
    try {
      const browser = await chromium.launch({ channel: 'chrome', headless, args: [...gpuArgs, ...COMMON_ARGS, ...extraArgs] });
      return { browser, software: false };
    } catch (err) {
      if (!/not found|no such file|ENOENT|executable doesn't exist/i.test(String(err?.message ?? err))) throw err;
    }
  }
  const executablePath = findBundledChromium();
  if (!executablePath) throw new Error('No system Chrome and no bundled Chromium found (set TH_BROWSER=<chrome binary>)');
  const swArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ executablePath, headless, args: [...swArgs, ...COMMON_ARGS, ...extraArgs] });
  return { browser, software: true };
}

function holderAlive(dir) {
  try {
    const pid = parseInt(fs.readFileSync(pidFileOf(dir), 'utf8'), 10);
    if (!pid) return false;
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === 'EPERM';
  }
}

let heartbeat = null;

/** Take the shared lock (waits up to `waitMs`). Released automatically on exit. */
export async function acquireLock({ waitMs = 1_800_000, staleMs = 120_000 } = {}) {
  const t0 = Date.now();
  let got = false;
  while (!got) {
    for (let k = 0; k < SLOTS && !got; k++) {
      const dir = slotDir(k);
      try {
        fs.mkdirSync(dir);
        fs.writeFileSync(pidFileOf(dir), String(process.pid));
        lockDir = dir;
        got = true;
      } catch {
        try {
          const st = fs.statSync(dir);
          // a fresh lock may not have its pid file yet: only judge it after a grace period
          const age = Date.now() - st.mtimeMs;
          if ((age > 5_000 && !holderAlive(dir)) || age > staleMs) fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          /* vanished between calls */
        }
      }
    }
    if (got) break;
    if (Date.now() - t0 > waitMs) throw new Error('timed out waiting for the screenshot lock (scripts/.shotlock)');
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
  }
  heartbeat = setInterval(() => {
    try {
      const now = new Date();
      fs.utimesSync(lockDir, now, now);
    } catch {
      /* ignore */
    }
  }, 5_000);
  heartbeat.unref();
}

export function releaseLock() {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  try {
    if (fs.readFileSync(pidFileOf(lockDir), 'utf8') === String(process.pid)) fs.rmSync(lockDir, { recursive: true, force: true });
  } catch {
    /* not ours / already gone */
  }
}

process.on('exit', releaseLock);
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    releaseLock();
    process.exit(130);
  });
}
