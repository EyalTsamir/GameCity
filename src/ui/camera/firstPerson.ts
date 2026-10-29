// First-person walk: stroll through Tinyhaven at eye level. No gameplay — only looking and walking.
//
// Owned by the camera module (src/ui/camera.ts): it routes canvas pointer input and keys here while the
// walk is active and skips its own orbit update; leaving hands the eye pose back so the orbit camera glides
// up from exactly there. Entering glides down from the current view to the spot under the cursor or the
// camera focus, snapped to the nearest place a person can stand (./walkSurface.ts).
//
// Controls: W A S D (arrows: ↑↓ walk, ←→ turn; Q E turn, R F look up / down), Shift jogs; mouse look with
// pointer lock (a click captures the mouse, Esc frees it) or by dragging; a click on something shows its
// info card; Esc (mouse free) or V leaves. Touch: the left third is a thumb stick, drag elsewhere to look.
// Feet follow the walking surface (curbs, stairs, decks, bridge arches) with a smooth step; the body slides
// along walls; a subtle head bob, footsteps through the audio module ('walk:step' events).

import * as THREE from 'three';
import type { CityContext, CameraState, PickHit } from '../../core/context';
import type { PointerInfo } from '../shared';
import { WalkSurface } from './walkSurface';
import { WalkHud } from '../hud/walkHud';
import { OCC } from '../../core/occupancy';
import { DIORAMA } from '../../core/world';

const DEG = Math.PI / 180;
/** eye above the feet (m) */
const EYE = 1.65;
/** body radius kept from walls, trunks and posts (the near plane's corners stay clear of a flat wall) */
const RADIUS = 0.42;
/** walking / jogging speed (m/s) */
const WALK = 1.4;
const JOG = 3.4;
/** highest step taken in one stride (curbs 0.15, stair risers 0.16, a deck edge 0.3) and the deepest drop */
const STEP_UP = 0.36;
const STEP_DOWN = 0.6;
/** steepest natural slope walked up / down (rise per metre) */
const SLOPE_UP = 0.9;
const SLOPE_DOWN = 1.25;
/** sub-step length of the collision walk (m) */
const SUB = 0.18;
/** vertical field of view at eye level (wider on portrait screens) */
const FOV = 66;
const FOV_TALL = 74;
const NEAR = 0.2;
/** focus distance reported to the lens / shadow fit: far enough that the lens never blurs at eye level */
const FOCUS = 30;
/** mouse look: pointer lock (rad per px) */
const LOCK_SENS = 0.0021;
const MAX_PITCH = 82 * DEG;
const CLICK_PX = 5;
/** how far things may wander off before their info card closes (m) */
const INSPECT_MAX = 160;

export interface WalkHost {
  pointer: PointerInfo;
  pickAt(x: number, y: number): PickHit | null;
  /** the orbit camera takes over again from this eye pose (seamless); `rise` → glide up to a low orbit view */
  release(eye: THREE.Vector3, viewYaw: number, viewPitch: number, rise: boolean): void;
  toast(msg: string): void;
  emit(name: string, payload?: unknown): void;
  /** where the orbit pivot may go: the walk keeps to it too */
  bounds: { x0: number; z0: number; x1: number; z1: number };
  far: number;
}

interface Glide {
  t: number;
  dur: number;
  p0: THREE.Vector3;
  q0: THREE.Quaternion;
  fov0: number;
  near0: number;
}

interface LookDrag {
  id: number;
  sx: number;
  sy: number;
  lx: number;
  ly: number;
  moved: boolean;
  touch: boolean;
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

function damp(k: number, dt: number): number {
  return 1 - Math.exp(-k * dt);
}

function smoother(t: number): number {
  t = clamp(t, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function wrapPi(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _eye = new THREE.Vector3();

export class FirstPerson {
  /** walking (or gliding down into the walk) */
  active = false;
  /** the thing clicked while walking (its info card is open) */
  inspected: PickHit | null = null;

  private readonly ctx: CityContext;
  private readonly host: WalkHost;
  private surf: WalkSurface | null = null;
  private hud: WalkHud | null = null;
  private readonly automated = (navigator as Navigator & { webdriver?: boolean }).webdriver === true;

  // body
  private x = 0;
  private z = 0;
  /** feet height shown (eased towards the surface) and its rate */
  private feet = 0;
  private feetV = 0;
  /** view heading: faces (sin yaw, cos yaw); pitch > 0 looks up */
  private yaw = 0;
  private pitch = 0;
  private vx = 0;
  private vz = 0;
  /** side (±1) the last blocked step veered to */
  private veer = 1;
  private glide: Glide | null = null;
  // head bob / footsteps
  private phase = 0;
  private bob = 0;
  private jogT = 0;
  // input
  private readonly keys = new Set<string>();
  private shift = false;
  private locked = false;
  private unlockedAt = -1e9;
  private drag: LookDrag | null = null;
  private stick: { id: number; ox: number; oy: number; dx: number; dy: number } | null = null;
  private inspectCheck = 0;
  /** the diorama's tilt-shift was switched off for the walk (restored on leaving) */
  private dofOff = false;
  /** stats */
  private walked = 0;
  private blocked = 0;

  constructor(ctx: CityContext, host: WalkHost) {
    this.ctx = ctx;
    this.host = host;
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  private surface(): WalkSurface {
    if (this.surf) return this.surf;
    const terrain = this.ctx.services.terrain as { height?: (x: number, z: number) => number } | undefined;
    const land = this.ctx.services.landscape as { active?: boolean; height(x: number, z: number): number; isWater(x: number, z: number): boolean } | undefined;
    const plan = this.ctx.plan;
    const inSlab = (x: number, z: number) => x >= plan.slab.x0 && x <= plan.slab.x1 && z >= plan.slab.z0 && z <= plan.slab.z1;
    const world = !DIORAMA && !!land?.active;
    const ground = (x: number, z: number): number => {
      if (inSlab(x, z)) return terrain?.height ? terrain.height(x, z) : plan.heightAt(x, z);
      return world ? land!.height(x, z) : 0;
    };
    this.surf = new WalkSurface(this.ctx, { ground, outsideWater: world ? (x, z) => land!.isWater(x, z) : null });
    return this.surf;
  }

  private overlay(): WalkHud {
    if (!this.hud) this.hud = new WalkHud(this.ctx.uiRoot);
    return this.hud;
  }

  // ───────────────────────────────────────────── enter / leave

  /**
   * Start walking from the walkable spot nearest to (x, z), facing `viewYaw`. Glides down from the current
   * camera. Returns false (with a toast) when there is nowhere to stand nearby.
   */
  enter(x: number, z: number, viewYaw: number, capture: boolean): boolean {
    const s = this.surface();
    const spot = this.snap(x, z);
    if (!spot) {
      this.host.toast('Nowhere to stand around here — try a street');
      return false;
    }
    const cam = this.ctx.camera;
    this.x = spot.x;
    this.z = spot.z;
    this.feet = s.heightAt(spot.x, spot.z);
    this.feetV = 0;
    this.yaw = viewYaw;
    this.pitch = -3 * DEG;
    this.vx = this.vz = 0;
    this.phase = this.bob = this.jogT = 0;
    this.keys.clear();
    this.drag = null;
    this.stick = null;
    const dist = cam.position.distanceTo(_eye.set(this.x, this.feet + EYE, this.z));
    this.glide = {
      t: 0,
      dur: clamp(0.9 + Math.log2(1 + dist / 25) * 0.42, 0.9, 2.6),
      p0: cam.position.clone(),
      q0: cam.quaternion.clone(),
      fov0: cam.fov,
      near0: cam.near,
    };
    this.active = true;
    // ?diorama: the tilt-shift look (miniature blur) is for the tabletop view, not for standing in the street
    // (world mode's natural lens stays idle at FOCUS anyway)
    const fx = this.ctx.services.postfx;
    this.dofOff = false;
    if (DIORAMA && fx) {
      try {
        if (fx.isEnabled('dof')) {
          fx.setEnabled('dof', false);
          this.dofOff = true;
        }
      } catch {
        /* ignore */
      }
    }
    const hud = this.overlay();
    hud.show(true);
    const lock = capture && !this.automated;
    hud.setHint(lock ? 'enter' : 'free', 10);
    if (lock) this.requestLock();
    this.host.emit('camera:walk', true);
    return true;
  }

  /** stop walking: the orbit camera takes over from the eye (`rise`: and glides up to look around) */
  exit(rise: boolean): void {
    if (!this.active) return;
    const cam = this.ctx.camera;
    cam.getWorldDirection(_v);
    const viewYaw = Math.atan2(_v.x, _v.z);
    const viewPitch = Math.asin(clamp(_v.y, -1, 1));
    this.active = false;
    this.glide = null;
    this.keys.clear();
    this.drag = null;
    this.stick = null;
    this.vx = this.vz = 0;
    if (this.locked) {
      try {
        document.exitPointerLock();
      } catch {
        /* ignore */
      }
    }
    this.host.pointer.dragging = false;
    this.setInspected(null);
    this.hud?.show(false);
    if (this.dofOff) {
      this.dofOff = false;
      try {
        this.ctx.services.postfx?.setEnabled('dof', true);
      } catch {
        /* ignore */
      }
    }
    this.host.release(cam.position.clone(), viewYaw, viewPitch, rise);
    this.host.emit('camera:walk', false);
  }

  /** nearest walkable spot to (x, z) within 60 m, preferring sidewalks and paths over the carriageway */
  private snap(x: number, z: number): { x: number; z: number } | null {
    const s = this.surface();
    const b = this.host.bounds;
    x = clamp(x, b.x0 + 1, b.x1 - 1);
    z = clamp(z, b.z0 + 1, b.z1 - 1);
    let best: { x: number; z: number } | null = null;
    let bestScore = Infinity;
    for (let r = 0; r <= 60 && r < bestScore; r += 0.75) {
      const n = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / 0.75);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r,
          pz = z + Math.sin(a) * r;
        if (px < b.x0 || px > b.x1 || pz < b.z0 || pz > b.z1) continue;
        if (!s.clear(px, pz, RADIUS + 0.15)) continue;
        const f = s.flags(px, pz);
        const score = r + (f & OCC.ROAD ? 6 : 0) + (f & (OCC.SIDEWALK | OCC.PATH | OCC.PAVED) ? 0 : 2);
        if (score < bestScore) {
          bestScore = score;
          best = { x: px, z: pz };
        }
      }
    }
    return best;
  }

  // ───────────────────────────────────────────── per frame

  frame(dt: number): void {
    if (!this.active) return;
    const s = this.surface();
    if (this.glide) {
      this.updateGlide(dt);
      return;
    }
    // ── look (keys)
    const k = (c: string) => (this.keys.has(c) ? 1 : 0);
    const turn = k('ArrowLeft') + k('KeyQ') - k('ArrowRight') - k('KeyE');
    const tilt = k('KeyR') - k('KeyF');
    if (turn) this.yaw += turn * 1.9 * dt;
    if (tilt) this.pitch = clamp(this.pitch + tilt * 1.2 * dt, -MAX_PITCH, MAX_PITCH);
    // ── walk
    let fwd = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown');
    let side = k('KeyD') - k('KeyA');
    let analog = 1;
    if (this.stick) {
      const R = 48;
      const m = Math.min(1, Math.hypot(this.stick.dx, this.stick.dy) / R);
      if (m > 0.12) {
        fwd = -this.stick.dy / R;
        side = this.stick.dx / R;
        analog = m;
      }
    }
    const len = Math.hypot(fwd, side);
    const jog = this.shift || (!!this.stick && analog > 0.92);
    const speed = (jog ? JOG : WALK) * Math.min(1, analog);
    const fx = Math.sin(this.yaw),
      fz = Math.cos(this.yaw);
    // right of the heading = (−cos yaw, sin yaw)
    let wx = 0,
      wz = 0;
    if (len > 1e-3) {
      wx = ((fwd * fx - side * fz) / len) * speed;
      wz = ((fwd * fz + side * fx) / len) * speed;
    }
    const a = damp(len > 1e-3 ? 7 : 9, dt);
    this.vx += (wx - this.vx) * a;
    this.vz += (wz - this.vz) * a;
    if (Math.abs(this.vx) + Math.abs(this.vz) < 1e-3) this.vx = this.vz = 0;
    const x0 = this.x,
      z0 = this.z;
    if (this.vx || this.vz) this.move(this.vx * dt, this.vz * dt);
    const moved = Math.hypot(this.x - x0, this.z - z0);
    this.walked += moved;
    // ── feet: up a step briskly, down it a little softer (critically damped spring)
    const target = s.heightAt(this.x, this.z);
    const w = target > this.feet ? 22 : 15;
    const sub = Math.max(1, Math.ceil(dt / 0.016));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      this.feetV += (w * w * (target - this.feet) - 2 * w * this.feetV) * h;
      this.feet += this.feetV * h;
    }
    if (Math.abs(target - this.feet) > 1.2) {
      this.feet = target;
      this.feetV = 0;
    }
    // ── head bob + footsteps (one step per half bob period)
    const sp = dt > 0 ? moved / dt : 0;
    this.jogT += ((sp > (WALK + JOG) / 2 ? 1 : 0) - this.jogT) * damp(4, dt);
    this.bob += (clamp(sp / WALK, 0, 1) - this.bob) * damp(6, dt);
    const stride = 0.7 + 0.35 * this.jogT;
    const prevStep = Math.floor(this.phase / Math.PI);
    this.phase += (moved / stride) * Math.PI;
    if (Math.floor(this.phase / Math.PI) !== prevStep && sp > 0.3) {
      this.host.emit('walk:step', { x: this.x, y: this.feet, z: this.z, surface: s.material(this.x, this.z), jog: this.jogT > 0.5 });
    }
    // the inspected thing still around?
    this.inspectCheck -= dt;
    if (this.inspected && this.inspectCheck <= 0) {
      this.inspectCheck = 0.5;
      let ok = false;
      try {
        ok = this.inspected.getPosition(_v);
      } catch {
        ok = false;
      }
      if (!ok || Math.hypot(_v.x - this.x, _v.z - this.z) > INSPECT_MAX) this.setInspected(null);
    }
    this.apply();
  }

  /** walk (dx, dz) in sub-steps; a blocked step slides along the wall (axis by axis) */
  private move(dx: number, dz: number): void {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / SUB));
    const sx = dx / n,
      sz = dz / n;
    for (let i = 0; i < n; i++) {
      if (this.canStep(this.x + sx, this.z + sz)) {
        this.x += sx;
        this.z += sz;
        continue;
      }
      // slide: keep the component along the wall (the larger one first)
      const xFirst = Math.abs(sx) >= Math.abs(sz);
      let ok = false;
      for (const ax of xFirst ? [0, 1] : [1, 0]) {
        const tx = ax === 0 ? this.x + sx : this.x,
          tz = ax === 0 ? this.z : this.z + sz;
        if ((ax === 0 ? sx : sz) !== 0 && this.canStep(tx, tz)) {
          this.x = tx;
          this.z = tz;
          if (ax === 0) this.vz *= 0.5;
          else this.vx *= 0.5;
          ok = true;
          break;
        }
      }
      // round things (trunks, posts, café tables) and corners: veer round them — the way already taken first,
      // so the body does not dither from side to side
      for (let j = 0; j < 4 && !ok; j++) {
        const ang = (j < 2 ? 0.6 : 1.15) * (j % 2 === 0 ? this.veer : -this.veer);
        const c = Math.cos(ang),
          sn = Math.sin(ang);
        const tx = this.x + (sx * c - sz * sn) * c,
          tz = this.z + (sx * sn + sz * c) * c;
        if (this.canStep(tx, tz)) {
          this.x = tx;
          this.z = tz;
          this.veer = Math.sign(ang);
          ok = true;
        }
      }
      if (!ok) {
        this.blocked++;
        this.vx *= 0.3;
        this.vz *= 0.3;
        break;
      }
    }
  }

  /** may the body move from where it stands to (nx, nz)? (solids, steps, slopes, the world's bounds) */
  private canStep(nx: number, nz: number): boolean {
    const b = this.host.bounds;
    if (nx < b.x0 || nx > b.x1 || nz < b.z0 || nz > b.z1) return false;
    const s = this.surface();
    if (!s.clear(nx, nz, RADIUS)) return false;
    const hNow = s.heightAt(this.x, this.z);
    const hNew = s.heightAt(nx, nz);
    const dh = hNew - hNow;
    if (dh > STEP_UP || dh < -STEP_DOWN) return false;
    // natural slopes (hills, banks): the rise per metre along the step, over a 1 m baseline
    const d = Math.hypot(nx - this.x, nz - this.z);
    if (d > 1e-6) {
      const ux = (nx - this.x) / d,
        uz = (nz - this.z) / d;
      const g = s.heightAt(nx + ux * 0.5, nz + uz * 0.5) - s.heightAt(nx - ux * 0.5, nz - uz * 0.5);
      if (g > SLOPE_UP && g < STEP_UP * 2.5) return false;
      if (g < -SLOPE_DOWN && g > -STEP_DOWN * 2.5) return false;
    }
    return true;
  }

  private updateGlide(dt: number): void {
    const g = this.glide!;
    const cam = this.ctx.camera;
    g.t += dt;
    const u = clamp(g.t / g.dur, 0, 1);
    // across first, then down: the last stretch is a near-vertical drop into the street
    const eh = smoother(u / 0.78);
    const ev = smoother(u);
    _eye.set(this.x, this.feet + EYE, this.z);
    cam.position.set(g.p0.x + (_eye.x - g.p0.x) * eh, g.p0.y + (_eye.y - g.p0.y) * ev, g.p0.z + (_eye.z - g.p0.z) * eh);
    _q.setFromEuler(_euler.set(this.pitch, this.yaw + Math.PI, 0, 'YXZ'));
    cam.quaternion.copy(g.q0).slerp(_q, smoother(u / 0.9));
    cam.fov = g.fov0 + (this.fov() - g.fov0) * ev;
    cam.near = Math.exp(Math.log(g.near0) + (Math.log(NEAR) - Math.log(g.near0)) * ev);
    cam.far = this.host.far;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    if (u >= 1) {
      this.glide = null;
      this.apply();
    }
  }

  private fov(): number {
    const aspect = this.ctx.camera.aspect || 1.6;
    return aspect >= 1.5 ? FOV : FOV + (FOV_TALL - FOV) * clamp((1.5 - aspect) / 0.8, 0, 1);
  }

  /** place the camera at the eye */
  private apply(): void {
    const cam = this.ctx.camera;
    // bob: lowest when a foot strikes, highest mid-stride; a little sway from foot to foot
    const amp = this.bob * (0.022 + 0.026 * this.jogT);
    const bobY = -amp * Math.cos(2 * this.phase);
    const sway = this.bob * (0.016 + 0.01 * this.jogT) * Math.sin(this.phase);
    const rx = -Math.cos(this.yaw),
      rz = Math.sin(this.yaw);
    cam.position.set(this.x + rx * sway, this.feet + EYE + bobY, this.z + rz * sway);
    cam.quaternion.setFromEuler(_euler.set(this.pitch, this.yaw + Math.PI, 0, 'YXZ'));
    cam.up.set(0, 1, 0);
    cam.fov = this.fov();
    cam.near = NEAR;
    cam.far = this.host.far;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** CameraState for the other modules: a focus point straight ahead (shadow fit, lens, audio, labels) */
  state(): CameraState {
    const cam = this.ctx.camera;
    cam.getWorldDirection(_v);
    const p = cam.position;
    return {
      target: { x: p.x + _v.x * FOCUS, y: p.y + _v.y * FOCUS, z: p.z + _v.z * FOCUS },
      distance: FOCUS,
      // orbit convention: yaw of the camera seen from the target, pitch of the camera above it
      yaw: wrapPi(Math.atan2(-_v.x, -_v.z)) / DEG,
      pitch: -Math.asin(clamp(_v.y, -1, 1)) / DEG,
    };
  }

  busy(): boolean {
    return !!this.glide || !!this.drag?.moved || Math.abs(this.vx) + Math.abs(this.vz) > 0.05;
  }

  // ───────────────────────────────────────────── input (routed from the camera module)

  /** keydown / keyup; returns true when the walk used the key (the orbit camera must not see it) */
  key(e: KeyboardEvent, down: boolean): boolean {
    this.shift = e.shiftKey;
    if (!this.active) return false;
    const c = e.code;
    const MOVE = c === 'KeyW' || c === 'KeyA' || c === 'KeyS' || c === 'KeyD' || c === 'KeyQ' || c === 'KeyE' || c === 'KeyR' || c === 'KeyF' || c.startsWith('Arrow');
    if (MOVE) {
      if (down) this.keys.add(c);
      else this.keys.delete(c);
      if (c.startsWith('Arrow')) e.preventDefault();
      return true;
    }
    if (c === 'ShiftLeft' || c === 'ShiftRight') return true;
    if (!down) return false;
    // zoom keys mean nothing at eye level
    if (c === 'Equal' || c === 'Minus' || c === 'NumpadAdd' || c === 'NumpadSubtract' || c === 'PageUp' || c === 'PageDown') return true;
    if (c === 'Escape') {
      if (e.repeat) return true;
      // the Esc that released the captured mouse is not also a request to stop walking
      if (this.locked || performance.now() - this.unlockedAt < 300) return true;
      if (this.inspected) this.setInspected(null);
      else this.exit(true);
      return true;
    }
    return false;
  }

  pointerDown(e: PointerEvent, x: number, y: number): void {
    const P = this.host.pointer;
    P.x = x;
    P.y = y;
    if (this.glide || this.locked) return;
    const cv = this.ctx.canvas;
    if (e.pointerType === 'touch') {
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (!this.stick && x < (this.ctx.size.width || cv.clientWidth) * 0.36) {
        this.stick = { id: e.pointerId, ox: x, oy: y, dx: 0, dy: 0 };
        this.overlay().setStick({ x, y, dx: 0, dy: 0 });
        return;
      }
      if (!this.drag) this.drag = { id: e.pointerId, sx: x, sy: y, lx: x, ly: y, moved: false, touch: true };
      return;
    }
    if (this.drag || (e.button !== 0 && e.button !== 2)) return;
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.drag = { id: e.pointerId, sx: x, sy: y, lx: x, ly: y, moved: false, touch: false };
    e.preventDefault();
  }

  pointerMove(e: PointerEvent, x: number, y: number): void {
    const P = this.host.pointer;
    if (this.locked) {
      // captured mouse: turn with the raw movement (right = turn right, down = look down)
      if (!this.glide) {
        this.yaw -= (e.movementX || 0) * LOCK_SENS;
        this.pitch = clamp(this.pitch - (e.movementY || 0) * LOCK_SENS, -MAX_PITCH, MAX_PITCH);
      }
      return;
    }
    P.x = x;
    P.y = y;
    P.movedAt = performance.now();
    if (this.stick && this.stick.id === e.pointerId) {
      let dx = x - this.stick.ox,
        dy = y - this.stick.oy;
      const m = Math.hypot(dx, dy);
      if (m > 48) {
        dx *= 48 / m;
        dy *= 48 / m;
      }
      this.stick.dx = dx;
      this.stick.dy = dy;
      this.overlay().setStick({ x: this.stick.ox, y: this.stick.oy, dx, dy });
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(x - d.sx, y - d.sy) > CLICK_PX) {
      d.moved = true;
      P.dragging = true;
    }
    if (!d.moved) return;
    // drag = grab the view: the point under the finger / cursor stays under it
    const cam = this.ctx.camera;
    const H = this.ctx.size.height || cam.aspect || 720;
    const kv = (cam.fov * DEG) / H;
    this.yaw += (x - d.lx) * kv;
    this.pitch = clamp(this.pitch + (y - d.ly) * kv, -MAX_PITCH, MAX_PITCH);
    d.lx = x;
    d.ly = y;
  }

  pointerUp(e: PointerEvent, x: number, y: number): void {
    const cv = this.ctx.canvas;
    try {
      if (cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (this.stick && this.stick.id === e.pointerId) {
      this.stick = null;
      this.overlay().setStick(null);
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) {
      // a click while the mouse is captured: what is under the centre dot
      if (this.locked && e.type === 'pointerup' && e.button === 0) this.click(this.ctx.size.width / 2, this.ctx.size.height / 2, false);
      return;
    }
    this.drag = null;
    this.host.pointer.dragging = false;
    if (!d.moved && e.type === 'pointerup' && (d.touch || e.button === 0)) this.click(x, y, !d.touch);
  }

  /** a plain click: a thing → its info card; nothing → capture the mouse for looking around */
  private click(x: number, y: number, mayCapture: boolean): void {
    let hit: PickHit | null = null;
    try {
      hit = this.host.pickAt(x, y);
    } catch {
      hit = null;
    }
    this.host.emit('select', hit);
    if (hit) {
      if (!this.inspected || this.inspected.id !== hit.id || this.inspected.kind !== hit.kind) this.setInspected(hit);
      return;
    }
    if (this.inspected) this.setInspected(null);
    else if (mayCapture) this.requestLock();
  }

  setInspected(hit: PickHit | null): void {
    if (hit === this.inspected) return;
    this.inspected = hit;
    this.inspectCheck = 0.5;
    this.host.emit('camera:follow', hit);
  }

  private requestLock(): void {
    if (this.automated || this.locked) return;
    const cv = this.ctx.canvas as HTMLCanvasElement & { requestPointerLock(): Promise<void> | void };
    if (typeof cv.requestPointerLock !== 'function') return;
    try {
      const r = cv.requestPointerLock();
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => undefined);
    } catch {
      /* not allowed here (no user gesture, an iframe…): drag to look instead */
    }
  }

  private onLockChange = (): void => {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.ctx.canvas;
    const P = this.host.pointer;
    if (this.locked) {
      P.inside = false;
      P.dragging = false;
      this.drag = null;
    } else if (was) {
      this.unlockedAt = performance.now();
      P.inside = true;
      if (this.active) this.hud?.setHint('free', 7);
    }
    this.hud?.setLocked(this.locked && this.active);
  };

  clearInput(): void {
    this.keys.clear();
    this.shift = false;
    this.drag = null;
    this.stick = null;
    this.hud?.setStick(null);
  }

  stats(): Record<string, number | string> {
    return { walkX: Math.round(this.x * 10) / 10, walkZ: Math.round(this.z * 10) / 10, walkFeet: Math.round(this.feet * 100) / 100, walked: Math.round(this.walked), blockedSteps: this.blocked, locked: this.locked ? 'yes' : 'no' };
  }

  /** problems for the camera module's invariants() */
  invariants(): string[] {
    if (!this.active || this.glide) return [];
    const out: string[] = [];
    const s = this.surface();
    if (![this.x, this.z, this.feet, this.yaw, this.pitch].every(Number.isFinite)) out.push('walk pose is not finite');
    else {
      if (s.solidAt(this.x, this.z)) out.push(`walker inside a solid at (${this.x.toFixed(1)}, ${this.z.toFixed(1)})`);
      const h = s.heightAt(this.x, this.z);
      if (Math.abs(this.feet - h) > 0.5) out.push(`walker feet ${this.feet.toFixed(2)} far from the ground ${h.toFixed(2)}`);
    }
    return out;
  }

  /** debug: what the walk model sees at (x, z) */
  probe(x: number, z: number): Record<string, unknown> {
    return { ...this.surface().probe(x, z, RADIUS), canStep: this.active ? this.canStep(x, z) : null };
  }

  /** debug / tests: current body (x, z, feet, surface height) */
  debug(): { x: number; z: number; feet: number; ground: number; yaw: number; pitch: number; locked: boolean; gliding: boolean } {
    const s = this.surface();
    return { x: this.x, z: this.z, feet: this.feet, ground: s.heightAt(this.x, this.z), yaw: this.yaw, pitch: this.pitch, locked: this.locked, gliding: !!this.glide };
  }

  dispose(): void {
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.hud?.dispose();
  }
}
