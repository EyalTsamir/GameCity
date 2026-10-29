// F4 scratch: ray-pick screen pixels at a view → object names (node shots/f4/pick.mjs "x,y,z,d,yaw,pitch" "px,py;px,py" [q])
import { launchBrowser, acquireLock, releaseLock } from '../../scripts/browser.mjs';
const [view, pts, q = 'nointro&noidle'] = process.argv.slice(2);
await acquireLock();
const { browser } = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  await page.goto('http://127.0.0.1:5173/?' + q, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 600000, polling: 500 });
  const res = await page.evaluate(async ({ view, pts }) => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const [x, y, z, distance, yaw, pitch] = view.split(',').map(Number);
    window.__city.view({ target: { x, y, z }, distance, yaw, pitch });
    const cam = window.__city.ctx.camera;
    cam.updateMatrixWorld(true);
    const rc = new THREE.Raycaster();
    const out = [];
    for (const p of pts.split(';')) {
      const [px, py] = p.split(',').map(Number);
      rc.setFromCamera({ x: (px / 1280) * 2 - 1, y: -(py / 720) * 2 + 1 }, cam);
      const hits = rc.intersectObjects(window.__city.ctx.scene.children, true).slice(0, 4);
      out.push({ p, hits: hits.map((h) => ({ name: h.object.name, parent: h.object.parent?.name, type: h.object.type, d: +h.distance.toFixed(2), pt: [h.point.x, h.point.y, h.point.z].map((v) => +v.toFixed(2)), mat: h.object.material?.name })) });
    }
    return out;
  }, { view, pts });
  console.log(JSON.stringify(res, null, 1));
} finally {
  await browser.close();
  releaseLock();
}
