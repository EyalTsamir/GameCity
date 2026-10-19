// Module "camera": orbit-style diorama camera with damping & inertia, grab-panning,
// zoom towards the cursor, keyboard / touch controls, follow & chase cams, eased flights
// between points of interest, a cinematic auto-tour and an establishing shot on load.
//
// Registers ctx.services.camera (core type + the extras in ./shared.ts).

import * as THREE from 'three';
import type { CityContext, CityModule, CameraState, PickHit } from '../core/context';
import type { Poi } from '../core/plan';
import { SurfaceField } from './camera/surface';
import { Scout, type LiveEntity } from './camera/scout';
import { TourDirector, type Pose, type TourRig } from './camera/tour';
import { buildDebugProxy } from './camera/debugProxy';
import type { CameraServiceExt, PointerInfo, TourShotInfo } from './shared';
import { WORLD_MODE } from '../core/world';

const DEG = Math.PI / 180;
const MIN_PITCH = 10 * DEG;
const MAX_PITCH = 85 * DEG;
const MIN_DIST = 12;
const MAX_DIST = 750;
const CHASE_MIN_DIST = 5;
const TARGET_MARGIN = 30;
const BASE_FOV = 32;
const CHASE_FOV = 42;
// world mode (world agent's grant): the far plane reaches the sea horizon and the mountain layers;
// a wider lens at eye level easing to a longer one toward the overview (diorama keeps BASE_FOV)
const WORLD_FAR = 60000;
const WORLD_FOV_NEAR = 50;
const WORLD_FOV_FAR = 34;
const WORLD_FOV_D0 = 12;
const WORLD_FOV_D1 = 380;
function worldFov(d: number): number {
  const t = Math.min(1, Math.max(0, (Math.log(Math.max(d, 1)) - Math.log(WORLD_FOV_D0)) / (Math.log(WORLD_FOV_D1) - Math.log(WORLD_FOV_D0))));
  return WORLD_FOV_NEAR + (WORLD_FOV_FAR - WORLD_FOV_NEAR) * t * t * (3 - 2 * t);
}

const CLICK_PX = 5;
const DBL_MS = 380;

/** aircraft (balloon / blimp / plane) count as "air" targets above this height (with hysteresis) */
const AIR_ON = 22;
const AIR_OFF = 12;
/** following aircraft: the pivot may leave the slab by this much (then the follow ends gracefully) */
const AIR_MARGIN = 340;
const AIR_MAX_Y = 340;
const AIR_MIN_PITCH = 3 * DEG;
/** low-orbit collision: roofs up to this far above the camera are glided over, taller ones pull the arm in */
const LIFT_MAX = 7;
/** clearance kept between the orbit camera and facades (m) */
const ARM_MARGIN = 1.0;
/** a camera this close to a footprint counts as over the roof (lift) / inside it (escape) */
const ROOF_MARGIN = 0.3;
/** look-ahead horizon (s) used to start moving the orbit arm before it reaches a facade */
const ARM_HORIZON = 0.62;
/** below this orbit distance the camera keeps a line of sight to the pivot */
const LOS_DIST = 100;
/** free camera (default): the orbit may come this close / this low (guided: MIN_DIST / MIN_PITCH) */
const FREE_MIN_DIST = 3;
const FREE_MIN_PITCH = 2 * DEG;

interface Flight {
  from: Pose;
  to: Pose;
  t: number;
  dur: number;
  arc: number;
  pitchArc: number;
  /** recompute `to` each frame from the followed entity */
  track: boolean;
  kind: 'user' | 'tour' | 'intro' | 'follow';
  /** the camera arm was unobstructed when the flight began (tracked flights may then fly free at first) */
  occFree: boolean;
  /** take-off from between buildings: the pivot first rises this far while the distance holds… */
  rise: number;
  /** …for this fraction of the flight */
  hold: number;
}

interface FollowState {
  hit: PickHit;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  heading: number;
  smoothHeading: number;
  /** aim this high above the ground (the picker's position may be the base or the centre) */
  aim: number;
  /** yaw is relative to the entity heading (chase / tour) */
  relative: boolean;
  relYaw: number;
  /** tour-style follow: no UI card, no chase toggle */
  tour: boolean;
  chase: boolean;
  /** pose to return to when chase ends */
  preChase: { dist: number; pitch: number } | null;
  first: boolean;
  /** moves on the ground / water, stands still (building, landmark), or flies */
  cls: TargetClass;
  /** horizontal radius of the target's own volume: occlusion tests start beyond it (static targets) */
  ownR: number;
  /** closest comfortable orbit distance for this target */
  minDist: number;
  /** seconds the target has spent below the terrain surface (driving into a tunnel) */
  under: number;
  /** the user turned the camera around this target (stops automatic framing like the aircraft swing) */
  userTurned: boolean;
}

type TargetClass = 'ground' | 'static' | 'air';

function wrapPi(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
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

function copyPose(dst: Pose, src: Pose): Pose {
  dst.tx = src.tx;
  dst.ty = src.ty;
  dst.tz = src.tz;
  dst.dist = src.dist;
  dst.yaw = src.yaw;
  dst.pitch = src.pitch;
  return dst;
}

function newPose(): Pose {
  return { tx: 0, ty: 0, tz: 0, dist: 100, yaw: 0, pitch: 0.5 };
}

function chaseParams(kind: PickHit['kind']): { dist: number; pitch: number; aim: number; follow: number } {
  switch (kind) {
    case 'pedestrian':
      return { dist: 7.5, pitch: 13 * DEG, aim: 1.15, follow: 24 };
    case 'bus':
      return { dist: 21, pitch: 14 * DEG, aim: 1.7, follow: 48 };
    case 'train':
      return { dist: 36, pitch: 13 * DEG, aim: 2.4, follow: 85 };
    case 'boat':
      return { dist: 30, pitch: 15 * DEG, aim: 1.3, follow: 70 };
    case 'vehicle':
      return { dist: 11.5, pitch: 15 * DEG, aim: 0.85, follow: 36 };
    default:
      return { dist: 30, pitch: 22 * DEG, aim: 0, follow: 70 };
  }
}

/** aircraft: a chase from behind and above, steep enough to keep the town in the backdrop */
const AIR_PARAMS = { dist: 70, pitch: 18 * DEG, aim: 0, follow: 115 };

export default function create(ctx: CityContext): CityModule {
  const { plan, canvas, camera } = ctx;
  const field = new SurfaceField(plan);
  const scout = new Scout(ctx);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _pos = new THREE.Vector3();
  const _tgt = new THREE.Vector3();
  const _hit = new THREE.Vector3();

  /** middle of the town (aircraft framing looks towards it) */
  const townX = (plan.slab.x0 + plan.slab.x1) / 2,
    townZ = (plan.slab.z0 + plan.slab.z1) / 2;
  const bounds = {
    x0: plan.slab.x0 - TARGET_MARGIN,
    x1: plan.slab.x1 + TARGET_MARGIN,
    z0: plan.slab.z0 - TARGET_MARGIN,
    z1: plan.slab.z1 + TARGET_MARGIN,
  };

  const overview = plan.pois.find((p) => p.id === 'overview') ?? plan.pois[0];
  const poiPose = (p: Poi | Partial<CameraState>, base: Pose): Pose => ({
    tx: p.target?.x ?? base.tx,
    ty: p.target?.y ?? base.ty,
    tz: p.target?.z ?? base.tz,
    dist: p.distance ?? base.dist,
    yaw: p.yaw !== undefined ? p.yaw * DEG : base.yaw,
    pitch: p.pitch !== undefined ? p.pitch * DEG : base.pitch,
  });

  const cur: Pose = { tx: 0, ty: 0, tz: 0, dist: 500, yaw: 30 * DEG, pitch: 40 * DEG };
  if (overview) copyPose(cur, poiPose(overview, cur));
  const goal: Pose = copyPose(newPose(), cur);

  // effective (rendered) state after floor lift / occlusion
  const eff = { tx: cur.tx, ty: cur.ty, tz: cur.tz, dist: cur.dist, yaw: cur.yaw, pitch: cur.pitch };

  let flight: Flight | null = null;
  let follow: FollowState | null = null;
  let roofLift = 0;
  let roofLiftVel = 0;
  /** low-orbit collision: current camera arm length (m; Infinity = not set), its rate, last full length */
  let armLen = Infinity;
  let armLenVel = 0;
  let armPrevD = 0;
  /** arm length actually shown last frame (after the follow-flight blend) */
  let armShown = Infinity;
  /** crane-up pitch actually applied last frame */
  let craneShown = 0;
  /** smoothed pose velocities (for the collision look-ahead) */
  const motion = { valid: false, prev: newPose(), yaw: 0, pitch: 0, ld: 0, tx: 0, tz: 0 };
  /** last collision numbers (for ?camdebug diagnostics) */
  const dbg = { want: 0, lim: 0, d: 0, need: 0 };
  let craneLift = 0;
  let fov = BASE_FOV;

  // input state
  const keys = new Set<string>();
  let shiftHeld = false;
  const kbVel = { x: 0, z: 0, yaw: 0, pitch: 0, zoom: 0 };
  const inertia = { yaw: 0, pitch: 0, px: 0, pz: 0 };
  let movingUntil = 0;

  interface Drag {
    id: number;
    mode: 'rotate' | 'pan';
    sx: number;
    sy: number;
    lx: number;
    ly: number;
    lt: number;
    moved: boolean;
    touch: boolean;
  }
  let drag: Drag | null = null;
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { mx: number; my: number; dist: number; angle: number; n: number } | null = null;
  let lastClick: { t: number; x: number; y: number; hit: PickHit | null } = { t: 0, x: 0, y: 0, hit: null };
  let hoverCursor = false;

  const pointer: PointerInfo = { x: -1, y: -1, inside: false, dragging: false, movedAt: 0 };

  const toast = (msg: string) => (ctx.services.ui as { toast?: (m: string) => void } | undefined)?.toast?.(msg);
  const emit = (name: string, payload?: unknown) => ctx.events.emit(name, payload);

  // Camera feel. FREE (default): the orbit camera goes exactly where it is steered — through facades and
  // roofs if need be, only the ground stops it — and never starts touring by itself. GUIDED (G key,
  // ?guidedcam): the original spring arm that keeps the orbit out of buildings (slides in front of
  // facades, keeps a line of sight, lifts over roofs) plus the idle auto-tour. Follow cams, flights and
  // the tour keep their own framing rules in both modes. The choice is remembered (?freecam forces free).
  let guided = ctx.debug.params.has('guidedcam')
    ? true
    : ctx.debug.params.has('freecam')
      ? false
      : (() => {
          try {
            return localStorage.getItem('tinyhaven.guidedCam') === 'true';
          } catch {
            return false;
          }
        })();

  // ───────────────────────────────────────────── helpers
  const canvasXY = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const setRay = (x: number, y: number): THREE.Ray => {
    const w = ctx.size.width || canvas.clientWidth || 1;
    const h = ctx.size.height || canvas.clientHeight || 1;
    ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray;
  };

  /** aim point height: at least `aim` above the ground under the entity */
  const aimY = (p: THREE.Vector3, aim: number): number => (aim > 0 ? Math.max(p.y + 0.15, field.groundAt(p.x, p.z) + aim) : p.y);

  const pickAt = (x: number, y: number): PickHit | null => {
    const ray = setRay(x, y);
    const hit = scout.pick(ray);
    if (!hit) return null;
    // ignore things hidden behind hills / under the slab
    const tGround = field.raycast(ray.origin, ray.direction, camera.far, _hit, false);
    if (tGround >= 0 && hit.distance > tGround + 1.5) return null;
    return hit;
  };

  const surfacePoint = (x: number, y: number, out: THREE.Vector3): boolean => {
    const ray = setRay(x, y);
    return field.raycast(ray.origin, ray.direction, camera.far, out, true) >= 0;
  };

  let lastMode = 'orbit';
  const modeNow = (): string => (tour.active ? 'tour' : follow && !follow.tour ? 'follow' : 'orbit');
  const checkMode = () => {
    const m = modeNow();
    if (m !== lastMode) {
      lastMode = m;
      emit('camera:mode', m);
    }
  };

  const minDistNow = () => (!follow ? (guided ? MIN_DIST : FREE_MIN_DIST) : follow.chase || follow.tour ? Math.max(CHASE_MIN_DIST, follow.cls === 'air' ? 24 : 0) : follow.minDist);
  const minPitchNow = () => (follow?.cls === 'air' ? AIR_MIN_PITCH : follow?.chase ? 4 * DEG : follow || guided ? MIN_PITCH : FREE_MIN_PITCH);
  /** how far the pivot may leave the slab (following an aircraft lets it roam much further) */
  const boundsMargin = () => (follow?.cls === 'air' ? AIR_MARGIN : 0);

  const clampGoal = () => {
    const m = boundsMargin();
    goal.tx = clamp(goal.tx, bounds.x0 - m, bounds.x1 + m);
    goal.tz = clamp(goal.tz, bounds.z0 - m, bounds.z1 + m);
    goal.ty = clamp(goal.ty, -2, follow?.cls === 'air' ? AIR_MAX_Y : 140);
    goal.dist = clamp(goal.dist, minDistNow(), MAX_DIST);
    goal.pitch = clamp(goal.pitch, minPitchNow(), MAX_PITCH);
  };

  const stopMotion = () => {
    inertia.yaw = inertia.pitch = inertia.px = inertia.pz = 0;
  };

  // ───────────────────────────────────────────── flights
  const startFlight = (to: Pose, seconds: number | undefined, kind: Flight['kind'], track = false) => {
    const from = copyPose(newPose(), cur);
    // fly from where the camera really is (arm pulled in between buildings, crane lift), so the flight
    // takes over without a jump and its roof-checked path starts at the camera itself
    if (isFinite(armShown) && armShown < cur.dist - 0.5) from.dist = Math.max(4, armShown);
    if (craneShown > 1e-4) from.pitch = Math.min(MAX_PITCH, cur.pitch + craneShown);
    craneLift = 0;
    craneShown = 0;
    const toP = copyPose(newPose(), to);
    toP.yaw = from.yaw + wrapPi(toP.yaw - from.yaw); // the short way round
    const travel = Math.hypot(toP.tx - from.tx, toP.tz - from.tz);
    const zoomChange = Math.abs(Math.log(Math.max(1, toP.dist) / Math.max(1, from.dist)));
    const dur = seconds ?? clamp(1.1 + travel / 240 + zoomChange * 0.45 + (Math.abs(toP.yaw - from.yaw) / Math.PI) * 0.8, 1.2, 4.5);
    // rise above the city between distant points (cinematic flights to entities always lift a little)
    let arc = Math.max(0, travel * 0.55 - Math.max(from.dist, toP.dist) * 0.35);
    if (kind === 'follow' || kind === 'tour') arc = Math.max(arc, travel * 0.32 - Math.min(from.dist, toP.dist) * 0.15);
    // never skim along roofs: make sure the mid-flight camera clears what lies under the path
    if (travel > 30) {
      let top = 0;
      for (let k = 1; k < 8; k++) {
        const u = k / 8;
        top = Math.max(top, field.topAt(from.tx + (toP.tx - from.tx) * u, from.tz + (toP.tz - from.tz) * u));
      }
      const midDist = Math.exp((Math.log(Math.max(1, from.dist)) + Math.log(Math.max(1, toP.dist))) / 2);
      const midPitch = (from.pitch + toP.pitch) / 2;
      const midY = (from.ty + toP.ty) / 2 + Math.sin(midPitch) * midDist;
      const need = top + 25 - midY;
      if (need > 0) arc = Math.max(arc, need / Math.max(0.3, Math.sin(midPitch)));
    }
    // take-off: a camera low between buildings first rises clear of the roofs it would otherwise fly
    // into (holding its distance), then the flight extends — like a drone leaving a street
    let rise = 0;
    if (toP.dist > from.dist * 1.3) {
      const c = Math.cos(from.pitch),
        sx = Math.sin(from.yaw) * c,
        sz = Math.cos(from.yaw) * c,
        sy = Math.sin(from.pitch);
      for (let sArm = from.dist; sArm <= from.dist + 60; sArm += 4) {
        const y = from.ty + sy * sArm;
        rise = Math.max(rise, field.roofAt(from.tx + sx * sArm, from.tz + sz * sArm, ARM_MARGIN) + 4 - y);
      }
      // …and everything around the starting camera (the flight will turn and move its pivot as it goes)
      if (rise > 2) {
        const cx = from.tx + sx * from.dist,
          cz = from.tz + sz * from.dist,
          cy = from.ty + sy * from.dist;
        for (let ox = -30; ox <= 30; ox += 5)
          for (let oz = -30; oz <= 30; oz += 5) if (ox * ox + oz * oz <= 900) rise = Math.max(rise, field.roofAt(cx + ox, cz + oz, ARM_MARGIN) + 4 - cy);
      }
      rise = clamp(rise, 0, 120);
    }
    const hold = rise > 2 ? clamp(0.18 + rise / 220, 0.22, 0.45) : 0;
    if (hold === 0) rise = 0;
    flight = {
      from,
      to: toP,
      t: 0,
      dur: Math.max(0.05, dur + hold * 1.2),
      arc: Math.min(arc, 420),
      pitchArc: arc > 0 ? Math.min(14 * DEG, (arc / 260) * 14 * DEG) : 0,
      track,
      kind,
      occFree: true,
      rise,
      hold,
    };
    // plan a clear path: sample where the camera will be and raise the arc until every sample clears the
    // roofs by 3 m (a flight leaving street level used to cut through the towers it started between)
    const f = flight;
    for (let it = 0; it < 4; it++) {
      let worst = 0;
      let lever = 1;
      for (let k = 1; k < 16; k++) {
        f.t = (k / 16) * f.dur;
        evalFlight(f, planPose);
        const c = Math.cos(planPose.pitch);
        const x = planPose.tx + Math.sin(planPose.yaw) * c * planPose.dist,
          z = planPose.tz + Math.cos(planPose.yaw) * c * planPose.dist;
        const y = planPose.ty + Math.sin(planPose.pitch) * planPose.dist;
        const need = field.roofAt(x, z, ARM_MARGIN) + 3 - y;
        if (need > worst) {
          worst = need;
          // how much camera height one metre of arc buys at that moment
          const uk = k / 16;
          lever = Math.sin(Math.PI * (f.hold > 0 ? smoother((uk - f.hold) / (1 - f.hold)) : smoother(uk))) * Math.max(0.2, Math.sin(planPose.pitch));
          // (during the take-off the arc has no lever at all: that part is the rise's job)
        }
      }
      f.t = 0;
      if (worst <= 0) break;
      f.arc = Math.min(420, f.arc + worst / Math.max(0.15, lever));
      f.pitchArc = Math.min(14 * DEG, (f.arc / 260) * 14 * DEG);
    }
    stopMotion();
  };
  const planPose = newPose();

  const evalFlight = (f: Flight, out: Pose): number => {
    const u = clamp(f.t / f.dur, 0, 1);
    // take-off (f.hold > 0): first a pure vertical rise of the pivot, everything else waits for it
    const e = f.hold > 0 ? smoother((u - f.hold) / (1 - f.hold)) : smoother(u);
    const a = f.from,
      b = f.to;
    out.tx = a.tx + (b.tx - a.tx) * e;
    out.ty = a.ty + (b.ty - a.ty) * e;
    out.tz = a.tz + (b.tz - a.tz) * e;
    // (the rise fades out again over the second half of the actual flight)
    if (f.hold > 0) out.ty += f.rise * smoother(u / f.hold) * (1 - smoother((e - 0.55) / 0.45));
    // distance in log space (zooms feel even) plus the arc
    const la = Math.log(Math.max(1, a.dist)),
      lb = Math.log(Math.max(1, b.dist));
    const bump = Math.sin(Math.PI * e);
    out.dist = Math.exp(la + (lb - la) * e) + f.arc * bump;
    // flights to a followed thing turn while they are still high and far, then come straight in
    // (turning during the low final approach swings the arm through the buildings beside it)
    const ey = f.track ? smoother(e / 0.65) : e;
    out.yaw = a.yaw + (b.yaw - a.yaw) * ey;
    out.pitch = clamp(a.pitch + (b.pitch - a.pitch) * e + f.pitchArc * bump, 4 * DEG, MAX_PITCH);
    return u;
  };

  const cancelFlight = () => {
    if (!flight) return;
    flight = null;
    copyPose(goal, cur);
  };

  // ───────────────────────────────────────────── follow
  function safeHeading(hit: PickHit): number | null {
    try {
      const h = hit.getHeading?.();
      return typeof h === 'number' && isFinite(h) ? h : null;
    } catch {
      return null;
    }
  }

  /** chase / follow parameters for the current target (aircraft get their own) */
  const paramsFor = (f: FollowState) => (f.cls === 'air' ? AIR_PARAMS : chaseParams(f.hit.kind));

  /**
   * Size of a building / landmark, measured with the picker that found it: horizontal rays towards
   * the centre from 8 directions and one straight down. Falls back to the height field.
   */
  const _probeRay = new THREE.Ray();
  const probeExtent = (hit: PickHit, c: THREE.Vector3): { r: number; h: number } => {
    const g = field.groundAt(c.x, c.z);
    const same = (h: PickHit | null) => !!h && h.kind === hit.kind && h.id === hit.id;
    const castAll = (ray: THREE.Ray): PickHit | null => {
      for (const pk of ctx.pickers) {
        let h: PickHit | null = null;
        try {
          h = pk.pick(ray);
        } catch {
          h = null;
        }
        if (same(h)) return h;
      }
      return null;
    };
    const START = 90;
    let r = 0;
    let hits = 0;
    const y = Math.max(g + 1.2, Math.min(c.y, g + 30));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      _probeRay.origin.set(c.x + Math.sin(a) * START, y, c.z + Math.cos(a) * START);
      _probeRay.direction.set(-Math.sin(a), 0, -Math.cos(a));
      const h = castAll(_probeRay);
      if (h && h.distance < START) {
        r = Math.max(r, START - h.distance);
        hits++;
      }
    }
    _probeRay.origin.set(c.x, g + 500, c.z);
    _probeRay.direction.set(0, -1, 0);
    const down = castAll(_probeRay);
    let top = down ? g + 500 - down.distance : -Infinity;
    // fall back to the coarse height field (roofs) and the picker's aim height
    const fieldTop = field.topAt(c.x, c.z);
    if (!isFinite(top)) top = Math.max(fieldTop, g + (c.y - g) / 0.58);
    if (hits === 0) {
      const thr = g + Math.max(1.5, (fieldTop - g) * 0.35);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        let rr = 0;
        while (rr < 60 && field.topAt(c.x + Math.sin(a) * (rr + 1), c.z + Math.cos(a) * (rr + 1)) > thr) rr += 1;
        r = Math.max(r, rr);
      }
    }
    return { r: clamp(r, 3, 70), h: clamp(top - g, 3, 200) };
  };

  /** start a smooth settle move after a followed entity vanished: rise a little, look at where it was */
  const settleAfter = (at: THREE.Vector3) => {
    const g = field.groundAt(at.x, at.z);
    startFlight({ tx: at.x, ty: g, tz: at.z, dist: clamp(cur.dist * 1.3, 48, 260), yaw: cur.yaw, pitch: clamp(cur.pitch, 30 * DEG, 60 * DEG) }, 2.2, 'user');
  };

  const releaseFollow = (reason?: 'gone' | 'tunnel' | 'away') => {
    if (!follow) return;
    const f = follow;
    follow = null;
    if (flight && flight.track) cancelFlight();
    copyPose(goal, cur);
    // settle the pivot back towards the ground so orbiting continues naturally
    goal.ty = Math.max(field.groundAt(goal.tx, goal.tz), cur.ty - 0.5);
    if (f.chase) {
      goal.pitch = Math.max(goal.pitch, 24 * DEG);
      goal.dist = Math.max(goal.dist, 30);
    }
    if (f.cls === 'air' || reason === 'away') {
      // back to the town: the pivot is high up (or far out) — glide home to the overview
      flyHome(reason === 'away' ? 4 : 3);
    } else if (reason === 'gone' || reason === 'tunnel') settleAfter(f.pos);
    if (!f.tour) {
      emit('camera:follow', null);
      if (f.chase) emit('camera:chase', false);
      const what = f.hit.label;
      if (reason === 'tunnel') toast(`${what} disappeared into the tunnel`);
      else if (reason === 'away') toast(`${what} flew out of sight`);
      else if (reason === 'gone') toast(f.hit.kind === 'pedestrian' ? `${what} has gone out of sight` : `${what} has left the scene`);
    }
    checkMode();
  };

  const startFollow = (hit: PickHit, opts: { tour: boolean; dist?: number; pitch?: number; yawOffset?: number }) => {
    const p = new THREE.Vector3();
    let ok = false;
    try {
      ok = hit.getPosition(p);
    } catch {
      ok = false;
    }
    if (!ok || !isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) return;
    const isStatic = hit.kind === 'building' || hit.kind === 'landmark' || (hit.kind === 'other' && typeof hit.getHeading !== 'function');
    const alt = p.y - field.groundAt(p.x, p.z);
    const cls: TargetClass = isStatic ? 'static' : hit.kind === 'other' && alt > AIR_ON ? 'air' : 'ground';
    const heading = safeHeading(hit) ?? cur.yaw + Math.PI;
    const f: FollowState = {
      hit,
      pos: p,
      vel: new THREE.Vector3(),
      heading,
      smoothHeading: heading,
      aim: 0,
      relative: opts.tour,
      relYaw: opts.yawOffset ?? 0,
      tour: opts.tour,
      chase: false,
      preChase: null,
      first: true,
      cls,
      ownR: 0,
      minDist: MIN_DIST,
      under: 0,
      userTurned: false,
    };
    let dist: number;
    let pitch: number;
    if (cls === 'static') {
      // frame the whole building / landmark; never closer than its own walls
      const ext = probeExtent(hit, p);
      const g = field.groundAt(p.x, p.z);
      p.y = g + ext.h * 0.5;
      f.ownR = ext.r;
      f.minDist = Math.max(MIN_DIST, ext.r * 1.3 + 6);
      pitch = opts.pitch ?? clamp(cur.pitch, 22 * DEG, 42 * DEG);
      // far enough that roof and foot sit ~12° inside the frame (pitch foreshortens the height)
      const frame = clamp(Math.max(Math.hypot(ext.r, ext.h * 0.5) * 3.0, ext.h * 0.5 * Math.cos(pitch) * 4.7, ext.r * 3.2) + 6, f.minDist + 6, 330);
      dist = opts.dist ?? clamp(cur.dist, f.minDist + 4, frame);
    } else {
      const cp = cls === 'air' ? AIR_PARAMS : chaseParams(hit.kind);
      f.aim = cp.aim;
      if (cls === 'air') f.minDist = 28;
      dist = opts.dist ?? clamp(cur.dist, cp.follow * 0.55, cp.follow * 1.6);
      pitch = opts.pitch ?? (cls === 'air' ? clamp(cur.pitch, 8 * DEG, 22 * DEG) : clamp(cur.pitch, 20 * DEG, 52 * DEG));
    }
    follow = f;
    craneLift = 0;
    stopMotion();
    goal.dist = dist;
    goal.pitch = pitch;
    goal.yaw = opts.tour ? heading + Math.PI + (opts.yawOffset ?? 0) : cur.yaw;
    const to: Pose = { tx: p.x, ty: aimY(p, f.aim), tz: p.z, dist, yaw: goal.yaw, pitch };
    const travel = Math.hypot(p.x - cur.tx, p.z - cur.tz) + Math.abs(to.ty - cur.ty) * 0.5;
    const secs = opts.tour ? clamp(2.6 + travel / 160, 2.6, 6) : clamp(0.9 + travel / 260 + Math.abs(Math.log(dist / cur.dist)) * 0.35, 0.9, 3.2);
    startFlight(to, secs, 'follow', true);
    if (!opts.tour) emit('camera:follow', hit);
    checkMode();
  };

  const setChase = (on: boolean) => {
    if (!follow || follow.tour || on === follow.chase) return;
    const f = follow;
    if (on && f.cls === 'static') {
      toast(`${f.hit.label} stays put — the chase cam is for things on the move`);
      return;
    }
    const cp = paramsFor(f);
    if (on) {
      f.preChase = { dist: goal.dist, pitch: goal.pitch };
      f.chase = true;
      f.relative = true;
      f.relYaw = 0;
      goal.dist = cp.dist;
      goal.pitch = cp.pitch;
      startFlight({ tx: f.pos.x, ty: aimY(f.pos, f.aim), tz: f.pos.z, dist: cp.dist, pitch: cp.pitch, yaw: f.smoothHeading + Math.PI }, 1.5, 'follow', true);
    } else {
      f.chase = false;
      f.relative = false;
        const pc = f.preChase ?? { dist: cp.follow, pitch: 30 * DEG };
      goal.dist = Math.max(pc.dist, cp.follow * 0.6);
      goal.pitch = Math.max(pc.pitch, f.cls === 'air' ? 8 * DEG : 22 * DEG);
      goal.yaw = cur.yaw;
      startFlight({ tx: f.pos.x, ty: aimY(f.pos, f.aim), tz: f.pos.z, dist: goal.dist, pitch: goal.pitch, yaw: cur.yaw }, 1.3, 'follow', true);
    }
    emit('camera:chase', on);
  };

  /** follow target pose → out (target always; yaw when relative to the heading) */
  const followGoal = (out: Pose, refYaw: number) => {
    const f = follow!;
    out.tx = f.pos.x;
    out.ty = aimY(f.pos, f.aim);
    out.tz = f.pos.z;
    if (f.relative) out.yaw = refYaw + wrapPi(f.smoothHeading + Math.PI + f.relYaw - refYaw);
  };

  const updateFollow = (dt: number) => {
    const f = follow;
    if (!f) return;
    let ok = false;
    try {
      ok = f.hit.getPosition(_v);
    } catch {
      ok = false;
    }
    if (!ok || !isFinite(_v.x) || !isFinite(_v.y) || !isFinite(_v.z)) {
      releaseFollow('gone');
      return;
    }
    // buildings & landmarks stay put: `pos` keeps the framing point chosen at the start
    if (f.cls === 'static') return;
    // driving into a tunnel: hold at the portal instead of staring into the hill, then let go
    if (f.cls === 'ground' && f.hit.kind !== 'boat' && plan.heightAt(_v.x, _v.z) > _v.y + 0.6) {
      f.under += dt;
      f.vel.multiplyScalar(Math.max(0, 1 - dt * 8));
      if (f.under > 0.18) releaseFollow('tunnel');
      return;
    }
    f.under = 0;
    if (f.hit.kind === 'other') {
      // balloons land, take off… switch between the ground and the aircraft rig
      const alt = _v.y - field.groundAt(_v.x, _v.z);
      if (f.cls === 'ground' && alt > AIR_ON) {
        f.cls = 'air';
        f.minDist = 28;
      } else if (f.cls === 'air' && alt < AIR_OFF) {
        f.cls = 'ground';
        f.minDist = MIN_DIST;
      }
      // flew off the edge of the world
      const m = AIR_MARGIN - 25;
      if (f.cls === 'air' && (_v.x < bounds.x0 - m || _v.x > bounds.x1 + m || _v.z < bounds.z0 - m || _v.z > bounds.z1 + m)) {
        releaseFollow('away');
        return;
      }
    }
    if (dt > 0) {
      _v2.subVectors(_v, f.pos).divideScalar(Math.max(dt, 1e-3));
      const maxSpeed = 60 * Math.max(1, ctx.clock.speed) + 40;
      if (!f.first && _v2.length() > maxSpeed) {
        // teleported (respawned elsewhere) → treat as gone
        releaseFollow('gone');
        return;
      }
      if (f.first) _v2.set(0, 0, 0);
      f.vel.lerp(_v2, damp(6, dt));
      f.first = false;
    }
    f.pos.copy(_v);
    const h = safeHeading(f.hit);
    const speed = Math.hypot(f.vel.x, f.vel.z);
    if (h !== null) f.heading = h;
    else if (speed > 0.4) f.heading = Math.atan2(f.vel.x, f.vel.z);
    f.smoothHeading += wrapPi(f.heading - f.smoothHeading) * damp(f.chase ? 2.4 : 1.5, dt);
    // aircraft chase keeps the town as the backdrop: trail the plane while it heads for town, then swing
    // round to ride ahead of it looking back once it has passed (until the user turns the camera)
    if (f.cls === 'air' && f.chase && !f.userTurned && dt > 0) {
      const toX = townX - f.pos.x,
        toZ = townZ - f.pos.z;
      const ahead = Math.sin(f.smoothHeading) * toX + Math.cos(f.smoothHeading) * toZ > 0;
      const want = ahead ? 0 : Math.PI;
      f.relYaw += clamp(wrapPi(want - f.relYaw), -0.7 * dt, 0.7 * dt);
    }
  };

  // ───────────────────────────────────────────── tour
  let captionInfo: TourShotInfo | null = null;
  const rig: TourRig = {
    pose: () => copyPose(newPose(), cur),
    fly: (to, s) => startFlight(to, s, 'tour'),
    flying: () => flight !== null,
    track: (hit, opts) => {
      if (!hit) {
        if (follow?.tour) releaseFollow();
        return;
      }
      if (follow) releaseFollow();
      startFollow(hit, { tour: true, dist: opts?.dist, pitch: opts?.pitch, yawOffset: opts?.yawOffset });
    },
    tracking: () => !!follow && follow.tour,
    drive: (p) => {
      copyPose(cur, p);
      copyPose(goal, p);
    },
    trackOffset: (yawOffset, pitch, dist) => {
      if (!follow) return;
      follow.relYaw = yawOffset;
      goal.pitch = pitch;
      goal.dist = dist;
    },
    caption: (info) => {
      captionInfo = info;
      emit('camera:shot', info);
    },
    night: () => ctx.clock.night,
  };
  const tour = new TourDirector(rig, scout, plan.pois);

  const startTour = () => {
    if (tour.active) return;
    if (follow && !follow.tour) releaseFollow();
    cancelFlight();
    tour.start();
    checkMode();
    emit('camera:tour', true);
  };
  const stopTour = () => {
    if (!tour.active) return;
    tour.stop();
    cancelFlight();
    if (follow?.tour) releaseFollow();
    copyPose(goal, cur);
    captionInfo = null;
    checkMode();
    emit('camera:tour', false);
  };

  /** any direct camera input stops the tour and interrupts scripted flights */
  const userTakesOver = () => {
    if (tour.active) stopTour();
    if (flight && flight.kind !== 'follow') cancelFlight();
  };

  // ───────────────────────────────────────────── public flyTo
  const flyTo = (view: Partial<CameraState> | Poi, seconds?: number) => {
    if (tour.active) stopTour();
    if (follow) releaseFollow();
    const to = poiPose(view, goal);
    to.pitch = clamp(to.pitch, MIN_PITCH, MAX_PITCH);
    to.dist = clamp(to.dist, MIN_DIST, MAX_DIST * 1.5);
    to.tx = clamp(to.tx, bounds.x0, bounds.x1);
    to.tz = clamp(to.tz, bounds.z0, bounds.z1);
    if (seconds === 0) {
      flight = null;
      copyPose(cur, to);
      copyPose(goal, to);
      stopMotion();
      kbVel.x = kbVel.z = kbVel.yaw = kbVel.pitch = kbVel.zoom = 0;
      roofLift = 0;
      craneLift = 0;
        armLen = Infinity;
      armLenVel = 0;
      armShown = Infinity;
      motion.valid = false;
      applyCamera(0);
      return;
    }
    startFlight(to, seconds, 'user');
  };

  /** glide back to the overview without touching the tour / follow state (used after an aircraft) */
  const flyHome = (seconds: number) => {
    if (!overview) return;
    startFlight(poiPose(overview, goal), seconds, 'user');
  };

  const flyToPoint = (x: number, z: number, distance?: number) => {
    const d = distance ?? (goal.dist > 70 ? clamp(goal.dist * 0.6, 40, 260) : goal.dist);
    flyTo({ target: { x, y: field.groundAt(x, z), z }, distance: d, yaw: cur.yaw / DEG, pitch: cur.pitch / DEG });
  };

  const flyToPoi = (id: string) => {
    const p = plan.pois.find((q) => q.id === id);
    if (p) {
      flyTo(p);
      emit('camera:poi', p.id);
    }
  };

  // ───────────────────────────────────────────── gestures
  const panByPixels = (dx: number, dy: number, pose: Pose) => {
    const h = ctx.size.height || 720;
    const wpp = (2 * pose.dist * Math.tan((camera.fov * DEG) / 2)) / h;
    const sy = Math.sin(pose.yaw),
      cy = Math.cos(pose.yaw);
    const fore = 1 / Math.max(0.38, Math.sin(pose.pitch));
    // screen right = (cos yaw, -sin yaw); forward on the ground = (-sin yaw, -cos yaw)
    const mx = -dx * wpp * cy - dy * wpp * fore * sy;
    const mz = dx * wpp * sy - dy * wpp * fore * cy;
    pose.tx += mx;
    pose.tz += mz;
    return { mx, mz };
  };

  const relaxTargetY = (dt: number) => {
    let g = field.groundAt(goal.tx, goal.tz);
    // close to the city the pivot rides over the roofs it crosses instead of sinking into the buildings
    // (an orbit pivot inside a block leaves the camera nothing to look at but that block's roof);
    // the free camera pans along the ground instead — riding every roof made the view bob up and down
    if (goal.dist < 240 && (guided || follow)) {
      const top = field.topSmoothAt(goal.tx, goal.tz) - 0.6;
      if (top > g + 1) g = top;
    }
    goal.ty += (g - goal.ty) * damp(2.5, dt);
  };

  const zoomAt = (x: number | null, y: number | null, factor: number) => {
    const old = goal.dist;
    const minD = minDistNow();
    const nd = clamp(old * factor, minD, MAX_DIST);
    const r = nd / old;
    if (!follow && x !== null && y !== null && surfacePoint(x, y, _hit)) {
      // keep the point under the cursor fixed on screen
      goal.tx = _hit.x + (goal.tx - _hit.x) * r;
      goal.tz = _hit.z + (goal.tz - _hit.z) * r;
      goal.ty = clamp(_hit.y + (goal.ty - _hit.y) * r, -2, 140);
      // already as close as it gets: keep gliding forward towards the cursor instead
      if (factor < 1 && old <= minD + 0.01) {
        const dx = _hit.x - goal.tx,
          dz = _hit.z - goal.tz;
        const len = Math.hypot(dx, dz);
        if (len > 0.5) {
          const step = Math.min(len * 0.5, (1 - factor) * minD * 2.2);
          goal.tx += (dx / len) * step;
          goal.tz += (dz / len) * step;
        }
      }
    }
    goal.dist = nd;
  };

  const applyRotate = (dx: number, dy: number) => {
    const h = ctx.size.height || 720;
    const k = (Math.PI * 1.15) / h; // a full-height drag ≈ 200°
    const dYaw = -dx * k;
    const dPitch = dy * k * 0.75;
    if (follow && follow.relative) {
      follow.relYaw += dYaw;
      follow.userTurned = true;
    }
    else goal.yaw += dYaw;
    goal.pitch = clamp(goal.pitch + dPitch, minPitchNow(), MAX_PITCH);
    return { dYaw, dPitch };
  };

  const startPinch = () => {
    const pts = [...touches.values()];
    if (pts.length < 2) {
      pinch = null;
      return;
    }
    const [a, b] = pts;
    const mx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
    const my = pts.reduce((s, q) => s + q.y, 0) / pts.length;
    pinch = { mx, my, dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x), n: pts.length };
  };

  const updateCursor = () => {
    let c = 'default';
    if (drag && drag.moved) c = drag.mode === 'pan' ? 'move' : 'grabbing';
    else if (hoverCursor) c = 'pointer';
    if (canvas.style.cursor !== c) canvas.style.cursor = c;
  };

  const onPointerDown = (e: PointerEvent) => {
    try {
      canvas.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
    const p = canvasXY(e);
    pointer.x = p.x;
    pointer.y = p.y;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: p.x, y: p.y });
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      userTakesOver();
      stopMotion();
      if (touches.size === 1) {
        drag = { id: e.pointerId, mode: 'rotate', sx: p.x, sy: p.y, lx: p.x, ly: p.y, lt: performance.now(), moved: false, touch: true };
        pinch = null;
      } else {
        drag = null;
        startPinch();
      }
      return;
    }
    if (drag) return;
    let mode: Drag['mode'] = 'rotate';
    if (e.button === 1 || e.button === 2 || (e.button === 0 && (e.shiftKey || e.ctrlKey || e.metaKey))) mode = 'pan';
    else if (e.button !== 0) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    drag = { id: e.pointerId, mode, sx: p.x, sy: p.y, lx: p.x, ly: p.y, lt: performance.now(), moved: false, touch: false };
    userTakesOver();
    stopMotion();
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    const p = canvasXY(e);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.movedAt = performance.now();
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: p.x, y: p.y });
      if (pinch && touches.size >= 2) {
        const pts = [...touches.values()];
        const [a, b] = pts;
        const mx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
        const my = pts.reduce((s, q) => s + q.y, 0) / pts.length;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (pts.length >= 3) {
          // three fingers: tilt
          goal.pitch = clamp(goal.pitch + ((my - pinch.my) / (ctx.size.height || 720)) * Math.PI * 0.8, minPitchNow(), MAX_PITCH);
        } else {
          if (!follow) {
            panByPixels(mx - pinch.mx, my - pinch.my, goal);
            relaxTargetY(1 / 60);
          }
          if (pinch.dist > 10 && d > 10) zoomAt(mx, my, pinch.dist / d);
          const dAng = wrapPi(ang - pinch.angle);
          if (follow && follow.relative) {
            follow.relYaw += dAng;
            follow.userTurned = true;
          }
          else goal.yaw += dAng;
        }
        pinch.mx = mx;
        pinch.my = my;
        pinch.dist = d;
        pinch.angle = ang;
        pointer.dragging = true;
        movingUntil = performance.now() + 300;
        return;
      }
    }
    if (!drag || drag.id !== e.pointerId) return;
    const dx = p.x - drag.lx,
      dy = p.y - drag.ly;
    if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > CLICK_PX) {
      drag.moved = true;
      pointer.dragging = true;
      // grabbing the ground away from a followed entity releases it
      if (drag.mode === 'pan' && follow && !follow.tour) releaseFollow();
      updateCursor();
    }
    if (!drag.moved) return;
    const now = performance.now();
    const dtm = Math.max(1, now - drag.lt) / 1000;
    if (drag.mode === 'rotate') {
      const r = applyRotate(dx, dy);
      inertia.yaw = inertia.yaw * 0.55 + (r.dYaw / dtm) * 0.45;
      inertia.pitch = inertia.pitch * 0.55 + (r.dPitch / dtm) * 0.45;
    } else {
      const m = panByPixels(dx, dy, goal);
      relaxTargetY(dtm);
      inertia.px = inertia.px * 0.55 + (m.mx / dtm) * 0.45;
      inertia.pz = inertia.pz * 0.55 + (m.mz / dtm) * 0.45;
    }
    drag.lx = p.x;
    drag.ly = p.y;
    drag.lt = now;
    movingUntil = now + 300;
  };

  const onPointerUp = (e: PointerEvent) => {
    const p = canvasXY(e);
    try {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (e.pointerType === 'touch') {
      const wasPinch = !!pinch;
      touches.delete(e.pointerId);
      if (touches.size >= 2) {
        startPinch();
        return;
      }
      if (touches.size === 1) {
        // continue as a one-finger orbit from the remaining finger
        pinch = null;
        const [id, q] = [...touches.entries()][0];
        drag = { id, mode: 'rotate', sx: q.x, sy: q.y, lx: q.x, ly: q.y, lt: performance.now(), moved: true, touch: true };
        stopMotion();
        return;
      }
      pinch = null;
      if (wasPinch) {
        drag = null;
        pointer.dragging = false;
        stopMotion();
        return;
      }
    }
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    drag = null;
    pointer.dragging = false;
    updateCursor();
    if (!d.moved) {
      stopMotion();
      if (e.type === 'pointerup' && (d.mode === 'rotate' || d.touch)) handleClick(p.x, p.y);
      return;
    }
    // keep the inertia only if the pointer was still moving at release
    if (performance.now() - d.lt > 70) stopMotion();
    movingUntil = performance.now() + 700;
  };

  const handleClick = (x: number, y: number) => {
    try {
      if (service.clickHook?.(x, y)) return;
    } catch {
      /* a failing UI hook must not break clicking */
    }
    const now = performance.now();
    const dbl = now - lastClick.t < DBL_MS && Math.hypot(x - lastClick.x, y - lastClick.y) < 10;
    // the second click of a double-click acts on what the first one picked (the camera may already be moving)
    const hit = dbl ? lastClick.hit : pickAt(x, y);
    lastClick = { t: dbl ? 0 : now, x, y, hit: dbl ? null : hit };
    const same = hit && follow && follow.hit.id === hit.id && follow.hit.kind === hit.kind;
    if (dbl) {
      if (same) {
        goal.dist = Math.max(goal.dist * 0.6, minDistNow());
        return;
      }
      if (!hit && surfacePoint(x, y, _hit)) {
        flyToPoint(_hit.x, _hit.z);
        return;
      }
    }
    emit('select', hit);
    if (hit) {
      if (same) return;
      if (follow) releaseFollow();
      startFollow(hit, { tour: false });
    } else if (follow) {
      releaseFollow();
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    userTakesOver();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 18;
    else if (e.deltaMode === 2) dy *= 120;
    if (e.ctrlKey) dy *= 2.5; // trackpad pinch arrives as ctrl+wheel with small deltas
    dy = clamp(dy, -260, 260);
    const p = canvasXY(e);
    zoomAt(p.x, p.y, Math.exp(dy * 0.0013));
    movingUntil = performance.now() + 500;
  };

  const onEnter = () => {
    pointer.inside = true;
  };
  const onLeave = () => {
    pointer.inside = false;
  };
  const onContext = (e: Event) => e.preventDefault();

  // ───────────────────────────────────────────── keyboard
  const PAN_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  const MOVE_KEYS = new Set([...PAN_KEYS, 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'PageUp', 'PageDown']);
  const isTyping = (t: EventTarget | null): boolean => {
    const el = t as HTMLElement | null;
    if (!el || !el.tagName) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    shiftHeld = e.shiftKey;
    if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const code = e.code;
    if (MOVE_KEYS.has(code)) {
      if (!keys.has(code)) userTakesOver();
      keys.add(code);
      if (follow && !follow.tour && PAN_KEYS.has(code)) releaseFollow();
      if (code.startsWith('Arrow') || code === 'PageUp' || code === 'PageDown') e.preventDefault();
      return;
    }
    if (e.repeat) return;
    const digit = /^(Digit|Numpad)(\d)$/.exec(code);
    if (digit) {
      const n = parseInt(digit[2], 10);
      const poi = n === 0 ? overview : plan.pois.filter((p) => p !== overview)[n - 1];
      if (poi) flyToPoi(poi.id);
      return;
    }
    switch (code) {
      case 'Home':
        if (overview) flyToPoi(overview.id);
        break;
      case 'KeyC':
        if (follow && !follow.tour) setChase(!follow.chase);
        else toast('Click something that moves first — then C toggles the chase view');
        break;
      case 'KeyT':
        if (tour.active) stopTour();
        else startTour();
        break;
      case 'KeyG':
        guided = !guided;
        try {
          localStorage.setItem('tinyhaven.guidedCam', String(guided));
        } catch {
          /* storage unavailable */
        }
        clampGoal();
        toast(guided ? 'Guided camera — keeps out of buildings, tours when idle (G: free)' : 'Free camera — goes wherever you steer it (G: guided)');
        break;
      case 'Escape':
        if (tour.active) stopTour();
        else if (follow) releaseFollow();
        else if (flight) cancelFlight();
        break;
      default:
        break;
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    shiftHeld = e.shiftKey;
    keys.delete(e.code);
  };

  const clearInput = () => {
    keys.clear();
    shiftHeld = false;
    if (drag) {
      try {
        if (canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
      } catch {
        /* ignore */
      }
    }
    drag = null;
    touches.clear();
    pinch = null;
    pointer.dragging = false;
    updateCursor();
  };
  const onVisibility = () => {
    if (document.hidden) clearInput();
  };

  // any input anywhere (canvas, HUD, keys) counts as activity for the idle attract mode
  let lastActivity = performance.now();
  const onActivity = () => {
    lastActivity = performance.now();
  };
  window.addEventListener('pointerdown', onActivity, true);
  window.addEventListener('keydown', onActivity, true);
  window.addEventListener('wheel', onActivity, { capture: true, passive: true });
  window.addEventListener('pointermove', onActivity, { capture: true, passive: true });
  const automated = (navigator as Navigator & { webdriver?: boolean }).webdriver === true;
  const idleTourAfter = () => (ctx.debug.params.has('noidle') || automated || !guided ? Infinity : 120_000);

  canvas.tabIndex = 0;
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerenter', onEnter);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContext);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', onVisibility);

  // ───────────────────────────────────────────── per-frame integration
  const integrateKeys = (dt: number) => {
    const k = (c: string) => (keys.has(c) ? 1 : 0);
    const fwd = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown');
    const side = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft');
    const rot = k('KeyQ') - k('KeyE');
    const tilt = k('KeyR') - k('KeyF');
    const zoom = k('Minus') + k('NumpadSubtract') + k('PageDown') - k('Equal') - k('NumpadAdd') - k('PageUp');
    const fast = shiftHeld ? 2.2 : 1;
    const speed = goal.dist * 0.65 * fast;
    const sy = Math.sin(goal.yaw),
      cy = Math.cos(goal.yaw);
    const wantX = (side * cy - fwd * sy) * speed;
    const wantZ = (-side * sy - fwd * cy) * speed;
    const a = damp(7, dt);
    kbVel.x += (wantX - kbVel.x) * a;
    kbVel.z += (wantZ - kbVel.z) * a;
    kbVel.yaw += (rot * 1.25 * fast - kbVel.yaw) * a;
    kbVel.pitch += (tilt * 0.75 - kbVel.pitch) * a;
    kbVel.zoom += (zoom * 1.5 - kbVel.zoom) * a;
    if (Math.abs(kbVel.x) + Math.abs(kbVel.z) > 1e-3) {
      goal.tx += kbVel.x * dt;
      goal.tz += kbVel.z * dt;
      relaxTargetY(dt);
    }
    if (Math.abs(kbVel.yaw) > 1e-4) {
      if (follow && follow.relative) {
        follow.relYaw += kbVel.yaw * dt;
        follow.userTurned = true;
      }
      else goal.yaw += kbVel.yaw * dt;
    }
    if (Math.abs(kbVel.pitch) > 1e-4) goal.pitch += kbVel.pitch * dt;
    if (Math.abs(kbVel.zoom) > 1e-4) goal.dist *= Math.exp(kbVel.zoom * dt);
    if (fwd || side || rot || tilt || zoom) movingUntil = performance.now() + 300;
  };

  const integrateInertia = (dt: number) => {
    if (drag && drag.moved) return;
    const decay = Math.exp(-dt * 4.2);
    if (Math.abs(inertia.yaw) > 1e-4 || Math.abs(inertia.pitch) > 1e-4) {
      if (follow && follow.relative) follow.relYaw += inertia.yaw * dt;
      else goal.yaw += inertia.yaw * dt;
      goal.pitch += inertia.pitch * dt;
      inertia.yaw *= decay;
      inertia.pitch *= decay;
    }
    if (Math.abs(inertia.px) + Math.abs(inertia.pz) > 1e-3) {
      goal.tx += inertia.px * dt;
      goal.tz += inertia.pz * dt;
      relaxTargetY(dt);
      const d2 = Math.exp(-dt * 5);
      inertia.px *= d2;
      inertia.pz *= d2;
    }
  };

  /**
   * Pitch needed so the line of sight from the target clears the roofs (crane up over occluders).
   * `skip` ignores the first metres (the target's own building when looking at a building).
   */
  const clearPitch = (tx: number, ty: number, tz: number, yaw: number, pitch: number, dist: number, skip = 0): number => {
    const sx = Math.sin(yaw),
      sz = Math.cos(yaw);
    const horiz = dist * Math.cos(pitch);
    let need = 0;
    for (let s = Math.max(3, skip); s < horiz; s += 2) {
      const top = field.topSmoothAt(tx + sx * s, tz + sz * s) + 1.2 - ty;
      if (top <= 0) continue;
      const a = Math.atan2(top, s);
      if (a > need) need = a;
    }
    return Math.min(need, 72 * DEG);
  };

  const tmpPose: Pose = newPose();
  const liveList: LiveEntity[] = [];

  /**
   * Stretches of an arm (pivot → camera along yaw/pitch) that run deep inside buildings, as
   * [start, end] pairs in metres from the pivot (end = Infinity when it never comes out).
   * Roofs up to LIFT_MAX above the arm do not count: the roof lift glides over those.
   */
  const SCAN_MAX = 24;
  const scanCur = new Float32Array(SCAN_MAX * 2);
  const LOOK_MAX = 20;
  const lookBuf = Array.from({ length: LOOK_MAX }, () => new Float32Array(SCAN_MAX * 2));
  const lookN = new Int32Array(LOOK_MAX);
  const lookJ0 = new Uint8Array(LOOK_MAX);
  const scanArm = (tx: number, ty: number, tz: number, yaw: number, pitch: number, len: number, out: Float32Array): number => {
    const cp = Math.cos(pitch);
    return field.armBlocks(tx, ty, tz, Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp, len, LIFT_MAX - 1.6, LIFT_MAX - 2, ARM_MARGIN, out, SCAN_MAX);
  };
  /** index of the blocked stretch (from i0) that contains s, or -1 */
  const blockAt = (sc: Float32Array, n: number, i0: number, s: number): number => {
    for (let i = i0; i < n; i++) if (s >= sc[2 * i] && s < sc[2 * i + 1]) return i;
    return -1;
  };

  /** roof height the camera at the end of an arm must clear (≤ LIFT_MAX + 2 unless `any`), or 0 */
  const liftNeed = (tx: number, ty: number, tz: number, yaw: number, pitch: number, d: number, any: boolean): number => {
    const cp = Math.cos(pitch);
    const x = tx + Math.sin(yaw) * cp * d,
      z = tz + Math.cos(yaw) * cp * d;
    const n = field.roofAt(x, z, ROOF_MARGIN) + 1.6 - (ty + Math.sin(pitch) * d);
    return n > 0 && (any || n <= LIFT_MAX + 2) ? n : 0;
  };

  /** critically damped spring step (sub-stepped for long frames) */
  const spring = (x: number, v: number, target: number, w: number, dt: number): [number, number] => {
    const sub = Math.max(1, Math.ceil(dt / 0.02));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      v += (w * w * (target - x) - 2 * w * v) * h;
      x += v * h;
    }
    return [x, v];
  };

  /** smoothed pose velocities, used to look ahead along the current camera motion */
  const trackMotion = (dt: number) => {
    if (dt <= 0) return;
    const m = motion;
    if (m.valid) {
      const k = damp(14, dt);
      const dy = cur.yaw - m.prev.yaw; // a yaw re-normalisation shows up as a ~2π step: ignore it
      m.yaw += ((Math.abs(dy) > 1 ? 0 : dy / dt) - m.yaw) * k;
      m.pitch += ((cur.pitch - m.prev.pitch) / dt - m.pitch) * k;
      m.ld += ((Math.log(Math.max(1, cur.dist)) - Math.log(Math.max(1, m.prev.dist))) / dt - m.ld) * k;
      m.tx += ((cur.tx - m.prev.tx) / dt - m.tx) * k;
      m.tz += ((cur.tz - m.prev.tz) / dt - m.tz) * k;
    }
    copyPose(m.prev, cur);
    m.valid = true;
  };

  /** look-ahead samples spaced by how far the arm moves (≤ 2.5° of swing / tilt, ≤ 3 m of pan, ≤ 4 % of zoom) */
  const lookSamples = (min: number, max: number): number => {
    const H = ARM_HORIZON;
    const m = motion;
    return clamp(Math.ceil(Math.max((Math.abs(m.yaw) * H) / (2.5 * DEG), (Math.abs(m.pitch) * H) / (2.5 * DEG), (Math.hypot(m.tx, m.tz) * H) / 3, (Math.abs(m.ld) * H) / 0.04)), min, max);
  };

  /** pose of the arm `la` seconds ahead along the current motion (writes yaw/pitch/dist/target into tmpLook) */
  const tmpLook = newPose();
  const lookAhead = (la: number, pitch: number, d: number): Pose => {
    const m = motion;
    tmpLook.tx = cur.tx + clamp(m.tx * la, -60, 60);
    tmpLook.ty = cur.ty;
    tmpLook.tz = cur.tz + clamp(m.tz * la, -60, 60);
    tmpLook.yaw = cur.yaw + clamp(m.yaw * la, -0.7, 0.7);
    tmpLook.pitch = clamp(pitch + clamp(m.pitch * la, -0.35, 0.35), 2 * DEG, MAX_PITCH);
    tmpLook.dist = d * Math.exp(clamp(m.ld * la, -0.6, 0.6));
    return tmpLook;
  };

  /** compute the camera transform from `cur` (+ floor / occlusion) and apply it */
  function applyCamera(dt: number): void {
    let pitch = cur.pitch;
    let d = cur.dist;
    _tgt.set(cur.tx, cur.ty, cur.tz);
    // a building / landmark being looked at must not occlude itself
    const ownSkip = follow && follow.cls === 'static' ? follow.ownR + 1.5 : 0;
    // flying to a followed thing from an unobstructed view, the crane-up blends in over the second half
    // (at once it would yank the pitch mid-flight); the arm itself never needs a blend (see below)
    const occW = flight && flight.track && flight.occFree ? smoother((flight.t / flight.dur - 0.5) / 0.5) : 1;
    if (follow && !follow.chase && d < 200) {
      // elevated follow cams first crane up a little over buildings that would hide the entity…
      const need = clearPitch(cur.tx, cur.ty, cur.tz, cur.yaw, pitch, d, ownSkip) + 2 * DEG;
      const extra = clamp(need - pitch, 0, Math.max(0, 60 * DEG - pitch));
      craneLift += (extra - craneLift) * (dt > 0 ? damp(extra > craneLift ? 4 : 1.2, dt) : 1);
      craneShown = craneLift * occW;
      pitch = Math.min(MAX_PITCH, pitch + craneShown);
    } else {
      craneLift = 0;
      craneShown = 0;
    }
    const cp = Math.cos(pitch),
      sp = Math.sin(pitch);
    _dir.set(Math.sin(cur.yaw) * cp, sp, Math.cos(cur.yaw) * cp);
    _pos.copy(_tgt).addScaledVector(_dir, d);
    let liftAll = false;
    const looking = dt > 0 && motion.valid;
    // free camera (see `guided`): plain orbit, no collision rules — follow cams and flights keep theirs
    const freeOrbit = !guided && !follow && !flight;
    if (freeOrbit) {
      // the arm runs to its full length, through facades if need be; one left shorter by a follow, a
      // flight or the guided mode eases back out (ω 3.2 ≈ 1.5 s) instead of snapping
      let L = isFinite(armLen) ? Math.min(armLen, d) : d;
      if (dt <= 0 || L >= d - 0.01) {
        L = d;
        armLenVel = 0;
      } else [L, armLenVel] = spring(L, armLenVel, d, 3.2, dt);
      armLen = L;
      armPrevD = d;
      if (L < d - 0.01) {
        d = L;
        _pos.copy(_tgt).addScaledVector(_dir, d);
      }
      armShown = d;
    } else {
      // Between buildings the camera slides along its arm (pivot → camera) like a spring arm.
      //  * it heads for the full arm length, or for the front of the block the arm ends in;
      //  * it never slides *through* a building — it waits in front of one until the arm swings clear;
      //  * a look-ahead along the current motion starts the move before the arm reaches a facade, and a
      //    critically damped spring eases it in (briskly) and out (gently) instead of snapping;
      //  * if a facade still sweeps into the camera (grazing angles grow faster than any smooth motion),
      //    it escapes to the near side lagging at most ~1 m.
      // Roofs up to LIFT_MAX above the arm are not obstacles: the roof lift below glides over them.
      const n = scanArm(_tgt.x, _tgt.y, _tgt.z, cur.yaw, pitch, d + 0.5, scanCur);
      const own = n > 0 && scanCur[0] === 0 ? scanCur[1] : 0; // the pivot itself stands in a block
      let i0 = own > 0 ? 1 : 0;
      // in flight the pivot glides at street level between two views: a wall it brushes past is as good
      // as its own (squeezing the arm to the pivot and lifting would be a jolt in mid-air)
      const Lnow = isFinite(armLen) ? Math.min(armLen, d) : d;
      if (flight) while (i0 < n && scanCur[2 * i0] < 6 && scanCur[2 * i0 + 1] < Lnow - 1) i0++;
      let L = Lnow;
      let D = d;
      const be = blockAt(scanCur, n, i0, d);
      if (be >= 0) D = scanCur[2 * be] - 0.5;
      // close-ups and follow cams keep a line of sight to the pivot: never behind a building (getting
      // back in front would mean passing through it); far orbit views (places, tour) may look over a tower
      // (a camera that is already behind a building stays there until the arm swings clear — zooming in
      // across LOS_DIST, or flying in towards a followed thing from high above, must never be dragged
      // through the wall; only the low chase cam insists on its view)
      const placing = dt <= 0 || !isFinite(armLen);
      const behind = !placing && !(follow && follow.chase) && n > i0 && L > scanCur[2 * i0 + 1];
      const los = !behind && (!!follow || d < LOS_DIST);
      if (los && n > i0) D = Math.min(D, scanCur[2 * i0] - 0.5);
      if (looking) {
        // samples spaced by how far the arm moves (≤ 2.5° of swing / tilt, ≤ 3 m of pan, ≤ 4 % of zoom):
        // a facade corner can cut across the arm within a few degrees
        const H = ARM_HORIZON;
        const ns = lookSamples(3, LOOK_MAX);
        for (let k = 0; k < ns; k++) {
          const p = lookAhead((H * (k + 1)) / ns, pitch, d);
          const buf = lookBuf[k];
          const m = scanArm(p.tx, _tgt.y, p.tz, p.yaw, p.pitch, Math.max(p.dist, L) + 0.5, buf);
          const j0 = m > 0 && buf[0] === 0 ? 1 : 0;
          lookN[k] = m;
          lookJ0[k] = j0;
          const b1 = blockAt(buf, m, j0, p.dist);
          if (b1 >= 0) D = Math.min(D, buf[2 * b1] - 0.5);
          if (los && m > j0) D = Math.min(D, buf[2 * j0] - 0.5);
        }
        // anything that will lie in the corridor the camera slides through (between L and D) must be
        // passed before it gets there — checked once D is known, repeated while it keeps dropping
        for (let it = 0; it < 3; it++) {
          const D0 = D;
          const lo = Math.min(L, D) - 0.01,
            hi = Math.max(L, D) + 0.01;
          for (let k = 0; k < ns; k++) {
            const buf = lookBuf[k];
            for (let j = lookJ0[k]; j < lookN[k]; j++) if (buf[2 * j] < hi && buf[2 * j + 1] > lo) D = Math.min(D, buf[2 * j] - 0.5);
          }
          if (D >= D0 - 1e-3) break;
        }
      }
      let target = D;
      for (let i = i0; i < n; i++) {
        if (scanCur[2 * i] > L - 0.01) {
          target = Math.min(target, scanCur[2 * i] - 0.5);
          break;
        }
      }
      // only a camera that is really inside a building escapes; grazing a facade (the 1 m margin) is not
      const bi = blockAt(scanCur, n, i0, L);
      const cpL = Math.cos(pitch);
      if (bi >= 0 && field.insideSolid(_tgt.x + Math.sin(cur.yaw) * cpL * L, _tgt.y + Math.sin(pitch) * L, _tgt.z + Math.cos(cur.yaw) * cpL * L, ROOF_MARGIN, LIFT_MAX - 1.6)) {
        // out on the pivot's side (behind the building the pivot would be hidden); no room there: rise over it
        const front = scanCur[2 * bi] - 0.5;
        const esc = Math.max(4, front);
        if (front < 4) liftAll = true;
        target = Math.min(target, esc);
        const lagMax = clamp(d * 0.02, 0.8, 1.5);
        if (Math.abs(L - esc) > lagMax) {
          L = esc + Math.sign(L - esc) * lagMax;
          armLenVel = 0;
        }
      }
      if (own > 0 && L < own) liftAll = true; // still inside the pivot's own block: rise over it
      target = clamp(target, Math.min(4, d), d);
      if (placing) {
        // placed at once (D already keeps close-ups in front of the first building on the arm)
        L = D;
        L = clamp(L, Math.min(4, d), d);
        armLenVel = 0;
      } else if (L >= armPrevD - 0.01 && target >= d - 0.01) {
        // nothing in the way: follow the zoom directly
        L = d;
        armLenVel = 0;
      } else {
        // in briskly (ω 16 ≈ 0.3 s; a little softer for the elevated follow cam), out gently (ω 3.2 ≈ 1.5 s)
        const wIn = follow && !follow.chase ? 12 : 16;
        // (a flight leaving a street lets go faster, so the arm catches up with the flight path)
        [L, armLenVel] = spring(L, armLenVel, target, target < L ? wIn : flight ? 7 : 3.2, dt);
      }
      L = clamp(L, Math.min(4, d), d);
      dbg.want = D;
      dbg.lim = target;
      dbg.d = d;
      armLen = L;
      armPrevD = d;
      // Flights are planned paths: the arm rules them, not these orbit / follow rules (a pivot gliding at
      // street level past ships, cranes and towers would squeeze the arm in mid-air); whatever lies in the
      // way is glided over by the roof lift instead. Flights to a followed thing hand over to the follow
      // arm over their last 30 % (its state keeps evolving under the follow rules meanwhile).
      // (Flights start from the camera's real arm and pitch — see startFlight — so this takes over smoothly.)
      let shown = L;
      if (flight) {
        const u = flight.t / flight.dur;
        if (!flight.track) {
          shown = d;
          armLen = d;
          armLenVel = 0;
        } else shown = d + (L - d) * smoother((u - 0.7) / 0.3);
        liftAll = true;
      }
      if (shown < d - 0.01) {
        d = shown;
        _pos.copy(_tgt).addScaledVector(_dir, d);
      }
      armShown = d;
    }
    // never inside hills / water; glide over (low) roofs — rising ahead of the roofs the arm is sweeping towards
    // (free camera: only the ground stops it — a lift left from a guided / follow view eases out)
    const hard = field.groundMaxAt(_pos.x, _pos.z) + (freeOrbit ? 1.2 : 2);
    const soft = field.roofAt(_pos.x, _pos.z, ROOF_MARGIN) + 1.6;
    let need = freeOrbit ? 0 : Math.max(0, soft - _pos.y);
    if (!liftAll && need > LIFT_MAX + 2) need = 0;
    const needNow = need;
    if (looking && !freeOrbit) {
      const nl = lookSamples(4, 16);
      for (let k = 1; k <= nl; k++) {
        const p = lookAhead((ARM_HORIZON * k) / nl, pitch, d);
        need = Math.max(need, liftNeed(p.tx, _tgt.y, p.tz, p.yaw, p.pitch, Math.min(d, p.dist), liftAll) * 0.85);
      }
    }
    if (dt <= 0) {
      roofLift = need;
      roofLiftVel = 0;
    } else {
      [roofLift, roofLiftVel] = spring(roofLift, roofLiftVel, need, need > roofLift ? 13 : 3.6, dt);
      if (roofLift < 0) {
        roofLift = 0;
        roofLiftVel = Math.max(0, roofLiftVel);
      }
      // never sink into a roof: `soft` is the exact roof (+0.6 pad) plus 1.6 m
      const floorY = soft - 1.5;
      if (needNow > 0 && _pos.y + roofLift < floorY) {
        roofLift = floorY - _pos.y;
        roofLiftVel = Math.max(roofLiftVel, 0);
      }
    }
    _pos.y += roofLift;
    dbg.need = need;
    if (_pos.y < hard) _pos.y = hard;
    camera.position.copy(_pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(_tgt);
    const effDist = _pos.distanceTo(_tgt);
    const baseFov = WORLD_MODE ? worldFov(effDist) : BASE_FOV;
    const wantFov = follow?.chase ? Math.max(CHASE_FOV, baseFov) : baseFov;
    fov += (wantFov - fov) * (dt > 0 ? damp(3, dt) : 1);
    camera.fov = fov;
    camera.near = clamp(effDist * 0.02, 0.3, 20);
    camera.far = WORLD_MODE ? WORLD_FAR : effDist * 6 + 2500;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    eff.tx = _tgt.x;
    eff.ty = _tgt.y;
    eff.tz = _tgt.z;
    eff.dist = effDist;
    const off = _v.subVectors(_pos, _tgt);
    eff.yaw = Math.atan2(off.x, off.z);
    eff.pitch = Math.asin(clamp(off.y / Math.max(effDist, 1e-6), -1, 1));
  }

  // ───────────────────────────────────────────── service
  const footprint = (out: { x: number; z: number }[]): boolean => {
    const corners: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    let ok = true;
    for (let i = 0; i < 4; i++) {
      const [cx, cy] = corners[i];
      ndc.set(cx, cy);
      raycaster.setFromCamera(ndc, camera);
      const r = raycaster.ray;
      let t = 1600;
      if (r.direction.y < -0.01) t = Math.min(1600, (0 - r.origin.y) / r.direction.y);
      else ok = false;
      const o = out[i] ?? (out[i] = { x: 0, z: 0 });
      o.x = r.origin.x + r.direction.x * t;
      o.z = r.origin.z + r.direction.z * t;
    }
    return ok;
  };

  const service: CameraServiceExt = {
    flyTo,
    follow: (hit) => {
      if (tour.active) stopTour();
      if (!hit) {
        releaseFollow();
        return;
      }
      if (follow) releaseFollow();
      startFollow(hit, { tour: false });
    },
    getState: () => ({ target: { x: eff.tx, y: eff.ty, z: eff.tz }, distance: eff.dist, yaw: eff.yaw / DEG, pitch: eff.pitch / DEG }),
    busy: () => !!(drag && drag.moved) || pinch !== null || flight !== null || performance.now() < movingUntil,
    mode: () => modeNow(),
    startTour,
    stopTour,
    following: () => (follow && !follow.tour ? follow.hit : null),
    setChase,
    chasing: () => !!follow?.chase,
    touring: () => tour.active,
    pickAt,
    surfacePoint,
    flyToPoint,
    flyToPoi,
    footprint,
    pointer,
    groundAt: (x, z) => field.groundAt(x, z),
    pois: () => plan.pois,
    setHoverCursor: (on) => {
      if (hoverCursor === on) return;
      hoverCursor = on;
      updateCursor();
    },
    caption: () => captionInfo,
    liveEntities: () => scout.live(liveList),
  };
  ctx.services.camera = service;
  if (ctx.debug.params.has('camdebug')) {
    const ext = service as unknown as Record<string, unknown>;
    ext.debugState = () => ({ ...dbg, armLen, armLenVel, roofLift, my: motion.yaw, mld: motion.ld });
    // blocked stretches of an arm from the current pivot (degrees, metres)
    ext.debugScan = (yawDeg: number, pitchDeg: number, len: number) => {
      const buf = new Float32Array(SCAN_MAX * 2);
      const n = scanArm(cur.tx, cur.ty, cur.tz, yawDeg * DEG, pitchDeg * DEG, len, buf);
      return Array.from(buf.slice(0, n * 2)).map((v) => Math.round(v * 10) / 10);
    };
  }

  // ───────────────────────────────────────────── establishing shot
  const params = ctx.debug.params;
  // the stand-in city is only for isolated tests: with the real world loaded it would double everything
  const proxy = params.has('camdebug') && ctx.pickers.length === 0 ? buildDebugProxy(ctx) : null;
  if (overview && !params.has('nointro')) {
    const end = poiPose(overview, cur);
    const start: Pose = { tx: end.tx + 40, ty: end.ty, tz: end.tz - 30, dist: end.dist * 1.75, yaw: end.yaw - 78 * DEG, pitch: 66 * DEG };
    copyPose(cur, start);
    copyPose(goal, start);
    flight = { from: copyPose(newPose(), start), to: end, t: -0.35, dur: 5.2, arc: 0, pitchArc: 0, track: false, kind: 'intro', occFree: true, rise: 0, hold: 0 };
  }
  if (params.has('tour')) setTimeout(() => startTour(), 300);
  applyCamera(0);

  let frames = 0;
  let camMs = 0;
  return {
    name: 'camera',
    update(dt) {
      proxy?.update(dt);
    },
    frame(realDt) {
      const t0 = performance.now();
      const dt = Math.min(realDt, 0.1);
      frames++;
      scout.update();
      scout.updateCensus(0.35);
      integrateKeys(dt);
      integrateInertia(dt);
      updateFollow(dt);
      tour.update(dt);

      if (flight) {
        flight.t += dt;
        if (flight.track && follow) {
          // chase a moving end pose; its yaw is unwrapped against the previous frame's value
          // (unwrapping against the flight start would flip it by 2π when the entity turns → a jump cut)
          const prevYaw = flight.to.yaw;
          followGoal(flight.to, prevYaw);
          flight.to.dist = goal.dist;
          flight.to.pitch = goal.pitch;
          if (!follow.relative) flight.to.yaw = prevYaw + wrapPi(goal.yaw - prevYaw);
        }
        const u = evalFlight(flight, tmpPose);
        copyPose(cur, tmpPose);
        if (u >= 1) {
          const f = flight;
          flight = null;
          const keepYaw = goal.yaw;
          copyPose(goal, cur);
          if (f.track && follow && !follow.relative) goal.yaw = cur.yaw + wrapPi(keepYaw - cur.yaw);
        }
      } else {
        if (follow) followGoal(goal, cur.yaw);
        clampGoal();
        if (follow) {
          // feed-forward the entity velocity so the pivot does not lag behind
          cur.tx += follow.vel.x * dt;
          cur.ty += follow.vel.y * dt;
          cur.tz += follow.vel.z * dt;
          const kt = damp(6.5, dt);
          cur.tx += (goal.tx - cur.tx) * kt;
          cur.ty += (goal.ty - cur.ty) * kt;
          cur.tz += (goal.tz - cur.tz) * kt;
        } else {
          const kt = damp(11, dt);
          cur.tx += (goal.tx - cur.tx) * kt;
          cur.ty += (goal.ty - cur.ty) * kt;
          cur.tz += (goal.tz - cur.tz) * kt;
        }
        const kr = damp(follow?.relative ? 9 : 12, dt);
        cur.yaw += (goal.yaw - cur.yaw) * kr;
        cur.pitch += (goal.pitch - cur.pitch) * kr;
        const kd = damp(9, dt);
        cur.dist = Math.exp(Math.log(cur.dist) + (Math.log(goal.dist) - Math.log(cur.dist)) * kd);
      }
      // keep yaw values bounded without visible jumps
      if (Math.abs(cur.yaw) > Math.PI * 4) {
        const w = Math.round(cur.yaw / (Math.PI * 2)) * Math.PI * 2;
        cur.yaw -= w;
        goal.yaw -= w;
        motion.prev.yaw -= w;
        if (flight) {
          flight.from.yaw -= w;
          flight.to.yaw -= w;
        }
      }
      trackMotion(dt);
      applyCamera(dt);
      checkMode();
      // attract mode: a quiet city starts showing itself off
      if (!tour.active && !follow && !flight && !document.hidden && t0 - lastActivity > idleTourAfter()) {
        startTour();
        lastActivity = t0;
      }
      camMs = camMs * 0.95 + (performance.now() - t0) * 0.05;
    },
    resize() {
      applyCamera(0);
    },
    stats() {
      return {
        mode: modeNow() + (follow?.chase ? '+chase' : ''),
        distance: Math.round(eff.dist),
        yaw: Math.round(eff.yaw / DEG),
        pitch: Math.round(eff.pitch / DEG),
        flying: flight ? flight.kind : 'no',
        frameMs: Math.round(camMs * 1000) / 1000,
      };
    },
    invariants() {
      const out: string[] = [];
      const p = camera.position;
      if (![p.x, p.y, p.z, eff.tx, eff.ty, eff.tz].every(isFinite)) out.push('camera position / target is not finite');
      const floor = field.groundAt(p.x, p.z) + 1.9;
      if (p.y < floor) out.push(`camera below the terrain/water floor (y=${p.y.toFixed(2)} < ${floor.toFixed(2)})`);
      const m = boundsMargin() + 1;
      if (eff.tx < bounds.x0 - m || eff.tx > bounds.x1 + m || eff.tz < bounds.z0 - m || eff.tz > bounds.z1 + m) out.push('camera target outside the slab bounds');
      if (!flight && goal.pitch < minPitchNow() - 1e-3) out.push('pitch below the limit');
      if (follow && follow.cls === 'static' && !flight && eff.dist < follow.minDist * 0.5) out.push(`too close to the viewed ${follow.hit.kind} (${eff.dist.toFixed(1)} m)`);
      if (camera.near <= 0 || camera.far <= camera.near) out.push('bad near/far planes');
      if (ctx.services.camera !== service) out.push('camera service replaced');
      void frames;
      return out;
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerenter', onEnter);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInput);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointerdown', onActivity, true);
      window.removeEventListener('keydown', onActivity, true);
      window.removeEventListener('wheel', onActivity, true);
      window.removeEventListener('pointermove', onActivity, true);
    },
  };
}
