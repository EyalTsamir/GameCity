// 2D top-down debug map of the plan and graphs: ?planview  or  ?planview=x0,z0,x1,z1
// Layers can be toggled with ?layers=blocks,lots,roads,lanes,moves,peds,slots,features,paths,water,occ

import type { CityContext, CityModule } from '../core/context';
import { OCC } from '../core/occupancy';

const DISTRICT_COLORS: Record<string, string> = {
  downtown: '#9db4d6',
  midtown: '#b3c3dd',
  oldtown: '#e6b98f',
  market: '#e9c79c',
  residential: '#bfe0a8',
  suburb: '#cfe8b8',
  industrial: '#c9c1b6',
  harbor: '#b8c4c9',
  park: '#8fd18a',
  civic: '#e7d9a7',
  stadium: '#a7d8b5',
  station: '#d7c9e6',
  beach: '#f2e2a8',
  riverside: '#a9dca0',
  hills: '#9cbf86',
};

export default function create(ctx: CityContext): CityModule {
  const { plan, roads, peds, occupancy } = ctx;
  const p = ctx.debug.params;
  const region = (p.get('planview') || '').split(',').map(Number);
  const [x0, z0, x1, z1] = region.length === 4 && region.every((v) => !isNaN(v)) ? region : [plan.slab.x0, plan.slab.z0, plan.slab.x1, plan.slab.z1];
  const layers = new Set((p.get('layers') ?? 'blocks,lots,roads,lanes,moves,peds,slots,features,paths,water').split(','));
  const W = Math.min(2400, window.innerWidth * devicePixelRatio);
  const scale = W / (x1 - x0);
  const H = (z1 - z0) * scale;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  cv.style.cssText = `position:fixed;left:0;top:0;width:${W / devicePixelRatio}px;height:${H / devicePixelRatio}px;z-index:50;background:#f4f1ea`;
  document.body.appendChild(cv);
  const g = cv.getContext('2d')!;
  const X = (x: number) => (x - x0) * scale;
  const Z = (z: number) => (z - z0) * scale;
  const rectF = (r: { x0: number; z0: number; x1: number; z1: number }, fill: string, stroke?: string) => {
    g.fillStyle = fill;
    g.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale);
    if (stroke) {
      g.strokeStyle = stroke;
      g.strokeRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale);
    }
  };
  // terrain / water
  if (layers.has('water') || layers.has('occ')) {
    const img = g.createImageData(W, Math.ceil(H));
    for (let j = 0; j < img.height; j++) {
      for (let i = 0; i < W; i++) {
        const x = x0 + i / scale,
          z = z0 + j / scale;
        const k = (j * W + i) * 4;
        const h = plan.heightAt(x, z);
        let c = [236, 232, 220];
        if (h > 0.3) c = [200 - h * 3, 215 - h * 2, 170 - h * 3];
        if (plan.isWater(x, z)) c = [120, 170, 210];
        if (layers.has('occ')) {
          const o = occupancy.get(x, z);
          if (o & OCC.ROAD) c = [90, 90, 95];
          else if (o & OCC.SIDEWALK) c = [190, 190, 190];
          if (o & OCC.BUILDING) c = [200, 80, 80];
          if (o & OCC.SOLID) c = [200, 60, 200];
          if (o & OCC.PATH) c = [230, 200, 120];
        }
        img.data[k] = c[0];
        img.data[k + 1] = c[1];
        img.data[k + 2] = c[2];
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }
  if (layers.has('blocks')) for (const b of plan.blocks) rectF(b.rect, DISTRICT_COLORS[b.kind] ?? '#ddd', '#0003');
  if (layers.has('lots')) {
    for (const a of plan.areas) {
      if (a.kind === 'parking') rectF(a.rect, '#8888', '#0002');
      if (a.kind === 'driveway') rectF(a.rect, '#bbb9', undefined);
    }
    g.lineWidth = 1;
    for (const lot of plan.lots) {
      rectF(lot.rect, 'rgba(0,0,0,0)', '#0002');
      rectF(lot.footprint, '#7a5c4aa0', '#3a2a20');
      g.fillStyle = '#fff';
      g.font = `${Math.max(8, scale * 2)}px sans-serif`;
      g.fillText(`${lot.kind[0]}${Math.round(lot.height)}`, X(lot.footprint.x0) + 2, Z(lot.footprint.z0) + scale * 2.5);
      for (const d of lot.doors) {
        g.fillStyle = '#ff2';
        g.beginPath();
        g.arc(X(d.x), Z(d.z), Math.max(2, scale * 0.6), 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  if (layers.has('roads')) {
    g.strokeStyle = '#555';
    for (const seg of plan.roadSegments) {
      const A = plan.roadNodes[seg.a],
        B = plan.roadNodes[seg.b];
      g.lineWidth = 7 * scale;
      g.beginPath();
      g.moveTo(X(A.x), Z(A.z));
      g.lineTo(X(B.x), Z(B.z));
      g.stroke();
    }
  }
  if (layers.has('lanes')) {
    g.lineWidth = Math.max(1, scale * 0.25);
    for (const l of roads.lanes) {
      g.strokeStyle = l.sink ? '#f44' : l.source ? '#4f4' : '#ccc';
      const a = l.path.pts[0],
        b = l.path.pts[l.path.pts.length - 1];
      g.beginPath();
      g.moveTo(X(a.x), Z(a.z));
      g.lineTo(X(b.x), Z(b.z));
      g.stroke();
      // arrow head
      const mx = (a.x + b.x) / 2,
        mz = (a.z + b.z) / 2;
      g.fillStyle = '#eee';
      g.beginPath();
      g.arc(X(mx + l.dir.x * 2), Z(mz + l.dir.z * 2), Math.max(1.5, scale * 0.4), 0, Math.PI * 2);
      g.fill();
      for (const bs of l.busStops) {
        const q = l.path.at(bs.s);
        g.fillStyle = '#e33';
        g.fillRect(X(q.x) - 3, Z(q.z) - 3, 6, 6);
      }
    }
  }
  if (layers.has('moves')) {
    g.lineWidth = Math.max(1, scale * 0.15);
    for (const m of roads.movements) {
      g.strokeStyle = m.turn === 'left' ? '#f9a' : m.turn === 'right' ? '#9cf' : '#ddd';
      g.beginPath();
      m.path.pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Z(q.z)) : g.moveTo(X(q.x), Z(q.z))));
      g.stroke();
    }
    for (const I of roads.intersections) {
      g.fillStyle = I.control === 'signal' ? '#2c2' : I.control === 'stop' ? '#c22' : I.control === 'portal' ? '#22c' : '#999';
      g.beginPath();
      g.arc(X(I.x), Z(I.z), Math.max(3, scale * 1.2), 0, Math.PI * 2);
      g.fill();
      for (const s of [...I.signals, ...I.stopSigns]) {
        g.fillStyle = '#000';
        g.fillRect(X(s.x) - 2, Z(s.z) - 2, 4, 4);
      }
    }
  }
  if (layers.has('paths')) {
    for (const path of plan.paths) {
      g.strokeStyle = path.draw ? '#c9a46699' : '#c9a46655';
      g.lineWidth = path.width * scale;
      g.beginPath();
      path.pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Z(q.z)) : g.moveTo(X(q.x), Z(q.z))));
      g.stroke();
    }
  }
  if (layers.has('peds')) {
    const col: Record<string, string> = { sidewalk: '#06c', crosswalk: '#f80', door: '#ff0', link: '#0cc', park: '#0a0', plaza: '#a0a', bridge: '#c00', boardwalk: '#a60', pier: '#a60', beach: '#dc0', promenade: '#08a', market: '#a40', riverbank: '#3a3' };
    g.lineWidth = Math.max(1, scale * 0.3);
    for (const e of peds.edges) {
      const A = peds.nodes[e.a],
        B = peds.nodes[e.b];
      g.strokeStyle = col[e.kind] ?? '#000';
      g.beginPath();
      g.moveTo(X(A.x), Z(A.z));
      g.lineTo(X(B.x), Z(B.z));
      g.stroke();
    }
    for (const b of peds.benches) {
      g.fillStyle = '#630';
      g.fillRect(X(b.bench.x) - 2, Z(b.bench.z) - 2, 4, 4);
    }
  }
  if (layers.has('slots')) {
    const col: Record<string, string> = { lamp: '#fd0', tree: '#2a2', bench: '#840', bin: '#666', hydrant: '#e22', busstop: '#e3e', empty: '#fff0' };
    for (const s of plan.slots) {
      g.fillStyle = col[s.kind] ?? '#09f';
      g.beginPath();
      g.arc(X(s.x), Z(s.z), Math.max(1.5, scale * 0.45), 0, Math.PI * 2);
      g.fill();
    }
  }
  if (layers.has('features')) {
    g.strokeStyle = '#d0f';
    g.lineWidth = 1.5;
    for (const f of plan.features) {
      if (f.rect) g.strokeRect(X(f.rect.x0), Z(f.rect.z0), (f.rect.x1 - f.rect.x0) * scale, (f.rect.z1 - f.rect.z0) * scale);
      if (f.a && f.b) {
        g.beginPath();
        g.moveTo(X(f.a.x), Z(f.a.z));
        g.lineTo(X(f.b.x), Z(f.b.z));
        g.stroke();
      }
      g.beginPath();
      g.arc(X(f.x), Z(f.z), Math.max(2, (f.radius || 0.8) * scale), 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#60a';
      g.font = `${Math.max(9, scale * 2)}px sans-serif`;
      g.fillText(f.kind, X(f.x) + 3, Z(f.z) - 3);
    }
    // rail
    g.strokeStyle = '#333';
    g.setLineDash([6, 4]);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(X(plan.rail.x0), Z(plan.rail.z));
    g.lineTo(X(plan.rail.x1), Z(plan.rail.z));
    g.stroke();
    g.setLineDash([]);
  }
  return { name: 'planview' };
}
