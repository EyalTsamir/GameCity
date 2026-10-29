// People placed by other modules (F2 "people everywhere"): the site workers, the bandstand band, the playground
// kids (landmarks/parts.ts person()) and the boat crews and passengers (boats/models.ts figure()) used to be
// primitive box figures built into those modules' meshes. They now only register here; the pedestrians module
// (actors.ts) draws each as a real posed figure of the crowd renderer. Three-free, import-free data so the
// world modules that load before pedestrians can fill it at build time.

/** what the person is doing (decides persona, dress and pose in actors.ts) */
export type ActorRole = 'worker' | 'band' | 'conductor' | 'kid' | 'crew' | 'passenger' | 'rower' | 'helm' | 'fisher' | 'shopper' | 'traveller';

/** a person standing / sitting at a fixed world spot (optionally carried round by a landmark animation) */
export interface ActorDef {
  x: number;
  y: number;
  z: number;
  yaw: number;
  role: ActorRole;
  seated: boolean;
  /** seated: seat top above the root (m); the root stands on the floor */
  seatY: number;
  /** shirt colour (0xrrggbb) or −1 = the look's own */
  shirt: number;
  /** landmark visibility group (uVis index, landmarks.ts) or −1 = always */
  vis: number;
  /** landmark kinetic rotation carrying the person (SWING: a·sin(b·t + c); VIS sway: b·sin(2.2·t + c)) */
  rot: { px: number; py: number; pz: number; ax: number; ay: number; az: number; amp: number; freq: number; ph: number } | null;
  /** child-sized (the old person() k < 0.8) */
  child: boolean;
  /** stable per-person seed */
  seed: number;
  /** working in place (Member.work: 1 stooped over a low task, 2 at bench height); 0 = idle */
  work: number;
  /** forced idle pose (animate.ts IDLE) or −1 = by role / seed */
  idle: number;
  /** here between these hours (with vis −1) */
  h0: number;
  h1: number;
  /** share of 20-minute periods in which someone is here (people come and go); 1 = always */
  p: number;
  /** what the hands hold: 0 nothing, 1 shopping bag, 2 a bag on the shoulder / rucksack */
  carry: number;
  /** 1 = waiting on the station platform (boards the trains: actors.ts) */
  group: number;
  /** group 1: sim seconds after a train left before this one is back on the platform */
  delay: number;
}

export type ActorIn = Pick<ActorDef, 'x' | 'y' | 'z' | 'yaw' | 'role'> & Partial<ActorDef>;

export const ACTORS: ActorDef[] = [];
// the bench ('actor-<role>' classes) locates them here
if (typeof window !== 'undefined') (window as unknown as { __actors: ActorDef[] }).__actors = ACTORS;
const keys = new Set<string>();

/** register (deduplicated by position: builders may run more than once) */
export function addActor(a: ActorIn): void {
  const k = `${a.x.toFixed(2)},${a.y.toFixed(2)},${a.z.toFixed(2)}`;
  if (keys.has(k)) return;
  keys.add(k);
  ACTORS.push({ seated: false, seatY: 0.45, shirt: -1, vis: -1, rot: null, child: false, work: 0, idle: -1, h0: 0, h1: 24, p: 1, carry: 0, group: 0, delay: 0, ...a, seed: ACTORS.length * 7919 + 17 });
}

/** a seat or standing spot on a boat model, in the model frame (boats/models.ts figure()) */
export interface CrewSeat {
  x: number;
  y: number;
  z: number;
  facing: number;
  shirt: number;
  seated: boolean;
  /** rowing (the shell's sweep rowers) */
  rower: boolean;
}

/** crew per boat mesh pool and model variant: CREW.big[variant] */
export const CREW: { big: CrewSeat[][]; small: CrewSeat[][] } = { big: [], small: [] };
export const crewBuild = { pool: 'big' as 'big' | 'small' };

/** the old box figures instead of real people (debug / before-after: ?noactors) */
export const actorsOff = typeof location !== 'undefined' && new URLSearchParams(location.search).has('noactors');
