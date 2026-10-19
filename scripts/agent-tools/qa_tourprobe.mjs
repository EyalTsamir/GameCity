// Lead QA probe: start the auto-tour (T) and sample camera state + caption + fps every 2 s for 30 s.
//   node scripts/agent-tools/qa_tourprobe.mjs [url]
import { launchBrowser, acquireLock, releaseLock } from '../browser.mjs';
const url = (process.argv[2] ?? 'http://127.0.0.1:5173/') + '?noidle&nointro&adaptive=0&quality=high';
await acquireLock();
const { browser } = await launchBrowser({});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city?.ctx?.services?.camera, null, { timeout: 300000 });
  await page.waitForTimeout(8000);
  await page.mouse.click(640, 360);
  await page.keyboard.press('KeyT');
  const out = [];
  for (let i = 0; i < 16; i++) {
    out.push(await page.evaluate(() => {
      const c = window.__city.ctx.services.camera;
      const s = c.getState();
      const st = window.__city.stats?.() ?? {};
      return { t: Math.round(performance.now() / 100) / 10, mode: c.mode(), yaw: s.yaw && +(+s.yaw).toFixed(1), dist: s.distance && Math.round(s.distance),
        tx: s.target && Math.round(s.target.x), tz: s.target && Math.round(s.target.z),
        cap: document.querySelector('.th-caption.show .th-cap-title')?.textContent ?? null, fps: st.fps ?? st.frame?.fps };
    }));
    await page.waitForTimeout(2000);
  }
  console.log(JSON.stringify(out));
} finally { await browser.close(); releaseLock(); }
