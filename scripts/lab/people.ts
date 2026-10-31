// People lab: the figures alone, on a plain street-coloured set, no city. Boots in a second and runs on software GL, so faces
// can be iterated on without queueing for the shared browser. The light is close to the city's noon / dusk / night rig, but no
// atmosphere and no postfx: always confirm in the city (peoplelab.mjs) before believing it.
// Driven by scripts/peoplelab-sw.mjs. URL: ?mode=grid|seq|turn &n=24 &d=1 &angle=15 &cols=6 &cell=320 &hour=12 &seed=1 &part=face|hand|foot|body
import * as THREE from 'three';
import { Rng } from '/src/core/rng';
import { makeLook } from '/src/sim/pedestrians/looks';
import { Member, Party } from '/src/sim/pedestrians/crowd';
import { CrowdRenderer } from '/src/sim/pedestrians/render';
import { rigOf } from '/src/sim/pedestrians/rig';
import { globalUniforms } from '/src/core/uniforms';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? parseFloat(q.get(k)!) : d);
const mode = q.get('mode') ?? 'grid';
const part = q.get('part') ?? 'face';
const n = num('n', 24),
  cols = num('cols', 6),
  cell = num('cell', 320),
  d = num('d', 1),
  angle = num('angle', 15),
  hour = num('hour', 12);
const rows = Math.ceil(n / cols);
const gl = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
gl.setPixelRatio(1);
gl.setSize(cols * cell, rows * cell);
gl.toneMapping = THREE.AgXToneMapping;
gl.outputColorSpace = THREE.SRGBColorSpace;
gl.shadowMap.enabled = q.get('shadow') !== '0';
gl.shadowMap.type = THREE.PCFShadowMap;
gl.autoClear = false;
gl.setScissorTest(true);
document.body.appendChild(gl.domElement);

const scene = new THREE.Scene();
const RIGS: Record<string, { sun: number[]; si: number; dir: number[]; hs: string; hg: string; hi: number; exp: number; bg: string; gr: string; night: number }> = {
  noon: { sun: [1, 0.95, 0.86], si: 3.1, dir: [0.45, 0.8, 0.4], hs: '#c4dcf4', hg: '#8a8472', hi: 1.1, exp: 1.18, bg: '#9db4c8', gr: '#8c8880', night: 0 },
  dusk: { sun: [1, 0.66, 0.42], si: 2.1, dir: [-0.8, 0.22, 0.45], hs: '#b6b8d8', hg: '#6e5c50', hi: 0.8, exp: 1.3, bg: '#c49a86', gr: '#6e655d', night: 0.2 },
  night: { sun: [0.55, 0.65, 0.95], si: 0.25, dir: [0.3, 0.7, 0.4], hs: '#39476e', hg: '#2c2a2a', hi: 0.55, exp: 1.5, bg: '#141a28', gr: '#2c2c2e', night: 1 },
};
const rig = RIGS[hour < 16 ? 'noon' : hour < 20 ? 'dusk' : 'night'];
gl.toneMappingExposure = rig.exp;
scene.background = new THREE.Color(rig.bg);
const sunDir = new THREE.Vector3(...(rig.dir as [number, number, number])).normalize();
const sun = new THREE.DirectionalLight(new THREE.Color(...(rig.sun as [number, number, number])), rig.si);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 2;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
// (the city's frustum near the camera is tens of metres wide: the same coarse texels on a face)
const S = num('shadowS', 20);
Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 200 });
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(rig.hs, rig.hg, rig.hi));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: rig.gr }));
ground.receiveShadow = true;
scene.add(ground);
(globalUniforms.uSunDir.value as THREE.Vector3).copy(sunDir);
globalUniforms.uNight.value = rig.night;

const camera = new THREE.PerspectiveCamera(num('fov', 50), 1, 0.05, 400);
scene.add(camera);
const renderer = new CrowdRenderer(scene, 64, true, gl);
renderer.xfade = false;
if (q.has('force')) renderer.forceLod = num('force', -1);
if (q.has('noshadowproxy')) renderer.setShadows(false);
(window as unknown as Record<string, unknown>).__renderer = renderer;

// a spread of people: kinds, ages, personas, with the crowd's own wardrobe
const PERSONAS = ['commuter', 'shopper', 'tourist', 'student', 'elderly', 'parent', 'worker'] as const;
const members: Member[] = [];
const rng0 = new Rng(num('seed', 1) * 7919 + 13);
const onlyIdx = q.has('only') ? q.get('only')!.split(',').map(Number) : null;
for (let i = 0; members.length < (onlyIdx ? onlyIdx.length : n); i++) {
  const rng = new Rng((rng0.next() * 1e9) | 0);
  if (onlyIdx && !onlyIdx.includes(i)) continue;
  const persona = PERSONAS[i % PERSONAS.length];
  const age = i % 11 === 9 ? 'child' : undefined;
  const look = makeLook(rng, { persona, warm: q.get('warm') !== '0', age } as Parameters<typeof makeLook>[1]);
  look.dog = null;
  look.pram = null;
  const p = new Party(i, persona as never);
  const m = new Member(i, p, 0, look, rng.next());
  p.members.push(m);
  m.fade = 1;
  m.present = true;
  m.yaw = 0;
  members.push(m);
}
const crowd = { parties: [] as Party[] };

let T = 0;
const labels: string[] = [];
const write = () => renderer.write(crowd as never, camera, T, 0, rig.night, 1025, null, 0);
const heightOf = (m: Member) => {
  const st = rigOf(m.look).stature;
  return part === 'hand' ? st * 0.47 : part === 'foot' ? 0.12 : part === 'body' ? st * 0.55 : part === 'neck' ? st * 0.81 : st * 0.925;
};
function drawCell(i: number, m: Member, yaw: number, dist: number, h: number): void {
  const a = ((yaw + (m.yaw * 180) / Math.PI) * Math.PI) / 180;
  const pitch = ((part === 'foot' ? 25 : 2) * Math.PI) / 180;
  camera.position.set(m.x + Math.sin(a) * Math.cos(pitch) * dist, m.y + h + Math.sin(pitch) * dist, m.z + Math.cos(a) * Math.cos(pitch) * dist);
  camera.lookAt(m.x, m.y + h, m.z);
  camera.updateMatrixWorld();
  sun.position.copy(sunDir).multiplyScalar(60).add(new THREE.Vector3(m.x, 0, m.z));
  sun.target.position.set(m.x, 0, m.z);
  sun.target.updateMatrixWorld();
  crowd.parties = [m.party];
  write();
  const cx = (i % cols) * cell,
    cy = (rows - 1 - Math.floor(i / cols)) * cell;
  gl.setViewport(cx, cy, cell, cell);
  gl.setScissor(cx, cy, cell, cell);
  gl.clear();
  gl.render(scene, camera);
}

function walkStep(m: Member, dt: number): void {
  const v = 1.35;
  m.speed = v;
  m.amp = 1;
  m.vx = Math.sin(m.yaw) * v;
  m.vz = Math.cos(m.yaw) * v;
  m.x += m.vx * dt;
  m.z += m.vz * dt;
  m.phase += (dt * v) / 0.72;
  T += dt;
}
function settle(m: Member, steps: number): void {
  crowd.parties = [m.party];
  for (let k = 0; k < steps; k++) {
    walkStep(m, 0.033);
    camera.position.set(m.x + 2, 1.6, m.z + 2);
    camera.lookAt(m.x, 1, m.z);
    camera.updateMatrixWorld();
    write();
  }
}

if (mode === 'grid') {
  for (let i = 0; i < n; i++) {
    const m = members[i];
    settle(m, q.get('walk') === '0' ? 0 : 20);
    drawCell(i, m, angle, d, heightOf(m));
    labels.push(`${i} ${m.look.kind} ${m.look.age}`);
  }
} else if (mode === 'turn') {
  const m = members[num('who', 0)];
  settle(m, 20);
  const ang = (q.get('angles') ?? '0,30,60,90,135,180').split(',').map(Number);
  for (let i = 0; i < n; i++) {
    drawCell(i, m, ang[i % ang.length], d, heightOf(m));
    labels.push(`${ang[i % ang.length]}`);
  }
} else if (mode === 'seq') {
  const m = members[num('who', 0)];
  const dt = num('dt', 0.083);
  settle(m, 60);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      walkStep(m, dt / 3);
      write();
    }
    drawCell(i, m, angle, d, heightOf(m));
    labels.push(`${i}`);
  }
}
(window as unknown as Record<string, unknown>).__labels = labels;
(window as unknown as Record<string, unknown>).__done = true;
