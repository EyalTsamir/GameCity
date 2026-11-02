// The town map on the info boards (?noshapeboard): drawn once from the plan itself, so its streets, blocks, water and
// district names are the real ones and each board's "you are here" is where the board stands.

import { CITY_NAME } from '../../core/constants';
import type { CityPlan } from '../../core/plan';

/** printed size in atlas pixels; the map's share of the sheet (the title above it, the key to its right) */
export const MAP_W = 440;
export const MAP_H = 316;
const TOP = 34,
  KEY = 104,
  PAD = 5;

const BLOCK: Record<string, string> = {
  residential: '#e3d8c2',
  suburb: '#e8dfca',
  downtown: '#d3c6b4',
  midtown: '#d8c9b2',
  market: '#e0c8a8',
  civic: '#d6cdbd',
  oldtown: '#dcc4a6',
  industrial: '#cbc6bd',
  harbor: '#c6c8c6',
  park: '#b9d3a0',
};

/** where a world point falls on the sheet, 0..1 from the top left */
export function mapPoint(plan: CityPlan, x: number, z: number): [number, number] {
  const S = plan.slab,
    w = MAP_W - KEY - PAD * 2,
    h = MAP_H - TOP - PAD * 2;
  return [(PAD + ((x - S.x0) / (S.x1 - S.x0)) * w) / MAP_W, (TOP + PAD + ((z - S.z0) / (S.z1 - S.z0)) * h) / MAP_H];
}

export function drawCityMap(plan: CityPlan, g: CanvasRenderingContext2D, W: number, H: number): void {
  const X = (x: number) => mapPoint(plan, x, 0)[0] * W,
    Z = (z: number) => mapPoint(plan, 0, z)[1] * H,
    S = plan.slab;
  g.fillStyle = '#f4efe2';
  g.fillRect(0, 0, W, H);
  // land, then water sampled from the plan
  g.fillStyle = '#ede6d3';
  g.fillRect(X(S.x0), Z(S.z0), X(S.x1) - X(S.x0), Z(S.z1) - Z(S.z0));
  g.fillStyle = '#9cc4d8';
  const step = 3;
  for (let x = S.x0; x < S.x1; x += step)
    for (let z = S.z0; z < S.z1; z += step) if (plan.isWater(x + step / 2, z + step / 2)) g.fillRect(X(x), Z(z), X(x + step) - X(x) + 0.6, Z(z + step) - Z(z) + 0.6);
  for (const b of plan.blocks) {
    g.fillStyle = BLOCK[b.kind] ?? '#dfd6c4';
    g.fillRect(X(b.rect.x0), Z(b.rect.z0), X(b.rect.x1) - X(b.rect.x0), Z(b.rect.z1) - Z(b.rect.z0));
  }
  // streets, cased; avenues amber
  const nodes = new Map(plan.roadNodes.map((n) => [n.id, n]));
  const line = (a: number, b: number) => {
    const na = nodes.get(a),
      nb = nodes.get(b);
    if (!na || !nb) return;
    g.beginPath();
    g.moveTo(X(na.x), Z(na.z));
    g.lineTo(X(nb.x), Z(nb.z));
    g.stroke();
  };
  g.lineCap = 'round';
  g.strokeStyle = '#a89f8c';
  g.lineWidth = 4.2;
  for (const r of plan.roadSegments) if (r.kind !== 'tunnel') line(r.a, r.b);
  for (const r of plan.roadSegments) {
    if (r.kind === 'tunnel') continue;
    g.strokeStyle = r.kind === 'avenue' ? '#efc26a' : '#fbf8ef';
    g.lineWidth = 2.8;
    line(r.a, r.b);
  }
  // the bus lines
  g.lineWidth = 1;
  for (const route of plan.busRoutes) {
    g.strokeStyle = route.color;
    for (let i = 0; i + 1 < route.nodes.length; i++) line(route.nodes[i], route.nodes[i + 1]);
  }
  // district names
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '600 8.5px Georgia, serif';
  for (const d of plan.districts) {
    g.lineWidth = 2.4;
    g.strokeStyle = 'rgba(244,239,226,0.85)';
    g.strokeText(d.name, X(d.label.x), Z(d.label.z));
    g.fillStyle = '#3c3a34';
    g.fillText(d.name, X(d.label.x), Z(d.label.z));
  }
  // the title band
  g.fillStyle = '#2f3a3a';
  g.fillRect(0, 0, W, TOP - 4);
  g.textAlign = 'left';
  g.fillStyle = '#f4efe2';
  g.font = '700 19px Georgia, serif';
  g.fillText(CITY_NAME, 8, 15);
  g.font = '11px Georgia, serif';
  g.textAlign = 'right';
  g.fillText('Town map', W - 8, 15);
  // the key
  const kx = W - KEY + 4;
  g.textAlign = 'left';
  g.font = '600 10px Georgia, serif';
  g.fillStyle = '#2f3a3a';
  g.fillText('Key', kx, TOP + 10);
  const rows: [string, string][] = [
    ['#d9473f', 'You are here'],
    ['#efc26a', 'Avenue'],
    ['#b9d3a0', 'Park'],
    ['#9cc4d8', 'Water'],
    ['#cbc6bd', 'Works, docks'],
    ...plan.busRoutes.slice(0, 4).map((r): [string, string] => [r.color, r.name]),
  ];
  g.font = '9.5px Georgia, serif';
  rows.forEach(([c, t], i) => {
    const y = TOP + 26 + i * 16;
    g.fillStyle = c;
    g.fillRect(kx, y - 5, 10, 10);
    g.fillStyle = '#35332e';
    g.fillText(t, kx + 15, y);
  });
  // scale bar and north
  const by = H - 16,
    m100 = X(100) - X(0);
  g.fillStyle = '#35332e';
  g.fillRect(kx, by, m100 / 2, 2);
  g.fillText('50 m', kx, by - 7);
  g.beginPath();
  g.moveTo(W - 14, by - 16);
  g.lineTo(W - 19, by + 2);
  g.lineTo(W - 9, by + 2);
  g.fill();
  g.font = '8px Georgia, serif';
  g.fillText('N', W - 17, by - 20);
}
