// Minimap: a small painted top-down map of the plan (drawn once) with a live overlay:
// the camera's view footprint, the followed entity and live dots for buses / trains / boats
// when the simulation modules expose positions. Click to fly, drag to pan.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { QUAY_X } from '../../core/constants';
import type { CameraServiceExt } from '../shared';

const BLOCK_COLORS: Record<string, string> = {
  downtown: '#c9cfd3',
  midtown: '#d3d2cc',
  oldtown: '#e9d2bb',
  market: '#ecd7b6',
  residential: '#c9dca7',
  suburb: '#cfe0ae',
  industrial: '#cfc6b8',
  harbor: '#c7cbc9',
  park: '#9ccb6e',
  civic: '#e6dcc0',
  stadium: '#a9cf86',
  station: '#d9d1c4',
  beach: '#efdfac',
  riverside: '#a7cf7c',
  hills: '#9cbf76',
};

const LOT_COLORS: Record<string, string> = {
  downtown: '#7d93a6',
  midtown: '#8f9aa6',
  oldtown: '#c98a6c',
  market: '#c99a6c',
  residential: '#b9857a',
  suburb: '#b9857a',
  industrial: '#9c7b66',
  harbor: '#8b979f',
  park: '#b9a07a',
  civic: '#c7a56a',
  stadium: '#a5b4bf',
  station: '#a8938a',
  beach: '#c9a479',
  riverside: '#a58f74',
  hills: '#a58f74',
};

const AREA_COLORS: Record<string, string> = {
  lawn: '#a3cf72',
  garden: '#a9d27a',
  yard: '#b9d68f',
  plaza: '#e8dcc4',
  parking: '#b7b6b0',
  courtyard: '#ddd2bd',
  field: '#93c264',
  playground: '#e3cfa3',
  beach: '#f0dfa8',
  promenade: '#e6d6b6',
  allotment: '#a7c46f',
  containeryard: '#bdbfbd',
  construction: '#cdb894',
  market: '#e9d3ad',
  platform: '#cfc8bd',
  quay: '#c6c4bd',
  boardwalk: '#c79f73',
  freightyard: '#bdb6aa',
  driveway: '#cfc8bb',
  schoolyard: '#d9cdb5',
};

export interface LiveDot {
  x: number;
  z: number;
  color: string;
  r?: number;
}

export class Minimap {
  readonly el: HTMLDivElement;
  private base: HTMLCanvasElement;
  private over: HTMLCanvasElement;
  private og: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private scale = 1;
  private corners = [
    { x: 0, z: 0 },
    { x: 0, z: 0 },
    { x: 0, z: 0 },
    { x: 0, z: 0 },
  ];
  private lastDraw = 0;
  private dragging = false;
  private dragMoved = false;
  private downX = 0;
  private downY = 0;
  private tmp = new THREE.Vector3();
  private collapsed = false;
  liveDots: () => LiveDot[] = () => [];

  constructor(
    private ctx: CityContext,
    private cam: () => CameraServiceExt | null,
    width: number,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'th-minimap th-card';
    this.el.innerHTML = `<div class="th-mm-frame"><canvas class="th-mm-base"></canvas><canvas class="th-mm-over"></canvas><div class="th-mm-north" aria-hidden="true">N</div></div>`;
    this.base = this.el.querySelector('.th-mm-base') as HTMLCanvasElement;
    this.over = this.el.querySelector('.th-mm-over') as HTMLCanvasElement;
    this.og = this.over.getContext('2d')!;
    this.setWidth(width);
    this.over.addEventListener('pointerdown', (e) => this.onDown(e));
    this.over.addEventListener('pointermove', (e) => this.onMove(e));
    this.over.addEventListener('pointerup', (e) => this.onUp(e));
    this.over.addEventListener('pointercancel', () => (this.dragging = false));
    this.over.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    this.el.title = 'Click to fly there · drag to pan';
  }

  setCollapsed(c: boolean): void {
    this.collapsed = c;
    this.el.classList.toggle('collapsed', c);
  }

  isCollapsed(): boolean {
    return this.collapsed;
  }

  setWidth(width: number): void {
    const s = this.ctx.plan.slab;
    const w = Math.round(width);
    const h = Math.round((width * (s.z1 - s.z0)) / (s.x1 - s.x0));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.scale = w / (s.x1 - s.x0);
    for (const c of [this.base, this.over]) {
      c.width = Math.round(w * this.dpr);
      c.height = Math.round(h * this.dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    this.drawBase();
  }

  private X(x: number): number {
    return (x - this.ctx.plan.slab.x0) * this.scale;
  }
  private Z(z: number): number {
    return (z - this.ctx.plan.slab.z0) * this.scale;
  }

  private drawBase(): void {
    const { plan } = this.ctx;
    const g = this.base.getContext('2d')!;
    const dpr = this.dpr;
    const W = this.base.width,
      H = this.base.height;
    // 1) terrain & water per pixel (hypsometric tint + soft hill shading)
    const img = g.createImageData(W, H);
    const s = plan.slab;
    const k = 1 / (this.scale * dpr);
    for (let j = 0; j < H; j++) {
      const z = s.z0 + (j + 0.5) * k;
      for (let i = 0; i < W; i++) {
        const x = s.x0 + (i + 0.5) * k;
        const o = (j * W + i) * 4;
        let r: number, gg: number, b: number;
        if (plan.isWater(x, z)) {
          const depth = Math.max(0, -plan.heightAt(x, z) - 1.6);
          const t = Math.min(1, depth / 6);
          r = 118 - t * 40;
          gg = 178 - t * 40;
          b = 204 - t * 18;
        } else {
          const hgt = plan.heightAt(x, z);
          if (hgt > 0.4) {
            const sh = plan.heightAt(x - 1.5, z - 1.5) - hgt; // light from the north-west
            const t = Math.min(1, hgt / 28);
            r = 160 - t * 22 + sh * 9;
            gg = 192 - t * 14 + sh * 9;
            b = 122 - t * 16 + sh * 7;
          } else if (x > QUAY_X - 20 && hgt < -0.2) {
            r = 232;
            gg = 216;
            b = 168;
          } else {
            r = 196;
            gg = 210;
            b = 160;
          }
        }
        img.data[o] = r;
        img.data[o + 1] = gg;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    g.save();
    g.scale(dpr, dpr);
    const rect = (r: { x0: number; z0: number; x1: number; z1: number }, fill: string) => {
      g.fillStyle = fill;
      g.fillRect(this.X(r.x0), this.Z(r.z0), (r.x1 - r.x0) * this.scale, (r.z1 - r.z0) * this.scale);
    };
    // 2) road corridors (sidewalk casing) under the blocks
    g.lineCap = 'square';
    for (const seg of plan.roadSegments) {
      const A = plan.roadNodes[seg.a],
        B = plan.roadNodes[seg.b];
      g.strokeStyle = seg.kind === 'tunnel' ? 'rgba(90,90,96,0.35)' : '#e4ddd0';
      g.lineWidth = (seg.sidewalks ? 13 : 7) * this.scale;
      g.beginPath();
      g.moveTo(this.X(A.x), this.Z(A.z));
      g.lineTo(this.X(B.x), this.Z(B.z));
      g.stroke();
    }
    // 3) blocks, areas, lots
    for (const b of plan.blocks) {
      if (b.kind === 'beach') continue;
      rect(b.rect, BLOCK_COLORS[b.kind] ?? '#ddd');
    }
    const areas = [...plan.areas].sort((a, b) => a.layer - b.layer);
    for (const a of areas) {
      if (a.kind === 'pond' && a.ellipse) {
        g.fillStyle = '#86bcd6';
        g.beginPath();
        g.ellipse(this.X(a.ellipse.cx), this.Z(a.ellipse.cz), a.ellipse.rx * this.scale, a.ellipse.rz * this.scale, 0, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      const c = AREA_COLORS[a.kind];
      if (c) rect(a.rect, c);
    }
    // park & promenade paths
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const p of plan.paths) {
      if (p.pts.length < 2) continue;
      g.strokeStyle = p.kind === 'bridge' || p.kind === 'pier' || p.kind === 'boardwalk' ? '#b48a5f' : 'rgba(236,226,204,0.95)';
      g.lineWidth = Math.max(0.8, p.width * this.scale);
      g.beginPath();
      g.moveTo(this.X(p.pts[0].x), this.Z(p.pts[0].z));
      for (let i = 1; i < p.pts.length; i++) g.lineTo(this.X(p.pts[i].x), this.Z(p.pts[i].z));
      g.stroke();
    }
    for (const lot of plan.lots) {
      g.fillStyle = LOT_COLORS[lot.district] ?? '#999';
      const f = lot.footprint;
      g.fillRect(this.X(f.x0), this.Z(f.z0), Math.max(0.8, (f.x1 - f.x0) * this.scale), Math.max(0.8, (f.z1 - f.z0) * this.scale));
    }
    // 4) asphalt
    g.lineCap = 'butt';
    for (const seg of plan.roadSegments) {
      const A = plan.roadNodes[seg.a],
        B = plan.roadNodes[seg.b];
      g.strokeStyle = seg.kind === 'tunnel' ? 'rgba(80,82,88,0.45)' : '#6b6e74';
      g.lineWidth = 7 * this.scale;
      g.beginPath();
      g.moveTo(this.X(A.x), this.Z(A.z));
      g.lineTo(this.X(B.x), this.Z(B.z));
      g.stroke();
    }
    // 5) rail (sleeper-dashed line)
    const rail = plan.rail;
    g.strokeStyle = '#5b4a40';
    g.lineWidth = 2.6 * this.scale + 0.6;
    g.beginPath();
    g.moveTo(this.X(Math.max(rail.x0, rail.portalW)), this.Z(rail.z));
    g.lineTo(this.X(Math.min(rail.x1, rail.portalE)), this.Z(rail.z));
    g.stroke();
    g.strokeStyle = '#efe8da';
    g.lineWidth = 1;
    g.setLineDash([2, 2.5]);
    g.beginPath();
    g.moveTo(this.X(Math.max(rail.x0, rail.portalW)), this.Z(rail.z));
    g.lineTo(this.X(Math.min(rail.x1, rail.portalE)), this.Z(rail.z));
    g.stroke();
    g.setLineDash([]);
    for (const st of rail.stations) rect(st.platform, '#d8cfc0');
    // 6) a few landmark pins
    for (const f of plan.features) {
      if (f.kind === 'lighthouse' || f.kind === 'ferriswheel' || f.kind === 'fountain' || f.kind === 'windturbine') {
        g.fillStyle = f.kind === 'lighthouse' ? '#d9534f' : f.kind === 'ferriswheel' ? '#e9a23b' : f.kind === 'fountain' ? '#6fb6d9' : '#f4f1ea';
        g.beginPath();
        g.arc(this.X(f.x), this.Z(f.z), f.kind === 'windturbine' ? 1.4 : 2, 0, Math.PI * 2);
        g.fill();
      }
    }
    // 7) soft vignette + slab edge
    const vg = g.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    vg.addColorStop(0, 'rgba(60,50,30,0)');
    vg.addColorStop(1, 'rgba(60,50,30,0.16)');
    g.fillStyle = vg;
    g.fillRect(0, 0, this.w, this.h);
    g.restore();
  }

  private toWorld(e: PointerEvent): { x: number; z: number } {
    const r = this.over.getBoundingClientRect();
    const s = this.ctx.plan.slab;
    const x = s.x0 + ((e.clientX - r.left) / Math.max(1, r.width)) * (s.x1 - s.x0);
    const z = s.z0 + ((e.clientY - r.top) / Math.max(1, r.height)) * (s.z1 - s.z0);
    return { x, z };
  }

  private onDown(e: PointerEvent): void {
    this.dragging = true;
    this.dragMoved = false;
    this.downX = e.clientX;
    this.downY = e.clientY;
    try {
      this.over.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    e.preventDefault();
  }

  private onMove(e: PointerEvent): void {
    if (!this.dragging) return;
    const cam = this.cam();
    if (!cam) return;
    if (!this.dragMoved && Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 3) this.dragMoved = true;
    if (!this.dragMoved) return;
    const p = this.toWorld(e);
    const st = cam.getState();
    cam.flyTo({ target: { x: p.x, y: cam.groundAt(p.x, p.z), z: p.z }, distance: st.distance, yaw: st.yaw, pitch: st.pitch }, 0);
  }

  private onUp(e: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    const cam = this.cam();
    if (!cam) return;
    if (!this.dragMoved) {
      const p = this.toWorld(e);
      cam.flyToPoint(p.x, p.z, Math.min(cam.getState().distance, 260));
    }
  }

  /** redraw the overlay (throttled by the caller) */
  draw(now: number): void {
    if (this.collapsed) return;
    if (now - this.lastDraw < 66) return;
    this.lastDraw = now;
    const g = this.og;
    const dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    const cam = this.cam();
    if (!cam) return;
    // view footprint
    cam.footprint(this.corners);
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const c = this.corners[i];
      const px = this.X(c.x),
        pz = this.Z(c.z);
      if (i === 0) g.moveTo(px, pz);
      else g.lineTo(px, pz);
    }
    g.closePath();
    g.fillStyle = 'rgba(217,119,74,0.16)';
    g.fill();
    g.strokeStyle = 'rgba(190,92,52,0.9)';
    g.lineWidth = 1.3;
    g.stroke();
    // live dots
    let dots: LiveDot[] = [];
    try {
      dots = this.liveDots();
    } catch {
      dots = [];
    }
    for (const d of dots) {
      g.fillStyle = d.color;
      g.beginPath();
      g.arc(this.X(d.x), this.Z(d.z), d.r ?? 2.2, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 0.8;
      g.stroke();
    }
    // camera pivot + view direction
    const st = cam.getState();
    const tx = this.X(st.target.x),
      tz = this.Z(st.target.z);
    const yaw = (st.yaw * Math.PI) / 180;
    // the camera looks along -(sin yaw, cos yaw)
    const lx = -Math.sin(yaw),
      lz = -Math.cos(yaw);
    g.save();
    g.translate(tx, tz);
    g.rotate(Math.atan2(lz, lx));
    g.fillStyle = '#26323b';
    g.beginPath();
    g.moveTo(7, 0);
    g.lineTo(-3.5, -4);
    g.lineTo(-1.5, 0);
    g.lineTo(-3.5, 4);
    g.closePath();
    g.fill();
    g.restore();
    // followed entity
    const f = cam.following();
    if (f) {
      const v = this.tmp;
      let ok = false;
      try {
        ok = f.getPosition(v);
      } catch {
        ok = false;
      }
      if (ok) {
        const pulse = 3 + 1.5 * Math.sin(now / 180);
        g.strokeStyle = 'rgba(217,119,74,0.95)';
        g.lineWidth = 1.6;
        g.beginPath();
        g.arc(this.X(v.x), this.Z(v.z), pulse + 2, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = '#d9774a';
        g.beginPath();
        g.arc(this.X(v.x), this.Z(v.z), 2.4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}
