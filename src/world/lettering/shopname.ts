// Addresses and shop names, for the generators (which paint the far sign) and the lettering module (which writes the rest).
// Streets are the lines of the road grid; along each side of a street the doors are numbered in order, odd on one side,
// even on the other, so that reading your way down a street counts properly. ?nolettering: the old fixed words.

import { XS, ZS } from '../../core/constants';
import { DIR_VEC } from '../../core/geom';
import type { CityPlan, Lot } from '../../core/plan';
import { EW_NAMES, NS_NAMES } from '../../core/streets';
import { textOn } from '../../core/closetext';
import { canvasFamily } from './font';
import { shopOf, type Shop } from './wording';

export interface Address {
  street: string;
  number: number;
}

const nearestIdx = (a: readonly number[], v: number): number => {
  let b = 0;
  for (let i = 1; i < a.length; i++) if (Math.abs(a[i] - v) < Math.abs(a[b] - v)) b = i;
  return b;
};

/** the street a point facing (dx, dz) looks out on */
export function streetOf(x: number, z: number, dx: number, dz: number): { name: string; ns: boolean; side: number } {
  if (Math.abs(dz) > Math.abs(dx)) {
    const i = nearestIdx(ZS, z);
    return { name: EW_NAMES[i], ns: false, side: z < ZS[i] ? 0 : 1 };
  }
  const i = nearestIdx(XS, x);
  return { name: NS_NAMES[i], ns: true, side: x < XS[i] ? 0 : 1 };
}

let table: Map<number, Address> | null = null;

/** number every lot's front door; call once before the buildings are generated */
export function initAddresses(plan: CityPlan): void {
  const groups = new Map<string, { lot: Lot; t: number; street: string; side: number }[]>();
  for (const lot of plan.lots) {
    const d = lot.doors[0];
    const dv = DIR_VEC[d ? d.dir : lot.front];
    const f = lot.footprint;
    const x = d ? d.x : (f.x0 + f.x1) / 2,
      z = d ? d.z : (f.z0 + f.z1) / 2;
    const st = streetOf(x, z, dv.x, dv.z);
    const key = `${st.name}:${st.side}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push({ lot, t: st.ns ? z : x, street: st.name, side: st.side });
  }
  table = new Map();
  for (const g of groups.values()) {
    g.sort((a, b) => a.t - b.t);
    // (odd on the side that starts first, as a street is usually numbered; a wide lot skips a number or two)
    let n = g[0].side === 0 ? 1 : 2;
    let lastT = g[0].t;
    for (const e of g) {
      n += 2 * Math.min(3, Math.floor(Math.max(0, e.t - lastT - 9) / 9));
      lastT = e.t;
      table.set(e.lot.id, { street: e.street, number: n });
      n += 2;
    }
  }
}

export function addressOf(lot: { id: number }): Address {
  return table?.get(lot.id) ?? { street: 'High Street', number: 1 };
}

export function houseNumberOf(lot: { id: number }, fallback: number): number {
  return textOn() && table ? addressOf(lot).number : fallback;
}

export function shopFor(lot: { id: number }, word: string): Shop {
  return shopOf(lot.id, word, addressOf(lot).street);
}

const titles = new Map<number, string>();

/** the name over a lot's shop, once its generator has signed it */
export function signedTitle(lot: number): string | undefined {
  return titles.get(lot);
}

/** what the far sign of a shop says, and in what lettering */
export function shopSign(lot: { id: number }, word: string): { text: string; family: string | undefined; weight: string | undefined } {
  if (!textOn()) return { text: word, family: undefined, weight: undefined };
  const shop = shopFor(lot, word);
  titles.set(lot.id, shop.title);
  const c = canvasFamily(shop.face);
  return { text: shop.title, family: c.family, weight: c.weight };
}
