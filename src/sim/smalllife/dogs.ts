// A dog's own life on its lead (close-up round, docs/progress/close-life.md). It does not stay at heel: it ranges to the
// side and ahead, stops to smell something and falls behind until the lead is nearly taut, then trots to catch up; when
// its walker stands it sniffs about, sits, looks up. Decided by time slots from the member's seed, so nothing is
// allocated; a few numbers on the Member (crowd.ts), which render.ts turns into the dog's place and head.
//
// Switch: ?nodoglife (core/closeLife.ts)

import { closeLifeOn } from '../../core/closeLife';

export const DOGLIFE = closeLifeOn('doglife');

/** the most a lead lets it drop behind (m, in the walker's frame) */
const MAX_LAG = 0.95;

interface DogState {
  seed: number;
  speed: number;
  stillT: number;
  dogLag: number;
  dogLagV: number;
  dogSide: number;
  dogYaw: number;
  dogHead: number;
  dogTurn: number;
  dogWag: number;
  dogSniff: number;
  dogSit: number;
}

const hash = (x: number): number => {
  const h = Math.sin(x) * 43758.5453;
  return h - Math.floor(h);
};

export function stepDog(m: DogState, t: number, h: number): void {
  const s = m.seed;
  // sniff episodes: some slots of about 7–15 s hold one, 2–5 s long
  const P = 7 + 8 * hash(s * 37.1);
  const tt = t + s * 211;
  const e = Math.floor(tt / P);
  const at = (P * 0.55) * hash(s * 11.3 + e * 3.1);
  const dur = 2 + 3 * hash(s * 5.7 + e * 1.7);
  const f = tt - e * P - at;
  const sniffing = hash(s * 71.9 + e * 2.3) < 0.62 && f > 0 && f < dur && m.dogLag < MAX_LAG;
  m.dogSniff += ((sniffing ? 1 : 0) - m.dogSniff) * Math.min(1, h * 6);

  // along the lead: while it smells something the walker goes on without it; then it hurries to catch up
  let v = 0;
  const walking = m.speed > 0.15;
  if (walking) {
    if (m.dogSniff > 0.5) v = m.speed;
    else if (m.dogLag > 0) v = -Math.min(1.1, 0.5 + m.dogLag * 1.6);
    else {
      // ranges a little ahead and back of its usual place
      const want = -0.22 + 0.32 * Math.sin(t * 0.23 + s * 40);
      v = (want - m.dogLag) * 1.2;
    }
  } else v = (0 - m.dogLag) * 0.5 * (m.dogSit > 0.2 ? 0 : 1);
  m.dogLagV = v;
  m.dogLag = Math.min(MAX_LAG, Math.max(-0.3, m.dogLag + v * h));

  // to the side: out and in, further when it has something to smell
  const sideWant = 0.1 * Math.sin(t * 0.31 + s * 17) + 0.05 * Math.sin(t * 0.77 + s * 5) + m.dogSniff * 0.16 * (hash(s + e) - 0.5) * 2;
  m.dogSide += (sideWant - m.dogSide) * Math.min(1, h * 1.2);
  // the body points where it is going
  const yawWant = (sideWant - m.dogSide) * 2.2 + m.dogSniff * 0.42 * (hash(s * 3 + e) - 0.5) * 2 + (walking ? 0 : 0.35 * Math.sin(t * 0.3 + s * 9));
  m.dogYaw += (yawWant - m.dogYaw) * Math.min(1, h * 3);

  // the head: nose to the ground, moving along what it smells; else up and looking about, up at the walker when sitting
  const sit = m.dogSit;
  let head = 0;
  let turn = 0;
  if (m.dogSniff > 0.05) {
    head = (0.95 + 0.08 * Math.sin(t * 9 + s * 3)) * m.dogSniff;
    turn = 0.25 * Math.sin(t * 2.3 + s * 13) * m.dogSniff;
  }
  if (sit > 0.5) {
    // looks round at the walker (who stands behind and to its right), now and then elsewhere
    const look = hash(s * 13.3 + Math.floor((t + s * 50) / 3.3));
    turn = look < 0.5 ? 0.9 : (look - 0.75) * 2;
    head = look < 0.5 ? -0.38 : -0.1;
  } else if (m.dogSniff < 0.05) {
    const look = hash(s * 7.7 + Math.floor((t + s * 30) / 2.6));
    turn = look < 0.3 ? (look - 0.15) * 4 : 0;
    head = -0.05;
  }
  m.dogHead += (head - m.dogHead) * Math.min(1, h * 5);
  m.dogTurn += (turn - m.dogTurn) * Math.min(1, h * 4);
  // the tail: slow while it works, happy when it trots or looks up
  const wag = m.dogSniff > 0.5 ? 0.3 : sit > 0.5 ? 0.45 + 0.4 * Math.max(0, Math.sin(t * 0.5 + s * 7)) : 0.65;
  m.dogWag += (wag - m.dogWag) * Math.min(1, h * 3);
}
