// Critter lab: cats and birds alone on a plain set, software GL, no city and no shared browser (like lab/people.ts): a sheet in seconds.
// URL: ?kind=cat|bird &n=12 &cols=4 &cell=320 &d=1 &angle=40 &pitch=8 &hour=12 &h=0.2 &up=... ; confirm in the city afterwards (lifeseq.mjs).
//   cat: cells go through coat × stand / walk / sit / loaf;  bird: through kinds × standing / pecking / walking / wings open.
import * as THREE from 'three';
import { makeCatKit } from '/src/sim/smalllife/catBody';
import { makeBirdKit } from '/src/sim/smalllife/birdBody';
import { globalUniforms } from '/src/core/uniforms';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? parseFloat(q.get(k)!) : d);
const kind = q.get('kind') ?? 'cat';
const n = num('n', 12),
  cols = num('cols', 4),
  cell = num('cell', 320),
  dist = num('d', 1),
  angle = num('angle', 40),
  pitch = num('pitch', 8),
  hour = num('hour', 12),
  look = num('h', kind === 'cat' ? 0.2 : 0.08);
const rows = Math.ceil(n / cols);
const gl = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
gl.setPixelRatio(1);
gl.setSize(cols * cell, rows * cell);
gl.toneMapping = THREE.AgXToneMapping;
gl.outputColorSpace = THREE.SRGBColorSpace;
gl.shadowMap.enabled = true;
gl.shadowMap.type = THREE.PCFShadowMap;
gl.autoClear = false;
gl.setScissorTest(true);
document.body.appendChild(gl.domElement);

const scene = new THREE.Scene();
const noon = hour < 16;
gl.toneMappingExposure = noon ? 1.18 : 1.3;
scene.background = new THREE.Color(noon ? '#9db4c8' : '#c49a86');
const sunDir = new THREE.Vector3(...((noon ? [0.45, 0.8, 0.4] : [-0.8, 0.22, 0.45]) as [number, number, number])).normalize();
const sun = new THREE.DirectionalLight(new THREE.Color(...((noon ? [1, 0.95, 0.86] : [1, 0.66, 0.42]) as [number, number, number])), noon ? 3.1 : 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.radius = 2;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.005;
Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 40 });
sun.position.copy(sunDir).multiplyScalar(20);
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(noon ? '#c4dcf4' : '#b6b8d8', noon ? '#8a8472' : '#6e5c50', noon ? 1.1 : 0.8));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: noon ? '#8c8880' : '#6e655d' }));
ground.receiveShadow = true;
scene.add(ground);
(globalUniforms.uSunDir.value as THREE.Vector3).copy(sunDir);

const camera = new THREE.PerspectiveCamera(num('fov', 42), 1, 0.03, 100);
scene.add(camera);
const a = (angle * Math.PI) / 180,
  p = (pitch * Math.PI) / 180;
camera.position.set(Math.sin(a) * Math.cos(p) * dist, look + Math.sin(p) * dist, Math.cos(a) * Math.cos(p) * dist);
camera.lookAt(0, look, 0);
camera.updateMatrixWorld();

const labels: string[] = [];
const attr = (g: THREE.BufferGeometry, name: string): Float32Array => {
  const v = new Float32Array(4);
  g.setAttribute(name, new THREE.InstancedBufferAttribute(v, 4));
  return v;
};
const time = { value: num('t', 3) };
const draw = (i: number) => {
  const cx = (i % cols) * cell,
    cy = (rows - 1 - Math.floor(i / cols)) * cell;
  gl.setViewport(cx, cy, cell, cell);
  gl.setScissor(cx, cy, cell, cell);
  gl.clear();
  gl.render(scene, camera);
};

if (kind === 'cat') {
  const kit = makeCatKit(time);
  const c1 = attr(kit.geometry, 'iC1'),
    c2 = attr(kit.geometry, 'iC2'),
    c3 = attr(kit.geometry, 'iC3');
  const mesh = new THREE.InstancedMesh(kit.geometry, kit.material, 1);
  mesh.customDepthMaterial = kit.depth;
  mesh.setMatrixAt(0, new THREE.Matrix4());
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const coats = (q.get('coats') ?? '0,1,2,3,4,5').split(',').map(Number);
  const poses = (q.get('poses') ?? '0,1,2,3').split(',').map(Number);
  for (let i = 0; i < n; i++) {
    const pose = poses[i % poses.length],
      coat = coats[Math.floor(i / poses.length) % coats.length];
    c1[0] = 1.3 + i;
    c1[1] = pose === 1 ? 1 : 0;
    c1[2] = pose === 2 ? 1 : 0;
    c1[3] = pose === 3 ? 1 : 0;
    c2[0] = num('hy', 0.2);
    c2[1] = num('hp', 0);
    c2[2] = pose === 0 || pose === 1 ? 0.35 : 0.2;
    c2[3] = 0;
    c3[0] = coat;
    c3[1] = ((i * 0.37) % 1) * 0.9 + 0.05;
    c3[2] = 0;
    labels.push(`coat ${coat} pose ${pose}`);
    (kit.geometry.getAttribute('iC1') as THREE.BufferAttribute).needsUpdate = true;
    (kit.geometry.getAttribute('iC2') as THREE.BufferAttribute).needsUpdate = true;
    (kit.geometry.getAttribute('iC3') as THREE.BufferAttribute).needsUpdate = true;
    draw(i);
  }
} else {
  const kit = makeBirdKit();
  const p1 = attr(kit.geometry, 'iP1'),
    p2 = attr(kit.geometry, 'iP2'),
    p3 = attr(kit.geometry, 'iP3'),
    tone = attr(kit.geometry, 'iTone');
  const mesh = new THREE.InstancedMesh(kit.geometry, kit.material, 1);
  mesh.customDepthMaterial = kit.depth;
  const sc = num('scale', 1);
  mesh.setMatrixAt(0, new THREE.Matrix4().makeScale(sc, sc, sc));
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const kinds = (q.get('kinds') ?? '0,1,2,3').split(',').map(Number);
  for (let i = 0; i < n; i++) {
    const act = i % 4,
      kd = kinds[Math.floor(i / 4) % kinds.length];
    p1[0] = 1 + i * 0.3;
    p1[1] = act === 3 ? 1 : 0;
    p1[2] = act === 3 ? 1 : 0;
    p1[3] = 0.2;
    p2[0] = act === 1 ? 0.9 : 0;
    p2[1] = 0.2;
    p2[2] = 0;
    p2[3] = 0;
    p3[0] = 1.2 + i;
    p3[1] = act === 2 ? 1 : 0;
    p3[2] = 0;
    p3[3] = kd;
    tone[0] = (i * 0.37) % 1;
    tone[1] = (i * 0.61) % 1;
    tone[2] = (i * 0.83) % 1;
    tone[3] = (i * 0.17) % 1;
    labels.push(`kind ${kd} act ${act}`);
    for (const nm of ['iP1', 'iP2', 'iP3', 'iTone']) (kit.geometry.getAttribute(nm) as THREE.BufferAttribute).needsUpdate = true;
    draw(i);
  }
}
(window as unknown as Record<string, unknown>).__labels = labels;
(window as unknown as Record<string, unknown>).__done = true;
