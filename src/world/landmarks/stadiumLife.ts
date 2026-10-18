// Life in Haven Stadium: two matches a day (15:00 and 19:30), a daytime training session,
// a crowd that fills the stands before kick-off (instanced figures that sway, cheer after
// goals and sometimes do a Mexican wave), players chasing a ball with a little match AI
// (passes, tackles, shots, saves, goals), the LED scoreboard and the floodlights.
// Draw calls: crowd (1, count = attendance), players (1), ball (1).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityContext } from '../../core/context';
import type { GlobalUniforms } from '../../core/uniforms';
import type { Env } from './env';
import type { StadiumInfo } from './stadium';

interface Part {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  part: number;
  joint: [number, number, number];
}

function figureGeo(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map((p) => {
    const g = new THREE.BoxGeometry(p.w, p.h, p.d);
    g.translate(p.x, p.y + p.h / 2, p.z);
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(p.part), 1));
    const j = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) j.set(p.joint, i * 3);
    g.setAttribute('aJoint', new THREE.BufferAttribute(j, 3));
    return g;
  });
  const out = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  return out;
}

/** Seated spectator, origin on the seat, facing +Z. parts: 0 torso, 1 head, 2 legs, 3/4 arms. */
function seatedGeo(): THREE.BufferGeometry {
  return figureGeo([
    { w: 0.3, h: 0.14, d: 0.4, x: 0, y: 0, z: 0.12, part: 2, joint: [0, 0, 0] },
    { w: 0.38, h: 0.5, d: 0.24, x: 0, y: 0.05, z: -0.06, part: 0, joint: [0, 0, 0] },
    { w: 0.21, h: 0.23, d: 0.21, x: 0, y: 0.6, z: -0.05, part: 1, joint: [0, 0, 0] },
    { w: 0.09, h: 0.44, d: 0.1, x: -0.24, y: 0.08, z: -0.05, part: 3, joint: [-0.24, 0.5, -0.05] },
    { w: 0.09, h: 0.44, d: 0.1, x: 0.24, y: 0.08, z: -0.05, part: 4, joint: [0.24, 0.5, -0.05] },
  ]);
}

/** Standing player, origin at the feet, facing +Z. parts: 0 torso, 1 head, 2/3 legs, 4/5 arms. */
function playerGeo(): THREE.BufferGeometry {
  return figureGeo([
    { w: 0.14, h: 0.86, d: 0.16, x: -0.1, y: 0, z: 0, part: 2, joint: [0, 0.86, 0] },
    { w: 0.14, h: 0.86, d: 0.16, x: 0.1, y: 0, z: 0, part: 3, joint: [0, 0.86, 0] },
    { w: 0.4, h: 0.56, d: 0.24, x: 0, y: 0.84, z: 0, part: 0, joint: [0, 0, 0] },
    { w: 0.22, h: 0.24, d: 0.22, x: 0, y: 1.43, z: 0, part: 1, joint: [0, 0, 0] },
    { w: 0.1, h: 0.55, d: 0.11, x: -0.26, y: 0.85, z: 0, part: 4, joint: [-0.26, 1.38, 0] },
    { w: 0.1, h: 0.55, d: 0.11, x: 0.26, y: 0.85, z: 0, part: 5, joint: [0.26, 1.38, 0] },
  ]);
}

const SKIN = /* glsl */ `
vec3 figSkin(float k) {
  return k < 0.3 ? vec3(0.94, 0.77, 0.63) : k < 0.55 ? vec3(0.84, 0.64, 0.48) : k < 0.8 ? vec3(0.66, 0.46, 0.32) : vec3(0.42, 0.29, 0.2);
}
mat3 figRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
`;

function crowdMaterial(g: GlobalUniforms, u: { uWave: { value: THREE.Vector2 }; uCheer: { value: THREE.Vector2 } }, flood: { value: number }): THREE.MeshLambertMaterial {
  // u objects are shared: update u.uWave.value / u.uCheer.value every frame
  const m = new THREE.MeshLambertMaterial();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = g.uTime;
    sh.uniforms.uWave = u.uWave;
    sh.uniforms.uFloodL = flood;
    sh.uniforms.uCheer = u.uCheer;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aPart;
        attribute vec3 aJoint;
        attribute vec4 iInfo;
        attribute vec3 iShirt;
        uniform float uTime;
        uniform vec2 uWave;
        uniform vec2 uCheer;
        varying vec3 vFig;
        ${SKIN}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 objectNormal = normal;
        vec3 fp = position;
        float dw = fract(iInfo.x - uWave.x + 0.5) - 0.5;
        float wv = uWave.y * exp(-dw * dw / 0.0016);
        float ch = abs(iInfo.w - uCheer.y) < 0.5 ? uCheer.x : 0.0;
        float bounce = ch * abs(sin(uTime * 7.5 + iInfo.y * 6.2831));
        float up = max(wv, ch * 0.95);
        if (aPart > 2.5) {
          float a = -up * 2.6 + sin(uTime * 2.0 + iInfo.y * 9.0) * 0.08;
          mat3 R = figRotX(a);
          fp = aJoint + R * (fp - aJoint);
          objectNormal = R * objectNormal;
        }
        float lift = wv * 0.42 + bounce * 0.22;
        if (aPart < 1.5 || aPart > 2.5) fp.y += lift;
        float sw = sin(uTime * 1.3 + iInfo.y * 23.0) * (0.035 + 0.05 * ch);
        fp.x += fp.y * sw;
        vFig = (aPart < 0.5 || aPart > 2.5) ? iShirt : (aPart < 1.5 ? figSkin(fract(iInfo.y * 7.31)) : vec3(0.16, 0.18, 0.24));`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = fp;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFig;\nuniform float uFloodL;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vFig;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vFig * uFloodL * 0.32;');
  };
  m.customProgramCacheKey = () => 'lm-crowd-v1';
  return m;
}

function playerMaterial(g: GlobalUniforms, flood: { value: number }): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = g.uTime;
    sh.uniforms.uFloodL = flood;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aPart;
        attribute vec3 aJoint;
        attribute vec3 iShirt;
        attribute vec3 iShorts;
        attribute vec2 iRun; // phase, amplitude
        varying vec3 vFig;
        ${SKIN}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 objectNormal = normal;
        vec3 fp = position;
        float sw = sin(iRun.x) * iRun.y;
        float a = 0.0;
        if (aPart > 1.5 && aPart < 2.5) a = sw;
        else if (aPart > 2.5 && aPart < 3.5) a = -sw;
        else if (aPart > 3.5 && aPart < 4.5) a = -sw * 0.8;
        else if (aPart > 4.5) a = sw * 0.8;
        if (a != 0.0) {
          mat3 R = figRotX(a);
          fp = aJoint + R * (fp - aJoint);
          objectNormal = R * objectNormal;
        }
        fp.y += abs(cos(iRun.x)) * iRun.y * 0.12;
        vFig = aPart < 0.5 || aPart > 3.5 ? iShirt : (aPart < 1.5 ? figSkin(fract(float(gl_InstanceID) * 0.37)) : (fp.y > 0.45 ? iShorts : iShirt * 0.9));`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = fp;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFig;\nuniform float uFloodL;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vFig;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vFig * uFloodL * 0.55;');
  };
  m.customProgramCacheKey = () => 'lm-players-v1';
  return m;
}

interface Player {
  team: 0 | 1 | 2; // 2 = referee
  keeper: boolean;
  x: number; // pitch coords: x along the goal axis (+x = east goal), z across
  z: number;
  vx: number;
  vz: number;
  hx: number; // formation home
  hz: number;
  phase: number;
  speed: number;
  yaw: number;
}

type Mode = 'idle' | 'match' | 'training';

const MATCHES = [
  { start: 15.0, end: 16.75 },
  { start: 19.5, end: 21.25 },
];

export interface StadiumLife {
  describe(): string[];
}

export function createStadiumLife(env: Env, info: StadiumInfo, g: GlobalUniforms): StadiumLife {
  const rng = env.ctx.rng('landmarks-stadium');
  // AI space: x = goal axis (goals at x = ±G), z = across. The painted pitch has its goals at the
  // world z ends, so AI x maps to world z and AI z to world x.
  const F = info.F;
  const G = F - 1.2;
  const toWorld = (x: number, z: number): [number, number] => [info.cx + z, info.cz + x];

  // ── crowd
  const seats = info.seats.slice();
  // fill order: random rank, away fans concentrated in the south-east section
  const ranks = seats.map(() => rng.next());
  const order = seats.map((_, i) => i).sort((a, b) => ranks[a] - ranks[b]);
  const n = seats.length;
  const crowdGeo = seatedGeo();
  const iInfo = new Float32Array(n * 4);
  const iShirt = new Float32Array(n * 3);
  const homeCols = ['#c4202b', '#c4202b', '#d8333c', '#f1efe9', '#b81d26', '#c4202b'];
  const awayCols = ['#203a6b', '#2b4f8f', '#f1efe9', '#203a6b'];
  const neutral = ['#e9c46a', '#2a9d8f', '#f4a261', '#8d6cab', '#457b9d', '#6b705c', '#ffffff', '#3d405b'];
  const crowdU = { uWave: { value: new THREE.Vector2() }, uCheer: { value: new THREE.Vector2() } };
  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMaterial(g, crowdU, env.u.uFlood), n);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();
  order.forEach((si, k) => {
    const s = seats[si];
    q.setFromAxisAngle(up, s.yaw);
    mtx.compose(new THREE.Vector3(s.x, s.y, s.z), q, one);
    crowd.setMatrixAt(k, mtx);
    const away = s.stand === 2 && s.x - info.cx > F * 0.35;
    const neutralFan = !away && rng.chance(0.18);
    const team = away ? 1 : neutralFan ? 2 : 0;
    col.set(away ? rng.pick(awayCols) : neutralFan ? rng.pick(neutral) : rng.pick(homeCols));
    iShirt.set([col.r, col.g, col.b], k * 3);
    iInfo.set([s.ang, rng.next(), ranks[si], team], k * 4);
  });
  crowdGeo.setAttribute('iInfo', new THREE.InstancedBufferAttribute(iInfo, 4));
  crowdGeo.setAttribute('iShirt', new THREE.InstancedBufferAttribute(iShirt, 3));
  crowd.count = 0;
  crowd.castShadow = false;
  crowd.receiveShadow = true;
  crowd.name = 'landmarks-crowd';
  crowd.frustumCulled = false;
  env.extra.push(crowd);

  // ── players
  const NP = 13;
  const pGeo = playerGeo();
  const pShirt = new Float32Array(NP * 3);
  const pShorts = new Float32Array(NP * 3);
  const pRun = new Float32Array(NP * 2);
  const runAttr = new THREE.InstancedBufferAttribute(pRun, 2);
  runAttr.setUsage(THREE.DynamicDrawUsage);
  const shirtAttr = new THREE.InstancedBufferAttribute(pShirt, 3);
  const shortsAttr = new THREE.InstancedBufferAttribute(pShorts, 3);
  pGeo.setAttribute('iShirt', shirtAttr);
  pGeo.setAttribute('iShorts', shortsAttr);
  pGeo.setAttribute('iRun', runAttr);
  const players = new THREE.InstancedMesh(pGeo, playerMaterial(g, env.u.uFlood), NP);
  players.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  players.castShadow = true;
  players.receiveShadow = true;
  players.frustumCulled = false;
  players.name = 'landmarks-players';
  players.count = 0;
  env.extra.push(players);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
  ball.castShadow = false;
  ball.name = 'landmarks-ball';
  ball.visible = false;
  env.extra.push(ball);

  const P: Player[] = [];
  const formation: [number, number][] = [
    [-0.9, 0],
    [-0.55, -0.42],
    [-0.55, 0.42],
    [-0.15, 0],
    [0.15, -0.5],
    [0.32, 0.25],
  ];
  for (let t = 0; t < 2; t++)
    for (let i = 0; i < 6; i++) {
      const dir = t === 0 ? 1 : -1;
      const [fx, fz] = formation[i];
      P.push({ team: t as 0 | 1, keeper: i === 0, x: fx * F * dir, z: fz * F * dir, vx: 0, vz: 0, hx: fx * F * dir, hz: fz * F * dir, phase: rng.next() * 6, speed: 0, yaw: 0 });
    }
  P.push({ team: 2, keeper: false, x: 0, z: F * 0.6, vx: 0, vz: 0, hx: 0, hz: F * 0.6, phase: 0, speed: 0, yaw: 0 });
  const setKit = (training: boolean) => {
    P.forEach((p, i) => {
      let shirt = '#c4202b',
        shorts = '#f4f4f4';
      if (p.team === 1) {
        shirt = '#203a6b';
        shorts = '#f4f4f4';
      }
      if (p.keeper) {
        shirt = p.team === 0 ? '#f2d22e' : '#3fbf6a';
        shorts = '#222222';
      }
      if (p.team === 2) {
        shirt = '#1b1b1b';
        shorts = '#1b1b1b';
      }
      if (training && p.team !== 2) {
        shirt = i % 2 ? '#ff7a1a' : '#c4202b';
        shorts = '#2b2b2b';
      }
      col.set(shirt);
      pShirt.set([col.r, col.g, col.b], i * 3);
      col.set(shorts);
      pShorts.set([col.r, col.g, col.b], i * 3);
    });
    shirtAttr.needsUpdate = true;
    shortsAttr.needsUpdate = true;
  };
  setKit(false);

  // ── match state
  const score = [0, 0];
  let owner = -1; // player index with the ball
  const bl = { x: 0, z: 0, y: 0.16, fx: 0, fz: 0, tx: 0, tz: 0, t: 0, T: 0, arc: 0, flying: false, shot: false, target: -1 };
  let decide = 1.5;
  let resetIn = 0;
  let goalFlash = 0;
  let cheer = 0;
  let cheerTeam = 0;
  let wave = -1; // <0 idle, else progress
  let nextWave = 25;
  let mode: Mode = 'idle';
  let fill = 0;
  let matchMin = 0;
  let flood = 0;
  // clock jumps (setHours / UI time controls) snap the floodlights like main.ts snaps the street
  // lights: applied on the next update, normal clock flow keeps the ease
  let snapFlood = true;
  env.ctx.events.on('timejump', () => (snapFlood = true));
  const u = env.u;

  const kickoff = (team: number) => {
    P.forEach((p) => {
      p.x = p.hx;
      p.z = p.hz;
      p.vx = p.vz = 0;
    });
    const k = team === 0 ? 3 : 9;
    owner = k;
    P[k].x = 0;
    P[k].z = 0;
    bl.flying = false;
  };
  const passTo = (from: number, to: number, shot = false, tx = 0, tz = 0) => {
    const a = P[from];
    bl.fx = a.x;
    bl.fz = a.z;
    if (!shot) {
      const b = P[to];
      // lead the receiver a little
      bl.tx = b.x + b.vx * 0.5;
      bl.tz = b.z + b.vz * 0.5;
    } else {
      bl.tx = tx;
      bl.tz = tz;
    }
    const d = Math.hypot(bl.tx - bl.fx, bl.tz - bl.fz);
    bl.T = shot ? d / 16 + 0.15 : d / 11 + 0.2;
    bl.t = 0;
    bl.arc = shot ? 0.9 : Math.min(2.2, d * 0.09);
    bl.flying = true;
    bl.shot = shot;
    bl.target = to;
    owner = -1;
  };

  const stepMatch = (dt: number) => {
    // ball
    if (resetIn > 0) {
      resetIn -= dt;
      if (resetIn <= 0) kickoff(score[0] + score[1] > 0 && cheerTeam === 0 ? 1 : 0);
    }
    if (bl.flying) {
      bl.t += dt;
      const k = Math.min(bl.t / bl.T, 1);
      bl.x = bl.fx + (bl.tx - bl.fx) * k;
      bl.z = bl.fz + (bl.tz - bl.fz) * k;
      bl.y = 0.16 + Math.sin(k * Math.PI) * bl.arc;
      if (k >= 1) {
        bl.flying = false;
        if (bl.shot) {
          const side = Math.sign(bl.tx);
          const hw = info.goals[0]?.hw ?? 1.5;
          const keeper = P.findIndex((p) => p.keeper && (side > 0 ? p.team === 1 : p.team === 0));
          const inGoal = Math.abs(bl.tz) < hw;
          const saved = keeper >= 0 && Math.hypot(P[keeper].x - bl.tx, P[keeper].z - bl.tz) < 1.6 && rng.chance(0.55);
          if (inGoal && !saved) {
            const scorer = side > 0 ? 0 : 1;
            score[scorer]++;
            goalFlash = 6;
            cheer = 1;
            cheerTeam = scorer;
            bl.x = side * (G + 0.6);
            resetIn = 3.5;
          } else if (keeper >= 0) {
            owner = keeper;
          } else {
            owner = -1;
            resetIn = 1.5;
          }
        } else owner = bl.target;
      }
    } else if (owner >= 0) {
      const o = P[owner];
      bl.x = o.x + Math.sin(o.yaw) * 0.45;
      bl.z = o.z + Math.cos(o.yaw) * 0.45;
      bl.y = 0.16;
    }
    // decisions of the ball carrier
    decide -= dt;
    if (owner >= 0 && decide <= 0 && resetIn <= 0) {
      const o = P[owner];
      const dir = o.team === 0 ? 1 : -1;
      const goalX = dir * G;
      const dGoal = Math.abs(goalX - o.x);
      if (o.keeper) {
        const mates = P.map((p, i) => i).filter((i) => P[i].team === o.team && !P[i].keeper);
        passTo(owner, rng.pick(mates));
      } else if (dGoal < 7.5 && rng.chance(0.7)) {
        passTo(owner, -1, true, goalX + dir * 0.4, rng.range(-2.3, 2.3));
      } else if (rng.chance(0.6)) {
        const mates = P.map((p, i) => i).filter((i) => P[i].team === o.team && i !== owner && !P[i].keeper);
        // prefer forward passes
        mates.sort((a, b) => (P[b].x - P[a].x) * dir);
        passTo(owner, mates[Math.min(mates.length - 1, rng.int(0, 2))]);
      }
      decide = rng.range(1.0, 2.4);
    }
    // players
    const bx = bl.x,
      bz = bl.z;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      let tx: number, tz: number;
      let maxV = 4.2;
      const dir = p.team === 0 ? 1 : -1;
      if (p.team === 2) {
        tx = bx * 0.6;
        tz = Math.max(-F + 1, Math.min(F - 1, bz + (bz > 0 ? -5 : 5)));
        maxV = 3.2;
      } else if (p.keeper) {
        tx = -dir * (G - 0.45);
        tz = Math.max(-1.4, Math.min(1.4, bz * 0.3));
        maxV = 3.0;
      } else if (i === owner) {
        tx = p.x + dir * 3;
        tz = p.z + Math.sin(env.ctx.clock.simTime * 0.9 + i) * 2 - p.z * 0.15;
        maxV = 3.6;
      } else {
        // formation shifted towards the ball; the nearest player of each team chases it
        tx = p.hx + bx * 0.45;
        tz = p.hz * 0.8 + bz * 0.35;
        let nearest = true;
        const dMe = Math.hypot(bx - p.x, bz - p.z);
        for (let j = 0; j < P.length; j++) {
          if (j === i || P[j].team !== p.team || P[j].keeper) continue;
          if (Math.hypot(bx - P[j].x, bz - P[j].z) < dMe) {
            nearest = false;
            break;
          }
        }
        if (nearest && resetIn <= 0) {
          tx = bx;
          tz = bz;
          maxV = 4.8;
          // tackle
          if (owner >= 0 && P[owner].team !== p.team && dMe < 0.9 && rng.chance(dt * 0.9)) owner = i;
          // pick up a loose ball
          if (owner < 0 && !bl.flying && dMe < 0.6) owner = i;
        }
        if (!bl.flying && bl.target === i && dMe < 1.2) {
          owner = i;
          bl.target = -1;
        }
      }
      tx = Math.max(-F + 0.6, Math.min(F - 0.6, tx));
      tz = Math.max(-F + 0.6, Math.min(F - 0.6, tz));
      const dx = tx - p.x,
        dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      const want = Math.min(maxV, d * 1.6);
      const ax = d > 0.01 ? (dx / d) * want - p.vx : -p.vx;
      const az = d > 0.01 ? (dz / d) * want - p.vz : -p.vz;
      const k = Math.min(1, dt * 3.5);
      p.vx += ax * k;
      p.vz += az * k;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.speed = Math.hypot(p.vx, p.vz);
      if (p.speed > 0.3) p.yaw = Math.atan2(p.vx, p.vz);
      else if (p.team !== 2) p.yaw = Math.atan2(bx - p.x, bz - p.z);
      p.phase += dt * (4 + p.speed * 2.6);
    }
  };

  const stepTraining = (dt: number) => {
    // a rondo: 5 players in a circle pass the ball, one chases in the middle
    const ringR = 6;
    const ids = [0, 1, 2, 3, 4, 5];
    for (let k = 0; k < ids.length; k++) {
      const p = P[ids[k]];
      const a = (k / 5) * Math.PI * 2 + env.ctx.clock.simTime * 0.03;
      let tx = Math.cos(a) * ringR - F * 0.35,
        tz = Math.sin(a) * ringR;
      if (k === 5) {
        tx = bl.x;
        tz = bl.z;
      }
      const dx = tx - p.x,
        dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      const want = Math.min(k === 5 ? 3.5 : 2.5, d * 1.5);
      p.vx += ((d > 0.01 ? (dx / d) * want : 0) - p.vx) * Math.min(1, dt * 3);
      p.vz += ((d > 0.01 ? (dz / d) * want : 0) - p.vz) * Math.min(1, dt * 3);
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.speed = Math.hypot(p.vx, p.vz);
      p.yaw = p.speed > 0.3 ? Math.atan2(p.vx, p.vz) : Math.atan2(bl.x - p.x, bl.z - p.z);
      p.phase += dt * (4 + p.speed * 2.6);
    }
    if (bl.flying) {
      bl.t += dt;
      const k = Math.min(bl.t / bl.T, 1);
      bl.x = bl.fx + (bl.tx - bl.fx) * k;
      bl.z = bl.fz + (bl.tz - bl.fz) * k;
      bl.y = 0.16 + Math.sin(k * Math.PI) * bl.arc;
      if (k >= 1) {
        bl.flying = false;
        owner = bl.target;
      }
    } else if (owner >= 0) {
      const o = P[owner];
      bl.x = o.x + Math.sin(o.yaw) * 0.4;
      bl.z = o.z + Math.cos(o.yaw) * 0.4;
      bl.y = 0.16;
    } else owner = ids[0];
    decide -= dt;
    if (decide <= 0 && owner >= 0) {
      const others = ids.slice(0, 5).filter((i) => i !== owner);
      passTo(owner, rng.pick(others));
      decide = rng.range(0.8, 1.6);
    }
  };

  const updatePlayers = () => {
    let k = 0;
    const visible = mode === 'match' ? P.length : mode === 'training' ? 6 : 0;
    const ids = P.map((_, i) => i);
    for (let n2 = 0; n2 < visible; n2++) {
      const p = P[ids[n2]];
      const [wx, wz] = toWorld(p.x, p.z);
      q.setFromAxisAngle(up, Math.PI / 2 - p.yaw);
      mtx.compose(new THREE.Vector3(wx, 0.04, wz), q, one);
      players.setMatrixAt(k, mtx);
      pRun[k * 2] = p.phase;
      pRun[k * 2 + 1] = Math.min(0.85, p.speed * 0.2);
      k++;
    }
    players.count = k;
    players.visible = k > 0;
    players.instanceMatrix.needsUpdate = true;
    runAttr.needsUpdate = true;
    ball.visible = k > 0;
    if (ball.visible) {
      const [wx, wz] = toWorld(bl.x, bl.z);
      ball.position.set(wx, bl.y + 0.04, wz);
      ball.rotation.x += 0.1;
      ball.updateMatrix();
    }
  };
  ball.matrixAutoUpdate = false;

  let lastMode: Mode = 'idle';
  const update = (dt: number, ctx: CityContext) => {
    const h = ctx.clock.hours;
    // schedule
    let target = 0;
    let inMatch = false;
    let preOrPost = false;
    for (const m of MATCHES) {
      if (h >= m.start && h < m.end) {
        inMatch = true;
        matchMin = Math.min(90, Math.floor(((h - m.start) / (m.end - m.start)) * 90));
        target = 0.86;
      } else if (h >= m.start - 0.75 && h < m.start) {
        preOrPost = true;
        target = ((h - (m.start - 0.75)) / 0.75) * 0.8;
      } else if (h >= m.end && h < m.end + 0.5) {
        preOrPost = true;
        target = (1 - (h - m.end) / 0.5) * 0.8;
      }
    }
    const training = !inMatch && h >= 9.5 && h < 13.5;
    mode = inMatch ? 'match' : training ? 'training' : 'idle';
    if (mode !== lastMode) {
      if (mode === 'match') {
        score[0] = score[1] = 0;
        setKit(false);
        kickoff(0);
      } else if (mode === 'training') {
        setKit(true);
        P.forEach((p) => {
          p.x = p.hx;
          p.z = p.hz;
        });
        owner = 1;
        bl.flying = false;
      } else setKit(false);
      lastMode = mode;
    }
    // sub-step the simulation (dt can be large at 8x)
    let rem = Math.min(dt, 1.0);
    while (rem > 1e-4) {
      const st = Math.min(rem, 0.05);
      if (mode === 'match') stepMatch(st);
      else if (mode === 'training') stepTraining(st);
      rem -= st;
    }
    // attendance eases (also when time jumps)
    fill += (target - fill) * Math.min(1, dt * 0.6 + (Math.abs(target - fill) > 0.5 ? 1 : 0));
    crowd.count = Math.max(0, Math.min(n, Math.round(fill * n)));
    crowd.visible = crowd.count > 0;
    // cheering / wave
    cheer = Math.max(0, cheer - dt * 0.22);
    crowdU.uCheer.value.set(cheer, cheerTeam);
    if (mode === 'match') {
      nextWave -= dt;
      if (wave < 0 && nextWave <= 0) {
        wave = 0;
        nextWave = rng.range(40, 80);
      }
    }
    if (wave >= 0) {
      wave += dt / 9;
      crowdU.uWave.value.set(wave % 1, Math.min(1, wave * 4, (2.2 - wave) * 4));
      if (wave >= 2.2) {
        wave = -1;
        crowdU.uWave.value.set(0, 0);
      }
    }
    goalFlash = Math.max(0, goalFlash - dt);
    env.stats.match = mode === 'match' ? `${score[0]}-${score[1]} ${matchMin}'` : mode;
    u.uScore.value.set(score[0], score[1], matchMin, mode === 'match' ? (goalFlash > 0 ? 2 : 1) : 0);
    // floodlights: matches & the hour around them, once the light fades
    const dark = 1 - ctx.clock.daylight;
    const wantFlood = (inMatch || preOrPost) && (dark > 0.2 || h > 18.5) ? 1 : 0;
    if (snapFlood) flood = wantFlood;
    else flood += (wantFlood - flood) * Math.min(1, dt * 0.8 + 0.02);
    snapFlood = false;
    u.uFlood.value = flood;
    updatePlayers();
  };
  env.updaters.push(update);
  env.stats.crowdSeats = n;

  return {
    describe() {
      const h = env.hours();
      if (mode === 'match') return [`Haven FC ${score[0]} – ${score[1]} Rovers · ${matchMin}'`, `Crowd: ${crowd.count.toLocaleString()} fans`, 'Floodlights on after dusk'];
      if (mode === 'training') return ['Morning training session', 'Next match 15:00', `${n.toLocaleString()} seats`];
      const next = MATCHES.find((m) => m.start > h) ?? MATCHES[0];
      const hh = Math.floor(next.start),
        mm = Math.round((next.start - hh) * 60);
      return [`Next match ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · Haven FC v Rovers`, `${n.toLocaleString()} seats`, crowd.count > 0 ? `Fans arriving: ${crowd.count}` : 'Stands empty'];
    },
  };
}
