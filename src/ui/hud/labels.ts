// Floating district labels: little paper flags on pins standing on the model.
// They fade in when zoomed out, fade out when close, and fly to the district on click.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import type { District } from '../../core/plan';
import type { CameraServiceExt } from '../shared';

const SWATCH: Record<string, string> = {
  downtown: '#6f9fb8',
  midtown: '#8fa7bb',
  oldtown: '#e39b7b',
  market: '#e9b65a',
  residential: '#8fbf5a',
  suburb: '#9ccc65',
  industrial: '#b06a4c',
  harbor: '#5a6270',
  park: '#5f9e48',
  civic: '#e9c46a',
  stadium: '#4f9f80',
  station: '#8d6cab',
  beach: '#f2c94c',
  riverside: '#4aa3c4',
  hills: '#76a84b',
};

/** POI to fly to when a district label is clicked */
const DISTRICT_POI: Record<string, string> = {
  downtown: 'downtown',
  harbor: 'harbor',
  beach: 'beach',
  park: 'park',
  oldtown: 'oldtown',
  station: 'station',
  riverside: 'riverside',
  stadium: 'stadium',
  market: 'stadium',
  westbrook: 'westbrook',
  northgate: 'industry',
};

/** who wins when two flags would overlap (lower = more important) */
const PRIORITY: Record<string, number> = {
  downtown: 0,
  harbor: 1,
  oldtown: 2,
  park: 3,
  beach: 4,
  stadium: 5,
  station: 6,
  riverside: 7,
  westbrook: 8,
  northgate: 9,
  civic: 10,
  market: 11,
  midtown: 12,
  hills: 13,
};

interface Item {
  d: District;
  el: HTMLDivElement;
  tag: HTMLElement;
  pos: THREE.Vector3;
  shown: number;
  visible: boolean;
  /** tag size in CSS px (measured once it has been laid out) */
  w: number;
  h: number;
  sx: number;
  sy: number;
  /** NDC depth (for stacking) */
  z: number;
  want: number;
  prio: number;
}

export interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class DistrictLabels {
  readonly el: HTMLDivElement;
  private items: Item[] = [];
  private v = new THREE.Vector3();
  enabled = true;
  /** HUD panels (title, toolbar, minimap, info card…) the flags keep clear of */
  avoid: ScreenRect[] = [];
  /** seconds since the labels were allowed to appear (staggered reveal after the intro) */
  private reveal = -1;
  /** performance.now() of the first update (the first frame can come long after construction) */
  private born = -1;
  private order: Item[] = [];

  constructor(
    private ctx: CityContext,
    private cam: () => CameraServiceExt | null,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'th-labels';
    for (const d of ctx.plan.districts) {
      const el = document.createElement('div');
      el.className = 'th-dlabel';
      el.innerHTML = `<button class="th-dl-tag" type="button" tabindex="-1"><i style="background:${SWATCH[d.kind] ?? '#999'}"></i><span></span></button><span class="th-dl-stem"></span><span class="th-dl-dot"></span>`;
      (el.querySelector('span') as HTMLSpanElement).textContent = d.name;
      this.el.appendChild(el);
      const h = d.kind === 'hills' ? ctx.plan.heightAt(d.label.x, d.label.z) : 0;
      const tag = el.querySelector('.th-dl-tag') as HTMLElement;
      this.items.push({ d, el, tag, pos: new THREE.Vector3(d.label.x, Math.max(0, h) + 2, d.label.z), shown: 0, visible: false, w: 0, h: 0, sx: 0, sy: 0, z: 0, want: 0, prio: PRIORITY[d.id] ?? 20 });
    }
    this.order = [...this.items].sort((a, b) => a.prio - b.prio);
  }

  /**
   * The flag under a canvas position (flags are pointer-transparent so drags starting on them still
   * orbit; the camera asks here on a plain click).
   */
  hitTest(x: number, y: number): District | null {
    for (const it of this.order) {
      if (!it.visible || it.shown < 0.5) continue;
      const w = it.w || 110,
        h = it.h || 24;
      if (x >= it.sx - w / 2 && x <= it.sx + w / 2 && y >= it.sy - 24 - h && y <= it.sy - 24) return it.d;
    }
    return null;
  }

  /** hover look for the flag under the pointer (null: none) */
  setHover(d: District | null): void {
    if (d === this.hovered) return;
    this.hovered = d;
    for (const it of this.items) it.el.classList.toggle('th-dl-hover', it.d === d);
  }
  private hovered: District | null = null;

  fly(d: District): void {
    const cam = this.cam();
    if (!cam) return;
    const poi = DISTRICT_POI[d.id] ?? DISTRICT_POI[d.kind];
    if (poi && cam.pois().some((p) => p.id === poi)) cam.flyToPoi(poi);
    else cam.flyToPoint(d.label.x, d.label.z, 150);
  }

  private lastKey = '';
  private settled = false;

  update(dt: number): void {
    const cam = this.cam();
    const camera = this.ctx.camera;
    // nothing moved and every fade has finished → no DOM work this frame
    const m = camera.matrixWorld.elements;
    const following = !!cam?.following();
    const key = `${m[12].toFixed(2)},${m[13].toFixed(2)},${m[14].toFixed(2)},${m[8].toFixed(4)},${m[9].toFixed(4)},${m[10].toFixed(4)},${camera.fov.toFixed(2)},${this.ctx.size.width},${this.ctx.size.height},${this.enabled},${following}`;
    if (key === this.lastKey && this.settled && this.reveal > 2) return;
    this.lastKey = key;
    let moving = false;
    const W = this.ctx.size.width,
      H = this.ctx.size.height;
    const st = cam?.getState();
    const dist = st ? st.distance : 500;
    // wait for the establishing shot to land (time since the HUD started — the city itself can take
    // longer than that to load), then pop the flags in one by one
    if (this.reveal < 0) {
      if (this.born < 0) this.born = performance.now();
      const intro = cam ? cam.busy() && performance.now() - this.born < 9000 : false;
      if (!intro) this.reveal = 0;
    } else this.reveal += dt;
    // zoom fade: labels belong to the bird's-eye view
    const zoomAlpha = this.enabled && !following ? smoothstep(235, 300, dist) : 0;
    const k = 1 - Math.exp(-dt * 6);
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const stagger = this.reveal < 0 ? 0 : smoothstep(i * 0.07, i * 0.07 + 0.5, this.reveal);
      this.v.copy(it.pos).project(camera);
      const inFront = this.v.z < 1 && this.v.z > -1;
      it.sx = (this.v.x * 0.5 + 0.5) * W;
      it.sy = (-this.v.y * 0.5 + 0.5) * H;
      it.z = this.v.z;
      const onScreen = inFront && it.sx > -80 && it.sx < W + 80 && it.sy > 30 && it.sy < H + 20;
      // labels near the screen edges fade a little so they never crowd the UI
      const edge = onScreen ? Math.min(1, Math.min(it.sx, W - it.sx) / 90 + 0.25, Math.min(it.sy, H - it.sy) / 80 + 0.2) : 0;
      it.want = onScreen ? zoomAlpha * edge * stagger : 0;
    }
    // declutter: a flag that would overlap a more important one, or a HUD panel, steps aside (fades out)
    const placed: ScreenRect[] = [];
    for (const it of this.order) {
      if (it.want <= 0) continue;
      if (it.w === 0 && it.visible) {
        it.w = it.tag.offsetWidth;
        it.h = it.tag.offsetHeight;
      }
      const w = it.w || 110,
        h = it.h || 24;
      // the tag sits 24 px above its pin, centred on it
      const r = { x0: it.sx - w / 2 - 4, y0: it.sy - 24 - h - 3, x1: it.sx + w / 2 + 4, y1: it.sy + 4 };
      let clash = false;
      for (const q of placed) if (r.x0 < q.x1 && q.x0 < r.x1 && r.y0 < q.y1 && q.y0 < r.y1) clash = true;
      for (const q of this.avoid) if (r.x0 < q.x1 && q.x0 < r.x1 && r.y0 < q.y1 && q.y0 < r.y1) clash = true;
      if (clash) it.want = 0;
      else placed.push(r);
    }
    for (const it of this.items) {
      it.shown += (it.want - it.shown) * k;
      if (Math.abs(it.want - it.shown) > 0.004) moving = true;
      else it.shown = it.want;
      const vis = it.shown > 0.02;
      if (vis !== it.visible) {
        it.visible = vis;
        it.el.style.display = vis ? 'block' : 'none';
      }
      if (!vis) continue;
      it.el.style.opacity = it.shown.toFixed(3);
      it.el.style.transform = `translate3d(${it.sx.toFixed(1)}px, ${it.sy.toFixed(1)}px, 0)`;
      it.el.style.zIndex = String(1000 - Math.round(it.z * 500));
      it.el.classList.toggle('th-dl-click', it.shown > 0.5);
    }
    this.settled = !moving;
  }
}
