// Adaptive quality: watches real frame times and walks a ladder of cheaper
// settings when the frame rate stays below ~50 fps, climbing back up once there
// is consistent headroom — without oscillating.
//
// A low frame rate is not always our GPU work's fault (battery-saver 30 Hz caps,
// background throttling, a busy machine, headless browsers). So:
//   * where EXT_disjoint_timer_query_webgl2 exists (Chrome/Edge desktop), every
//     frame's GPU time is measured asynchronously (GpuTimer, no stalls). A slow
//     window only counts if the GPU really is busy (>= GPU_HEAVY ms);
//   * every step down is verified: if it neither made the GPU noticeably cheaper
//     nor the frame rate better, it is undone and the controller stands down
//     ("capped") for a while — the bottleneck is elsewhere;
//   * the GPU time a step saved is remembered; stepping back up is only tried when
//     the current GPU time plus that saving fits the budget (so a static view never
//     ping-pongs), and without timers an up-step that fails doubles the wait.

export interface QualityStep {
  name: string;
  renderScale: number;
  ao: boolean;
  dof: 'full' | 'lite' | 'off';
  /** cap on the water's planar reflection level (0 off, 1 low, 2 full); the preset may be lower */
  refl: 0 | 1 | 2;
  /** grass blade density relative to the preset (groundcover.setDensity) */
  grass: number;
  /** leaf-card LOD distance relative to the preset (vegetation.setLeafDistance) */
  leaf: number;
}

/**
 * The ladder, cheapest visual loss per saved millisecond first:
 *   full → refl-low (planar reflection at ~1/4.5 res without trees/trim: big saving, small loss)
 *   → no-ao (N8AO ≈ 2 ms) → scale-0.85 → dof-lite → scale-0.72
 *   → refl-off (analytic sky only: the water loses the mirrored town — kept as long as possible)
 *   → scale-0.6.
 * World round: grass-0.7 / leaf-0.65 after refl-low and detail-low (0.45 / 0.4) after scale-0.85, when
 * the groundcover / vegetation services offer their setters.
 * Reflection steps exist only when the water module renders reflections at load (`refl`).
 */
export function buildLadder(ao: boolean, dof: boolean, refl = false, grass = false, leaf = false): QualityStep[] {
  const steps: QualityStep[] = [];
  const d = dof ? 'full' : 'off';
  const lite = dof ? 'lite' : 'off';
  const r1: 0 | 1 | 2 = refl ? 1 : 2;
  // world round: the grass blades (groundcover) and the near leaf cards (vegetation) are the expensive
  // new vertex work — thinned early (barely visible in motion), then once more before the bigger losses
  const g1 = grass ? 0.7 : 1,
    g2 = grass ? 0.45 : 1;
  const l1 = leaf ? 0.65 : 1,
    l2 = leaf ? 0.4 : 1;
  steps.push({ name: 'full', renderScale: 1, ao, dof: d, refl: 2, grass: 1, leaf: 1 });
  if (refl) steps.push({ name: 'refl-low', renderScale: 1, ao, dof: d, refl: 1, grass: 1, leaf: 1 });
  if (grass) steps.push({ name: 'grass-0.7', renderScale: 1, ao, dof: d, refl: r1, grass: g1, leaf: 1 });
  if (leaf) steps.push({ name: 'leaf-0.65', renderScale: 1, ao, dof: d, refl: r1, grass: g1, leaf: l1 });
  if (ao) steps.push({ name: 'no-ao', renderScale: 1, ao: false, dof: d, refl: r1, grass: g1, leaf: l1 });
  steps.push({ name: 'scale-0.85', renderScale: 0.85, ao: false, dof: d, refl: r1, grass: g1, leaf: l1 });
  if (grass || leaf) steps.push({ name: 'detail-low', renderScale: 0.85, ao: false, dof: d, refl: r1, grass: g2, leaf: l2 });
  if (dof) steps.push({ name: 'dof-lite', renderScale: 0.85, ao: false, dof: 'lite', refl: r1, grass: g2, leaf: l2 });
  steps.push({ name: 'scale-0.72', renderScale: 0.72, ao: false, dof: lite, refl: r1, grass: g2, leaf: l2 });
  if (refl) steps.push({ name: 'refl-off', renderScale: 0.72, ao: false, dof: lite, refl: 0, grass: g2, leaf: l2 });
  steps.push({ name: 'scale-0.6', renderScale: 0.6, ao: false, dof: lite, refl: refl ? 0 : 2, grass: g2, leaf: l2 });
  return steps;
}

/** frames slower than this (per 1 s window) are "slow" */
const SLOW_FPS = 49;
/** windows at or above this are "fast" */
const FAST_FPS = 57;
/** GPU ms per frame above which a slow frame rate is blamed on our GPU work */
const GPU_HEAVY = 14;
/** predicted GPU ms per frame at the higher level must stay below this to step up */
const GPU_UP = 13.5;

/** Asynchronous per-frame GPU timing (TIME_ELAPSED queries), results arrive a few frames late. */
export class GpuTimer {
  private ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private free: WebGLQuery[] = [];
  private pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  constructor(private gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  }
  get available(): boolean {
    return !!this.ext;
  }
  begin(): void {
    if (!this.ext || this.active || this.pending.length >= 6) return;
    const q = this.free.pop() ?? this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }
  end(): void {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }
  /** collect finished queries; calls `out(ms)` for each valid one */
  poll(out: (ms: number) => void): void {
    if (!this.ext) return;
    const gl = this.gl;
    while (this.pending.length) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      this.pending.shift();
      this.free.push(q);
      if (!disjoint) out(ns / 1e6);
    }
  }
}

export class AdaptiveController {
  level = 0;
  fps = 60;
  /** mean GPU ms per frame over the last window (-1 = unknown / no timer) */
  gpuMs = -1;
  /** true while the frame rate looks capped by something other than our GPU work */
  capped = false;
  private winTime = 0;
  private winFrames = 0;
  private winMax = 0;
  private gpuSum = 0;
  private gpuN = 0;
  private slowWins = 0;
  private fastWins = 0;
  private warmup = 4; // seconds ignored after start / after a change
  private upWait = 8; // consecutive fast windows needed before trying a step up
  private lastUpAt = -1e9;
  private clock = 0;
  private cappedUntil = -1;
  /** how long (s) to stand down after a step that did not help; doubles on every repeat */
  private capFor = 60;
  /** set right after a step down: what we left, to verify the step helped */
  private verify: { from: number; fps: number; gpu: number } | null = null;
  /** measured GPU ms saved by stepping from level i to i + 1 */
  private saving: number[] = [];

  constructor(
    public readonly ladder: QualityStep[],
    private onChange: (step: QualityStep, level: number) => void,
    public enabled = true,
  ) {}

  /** one GPU timing result (ms) for a frame drawn at the current level */
  gpuSample(ms: number): void {
    if (this.warmup > 0) return;
    this.gpuSum += ms;
    this.gpuN++;
  }

  /** feed one frame; returns true if the level changed */
  frame(realDt: number): boolean {
    this.clock += realDt;
    if (!this.enabled) return false;
    if (this.warmup > 0) {
      this.warmup -= realDt;
      return false;
    }
    this.winTime += realDt;
    this.winFrames++;
    this.winMax = Math.max(this.winMax, realDt);
    if (this.winTime < 1) return false;
    const fps = this.winFrames / this.winTime;
    const gpu = this.gpuN > 0 ? this.gpuSum / this.gpuN : -1;
    const hitch = this.winMax > 0.25; // shader compile / tab switch: ignore this window
    this.winTime = 0;
    this.winFrames = 0;
    this.winMax = 0;
    this.gpuSum = 0;
    this.gpuN = 0;
    if (hitch) return false;
    this.fps = fps;
    this.gpuMs = gpu;
    if (this.capped && this.clock >= this.cappedUntil) this.capped = false;

    // did the last step down help? (first clean window after it settled)
    if (this.verify) {
      const v = this.verify;
      this.verify = null;
      const gpuGain = v.gpu > 0 && gpu > 0 ? v.gpu - gpu : -1;
      if (gpuGain >= 0) this.saving[v.from] = gpuGain;
      const helped = gpuGain >= 0 ? gpuGain >= 1.0 || fps >= v.fps + 5 : fps >= v.fps + 5 || fps >= SLOW_FPS;
      if (!helped) {
        // the bottleneck is elsewhere: undo, and leave quality alone for a while
        this.capped = true;
        this.cappedUntil = this.clock + this.capFor;
        this.capFor = Math.min(600, this.capFor * 2);
        return this.set(v.from);
      }
    }

    const gpuHeavy = gpu < 0 || gpu >= GPU_HEAVY;
    if (fps < SLOW_FPS) {
      this.slowWins = gpuHeavy ? this.slowWins + 1 : 0;
      this.fastWins = 0;
      if (!gpuHeavy && !this.capped) {
        this.capped = true; // slow, but our GPU work is light: external cap
        this.cappedUntil = this.clock + 30;
      }
    } else if (fps >= FAST_FPS) {
      this.fastWins++;
      this.slowWins = 0;
    } else {
      this.slowWins = 0;
      this.fastWins = Math.max(0, this.fastWins - 1);
    }

    if (this.slowWins >= 3 && this.level < this.ladder.length - 1 && !this.capped) {
      this.slowWins = 0;
      // a step up that did not hold: wait twice as long before the next attempt
      if (this.clock - this.lastUpAt < 8) this.upWait = Math.min(120, this.upWait * 2);
      this.verify = { from: this.level, fps, gpu };
      return this.set(this.level + 1);
    }
    if (this.fastWins >= this.upWait && this.level > 0) {
      const s = this.saving[this.level - 1];
      // with GPU timing: only climb when the predicted cost fits
      if (gpu > 0 && s !== undefined && gpu + s > GPU_UP) {
        this.fastWins = 0;
        return false;
      }
      this.lastUpAt = this.clock;
      return this.set(this.level - 1);
    }
    return false;
  }

  set(level: number): boolean {
    level = Math.max(0, Math.min(this.ladder.length - 1, level));
    if (level === this.level) return false;
    this.level = level;
    this.slowWins = 0;
    this.fastWins = 0;
    this.warmup = 2.5;
    this.gpuSum = 0;
    this.gpuN = 0;
    this.onChange(this.ladder[level], level);
    return true;
  }
}
