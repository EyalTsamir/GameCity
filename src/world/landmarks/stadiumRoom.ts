// Into Haven Stadium (`?nostadiumwalk`): in at the east gate past the turnstiles, down the players' tunnel and out onto the pitch
// among the players, or up the east stand's aisles to the back row, with the whole ground under the floodlights in front of you.
// Near-only inside (landmarks/rooms.ts); the tunnel's hood and the gaps it needs in the stand are in stadium.ts.

import { M, PAT } from './builder';
import { RP, Room, Rooms } from './rooms';

/** the stand's numbers, in stadium.ts's terms (dep outward from the centre, u along) */
export interface StadiumWalk {
  F: number;
  S0: number;
  rowD: number;
  rise: number;
  nRows: number;
  L: number;
  W: number;
  /** half width of the tunnel */
  tun: number;
  /** aisles at +-ua */
  ua: number;
  /** height of the tunnel's ceiling */
  tunH: number;
  /** the hood covers rows up to this one */
  hoodRow: number;
}

export function buildStadiumRoom(rooms: Rooms, cx: number, cz: number, s: StadiumWalk, ground: number, outside: (x: number, z: number) => number): Room {
  const room = rooms.add(new Room('stadium', 512, 256));
  room.frame(cx, cz, 0);
  room.near = 45;
  const K = room.K;
  const { F, S0, rowD, rise, nRows, L, W, tun, ua, tunH, hoodRow } = s;

  // ── the tunnel, from the gate to the hood: tiled walls, a painted dado, strip lights, a mat. The east stand is dep = +x, u = -z
  const wallM = M('#d8d4c8', RP.PLASTER, 0.7);
  const dado = M('#a3262c', PAT.PLAIN, 0.55);
  const ceil = M('#b8b4a8', PAT.CONCRETE, 0.9);
  const floorM = M('#55585a', RP.FLAGS, 0.8, 0, 0, 0, 0.3);
  const lamp = M('#fff2d6', RP.EMIT, 0, 0, 3.5, 0, 0.7);
  const d0 = S0 - 0.1,
    d1 = W - 0.45;
  const mid = (d0 + d1) / 2,
    len = d1 - d0;
  // a box's w is along local x (= dep), its d along z (= u)
  K.box(floorM, len, 0.02, tun * 2, mid, ground, 0);
  K.box(ceil, len, 0.04, tun * 2 + 0.1, mid, ground + tunH, 0);
  for (const e of [-1, 1]) {
    K.box(wallM, len, tunH, 0.04, mid, ground, e * (tun - 0.01));
    K.box(dado, len, 1.05, 0.04, mid, ground, e * (tun - 0.02));
  }
  for (let x = d0 + 0.8; x < d1; x += 2.2) {
    K.box(lamp, 1.1, 0.02, 0.14, x, ground + tunH - 0.03, 0);
    room.lamps.push({ x, y: ground + tunH - 0.15, z: 0, k: 0.75, r: 3 });
  }
  // the team sheet and the crest in the tunnel
  const sheet = room.atlas.add(256, 360, (g, w, h) => {
    g.fillStyle = '#f4efe2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#a3262c';
    g.fillRect(0, 0, w, 58);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.font = 'bold 32px Georgia, serif';
    g.fillText('Haven FC', w / 2, 40);
    g.fillStyle = '#2a2a2a';
    g.font = '19px Georgia, serif';
    const names = ['1  Marlow', '2  Teague', '3  Osei', '4  Brandt', '5  Lindqvist', '6  Rocha', '7  Okafor', '8  Pell', '9  Duarte', '10 Sato', '11 Varga'];
    names.forEach((n, i) => g.fillText(n, w / 2, 90 + i * 24));
    g.font = 'italic 17px Georgia, serif';
    g.fillText('v Rovers, kick-off soon', w / 2, 346);
  });
  room.pic(sheet, 0.62, 0.87, d1 - 1.1, ground + 1.15, tun - 0.03, Math.PI);
  room.ambient = 0.28;
  room.skyK = 1;
  // daylight at both ends
  room.wins.push({ x: d0, y: ground + 1.3, z: 0, nx: 1, nz: 0, area: 5, trans: 1 });
  room.wins.push({ x: d1, y: ground + 1.3, z: 0, nx: -1, nz: 0, area: 4, trans: 0.8 });

  // ── where the walker can go: the footprint is solid off the floors, the street is the city's
  const rB = W + 0.9;
  room.bounds = room.rectL(-rB, -rB, rB, rB);
  room.core = room.rectL(-W - 0.4, -W - 0.4, W + 0.4, W + 0.4);
  // the pitch, up to the advertising boards
  room.walk(-F - 0.32, -F - 0.32, F + 0.32, F + 0.32, ground);
  // the tunnel, out through the gate to the pavement
  room.walk(F, -tun + 0.02, rB, tun - 0.02, (x, z) => (x - cx > W + 0.1 ? outside(x, z) : ground));
  // up from the pitch to the aisles: two steps
  const aw = 0.62;
  for (const e of [-1, 1]) {
    const u = e * ua;
    room.walk(F, u - aw, S0, u + aw, (x) => {
      const dep = x - cx;
      return ground + (dep < S0 - 0.44 ? 0 : dep < S0 - 0.22 ? 0.23 : 0.46);
    });
  }
  // the east stand: along any row, up and down only by the aisles' half steps (a whole row is too high to climb)
  room.walk(S0, -L, S0 + nRows * rowD, L, (x, z) => {
    const dep = x - cx,
      u = z - cz;
    const fi = (dep - S0) / rowD;
    const i = Math.min(nRows - 1, Math.max(0, Math.floor(fi)));
    if (Math.abs(u) < tun + 0.25 && i <= hoodRow) return NaN;
    const top = ground + 0.7 + i * rise;
    if (Math.abs(Math.abs(u) - ua) < aw) return top + (fi - i >= 0.5 ? rise / 2 : 0.04);
    return top;
  });
  return room;
}
