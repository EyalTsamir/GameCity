// Fragment code of the trains' close level (trainMaterial.ts, programs with TR_NEAR): only the few cars beside the camera run these,
// the city-wide train program does not grow by an instruction (everything is behind #ifdef). Same method as the road vehicles
// (traffic/closeGlsl.ts): what a pixel needs from a metre away comes from the shared close-up tiles (world/closemat/textures.ts).
//
//   T.INNER  saloon and cab, aExtra = (mode, a, b, cab)    MODE below says what it is made of
//   T.LEAF   the lined inside of a door leaf (slides with the leaf)
//   T.STEEL  running gear, aExtra.x = finish               FIN below
//   T.WHEEL  turned steel: tread, web, disc found by radius (aExtra.x = wheel radius, y = axle z)
//   T.HEAD / T.TAIL  a lamp's cover, aExtra = (centre, radius): the bowl and bulbs behind it by a ray from the eye
//   glass    drawn after everything, added over what is behind it: reflection, dust; what it lets through goes out in alpha

import { T } from './tags';

export const MODE = { fixed: 0, moquette: 1, plastic: 2, wall: 3, floor: 4, ceiling: 5, lamp: 6, metal: 7, led: 8, tft: 9, pilot: 10, rubber: 11, plate: 12, poster: 13 } as const;
export const FIN = { paint: 0, rubber: 1, bright: 2, grease: 3, cast: 4 } as const;

export const NEAR_VERT_PARS = /* glsl */ `
varying vec4 vExtra;
varying vec3 vObjN;
`;

/** after the far level's emissive terms (`e`, `tg`, `role`, `lit` in scope) */
export const NEAR_VERT_BEGIN = /* glsl */ `
  vExtra = aExtra;
  vObjN = objectNormal;
  // x: this end is the one driven from; y: the saloon's lamps; z: doors released
  if (tg == ${T.INNER} || tg == ${T.LEAF}) e = vec3(role == 1 ? 1.0 : 0.0, lit * min(aInst2.y, 1.0), aInst.z);
  // (a loco's rear lamps are drawn in the far level's flat way; only lit at the end they belong to)
`;

export const NEAR_FRAG_PARS = /* glsl */ `
uniform sampler2D tFibre;
uniform sampler2D tGrain;
uniform sampler2D tCrack;
varying vec4 vExtra;
varying vec3 vObjN;
float trAO = -1.0;
float trMetal = 0.0;
float trRough = -1.0;
float trRoughAdd = 0.0;
vec3 trTilt = vec3(0.0);
vec3 trLensAlb = vec3(0.0);
vec3 trLensEmit = vec3(0.0);
float trTrans = 0.72;
float trLine(float d, float w, float pix) {
  float lw = max(w, pix * 0.5);
  return clamp((lw - abs(d)) / pix + 0.5, 0.0, 1.0) * (w / lw);
}
// what a pane or a lamp cover mirrors, by the reflected direction in the car frame: asphalt or platform below, a line of roofs, sky
vec3 trEnv(vec3 R) {
  vec3 sky = mix(vec3(0.66, 0.73, 0.8), vec3(0.34, 0.5, 0.72), smoothstep(0.0, 0.6, R.y));
  vec3 gnd = mix(vec3(0.13, 0.13, 0.12), vec3(0.3, 0.29, 0.27), smoothstep(-0.45, 0.0, R.y));
  float az = atan(R.x, R.z);
  float skl = 0.04 + 0.05 * step(0.5, fract(az * 2.2 + 0.3)) * fract(az * 7.7) + 0.03 * sin(az * 23.0);
  return R.y > 0.0 ? mix(sky, vec3(0.3, 0.32, 0.31), step(R.y, skl)) : gnd;
}
`;

/** after the far level's colour block, inside its scope (`tg` in scope) */
export const CLOSE_FRAG = /* glsl */ `
#ifdef TR_CLOSE
{
  vec3 p = vLoc;
  vec3 on = normalize(vObjN);
  vec3 an = abs(on);
  vec2 puv = (an.x > an.y && an.x > an.z) ? p.zy : (an.y > an.z ? p.xz : p.xy);
  float pix = length(fwidth(p)) * 0.7 + 1e-4;
  vec4 gr = texture2D(tGrain, puv * 1.67);
  if (tg == ${T.INNER} || tg == ${T.LEAF}) {
    int mode = tg == ${T.LEAF} ? ${MODE.plastic} : int(vExtra.x + 0.5);
    float a = vExtra.y, cab = tg == ${T.LEAF} ? 0.0 : vExtra.w;
    // a pane with the lit saloon behind it: the lamps show at its head, the far end of the saloon fades below them
    if (mode == ${MODE.fixed} && a > 0.5) trLensEmit += vec3(1.0, 0.8, 0.56) * (0.012 + 0.05 * smoothstep(2.6, 2.95, p.y)) * vEmit.y;
    float hT = clamp((p.y - 1.13) / 2.07, 0.0, 1.0);
    vec3 base = diffuseColor.rgb;
    float rough = 0.62;
    if (mode == ${MODE.moquette}) {
      // moquette: a woven navy ground with flecks of red and ochre, a dark cover over the head, sat smooth where people slide in
      vec4 f = texture2D(tFibre, puv * vec2(2.2, 8.0));
      vec4 g2 = texture2D(tGrain, puv * 3.7 + a);
      vec3 c = vec3(0.085, 0.14, 0.27) * (0.84 + 0.32 * f.b) * (0.86 + 0.28 * g2.b);
      c = mix(c, vec3(0.3, 0.09, 0.08), smoothstep(0.62, 0.7, g2.b));
      c = mix(c, vec3(0.5, 0.42, 0.2), smoothstep(0.74, 0.8, g2.a) * 0.75);
      float yy = p.y - 1.13;
      float top = smoothstep(1.055, 1.065, yy);
      c = mix(c, vec3(0.045, 0.055, 0.07) * (0.75 + 0.5 * gr.b), top);
      c *= 1.0 - 0.65 * trLine(yy - 1.06, 0.0035, pix);
      // the seam round a cushion and the shine of use on its front edge, on the middle of a back at shoulder height
      float worn = (1.0 - smoothstep(0.0, 0.06, abs(yy - 0.46))) * 0.5 * (0.3 + a);
      c = mix(c, c * 1.5 + 0.02, clamp(worn, 0.0, 1.0));
      diffuseColor.rgb = c * (cab > 0.5 ? 1.3 : 1.0);
      rough = 0.95 - 0.25 * worn;
      trTilt += (vAxY * (f.g - 0.5) + vAxZ * (f.r - 0.5)) * 0.14;
    } else if (mode == ${MODE.wall}) {
      // laminate: the cream of the farther level's walls, a dark dado, scuffs low down, fingermarks by the windows
      vec4 cr = texture2D(tCrack, puv * 0.5);
      vec3 c = base * vec3(0.46, 0.46, 0.45) * (0.985 + 0.03 * gr.b);
      float dado = 1.0 - smoothstep(1.245, 1.255, p.y);
      c = mix(c, vec3(0.2, 0.21, 0.23) * (0.85 + 0.3 * gr.b), dado);
      c *= 1.0 - 0.3 * trLine(p.y - 2.1, 0.002, pix);
      float scuff = smoothstep(0.62, 0.86, cr.a) * (1.0 - smoothstep(1.2, 1.6, p.y));
      c = mix(c, c * 0.78, scuff * 0.6);
      c *= 0.72 + 0.28 * smoothstep(1.2, 1.75, p.y); // the shade of the seats along the foot of the wall
      diffuseColor.rgb = c;
      rough = 0.5 + 0.2 * gr.b;
    } else if (mode == ${MODE.floor}) {
      // sheet vinyl: speckled, walked pale and glossy down the aisle and at the doors
      vec4 g2 = texture2D(tGrain, p.xz * 3.1);
      vec4 cr = texture2D(tCrack, p.xz * 0.45);
      vec3 c = base * vec3(0.16, 0.17, 0.19) * (0.85 + 0.3 * gr.b);
      c += vec3(0.1) * smoothstep(0.72, 0.82, g2.b) + vec3(0.02, 0.04, 0.08) * smoothstep(0.76, 0.84, g2.a);
      float aisle = 1.0 - smoothstep(0.22, 0.55, abs(p.x));
      c = mix(c, c * 1.35 + 0.015, aisle * (0.45 + 0.4 * cr.b));
      c *= 0.9 + 0.1 * cr.b; // a little dirt ground in
      c *= 1.0 - 0.4 * smoothstep(0.55, 0.8, abs(p.x)) * (1.0 - smoothstep(1.25, 1.36, abs(p.x)) * 0.4); // the dark under the seats
      diffuseColor.rgb = c;
      rough = 0.55 - 0.2 * aisle;
    } else if (mode == ${MODE.ceiling}) {
      // pale panels, a joint every 1.55 m, a slot of vent either side, a speaker now and then
      vec3 c = base * vec3(0.55, 0.56, 0.55);
      if (a > 1.5) c *= 0.72;
      else {
        c *= 1.0 - 0.5 * trLine(abs(fract(p.z / 1.55) - 0.5) * 1.55 - 0.775, 0.003, pix);
        float slot = (1.0 - smoothstep(0.012, 0.016, abs(abs(p.x) - 0.62))) * step(0.3, fract(p.z / 0.24));
        c *= 1.0 - 0.8 * slot * step(a, 0.5);
        vec2 sp = vec2(abs(p.x) - 0.42, mod(p.z + 1.55, 3.1) - 1.55);
        float spk = (1.0 - smoothstep(0.065, 0.07, length(sp))) * (0.4 + 0.6 * step(0.5, fract(p.x * 62.0)));
        c *= 1.0 - 0.7 * spk * step(a, 0.5);
      }
      diffuseColor.rgb = c;
      rough = 0.8;
    } else if (mode == ${MODE.lamp}) {
      // the lamp band: an opal cover, a dark end to each length
      float jn = 1.0 - smoothstep(0.012, 0.02, abs(fract(p.z / 1.55) - 0.5) * 1.55 - 0.75 + 0.03);
      float rib = 0.9 + 0.1 * sin(p.x * 180.0) * (1.0 - smoothstep(0.002, 0.006, pix));
      trLensEmit += a > 0.5 ? vec3(1.0, 0.93, 0.82) * 0.35 * vEmit.y : vec3(1.0, 0.94, 0.84) * (0.55 * (1.0 - uLights) + 3.4 * vEmit.y) * rib * (1.0 - 0.7 * jn);
      diffuseColor.rgb = vec3(0.6, 0.59, 0.56) * (1.0 - 0.7 * jn);
      rough = 0.4;
    } else if (mode == ${MODE.metal}) {
      if (a > 0.5) {
        // bright steel
        trMetal = 1.0;
        rough = 0.26 + 0.22 * gr.b;
      } else {
        // the yellow coat on the poles, rubbed thin at hand height
        float hand = smoothstep(1.75, 2.0, p.y) * (1.0 - smoothstep(2.2, 2.5, p.y));
        diffuseColor.rgb = mix(base, base * 0.8 + vec3(0.08), hand * (0.3 + 0.7 * gr.b));
        rough = 0.3 + 0.25 * hand;
      }
    } else if (mode == ${MODE.led}) {
      // a dot-matrix display: amber through a dark filter; the same word the carriage's side carries
      float cy = vExtra.y, hh = vExtra.z;
      float sd = on.z >= 0.0 ? 1.0 : -1.0;
      float wd = hh * 2.0 * 8.9;
      vec2 l = vec2(p.x * sd / wd + 0.5, (p.y - cy) / (hh * 2.0) + 0.5);
      vec4 dc = trDec(vec4(${[8, 8, 1008, 112].join('.0, ')}.0), l, dFdx(l), dFdy(l));
      vec2 cell = fract(vec2(p.x, p.y) / 0.0075) - 0.5;
      float dotm = 1.0 - smoothstep(0.26, 0.42, length(cell));
      dotm = mix(dotm, 0.6, smoothstep(0.0015, 0.004, pix));
      trLensEmit += vec3(1.0, 0.56, 0.1) * (0.03 + 1.9 * dc.a) * dotm;
      diffuseColor.rgb = vec3(0.012);
      rough = 0.2;
    } else if (mode == ${MODE.tft}) {
      // a driver's screen: rows of status tiles and a bar graph on a dark ground
      vec2 u = vec2(p.x * 7.0 + a * 3.0, p.y * 30.0);
      vec2 f = fract(u);
      vec2 ic = floor(u);
      float tile = step(0.08, f.x) * step(f.x, 0.92) * step(0.14, f.y) * step(f.y, 0.86);
      float h = trH(ic.x * 13.0 + ic.y * 7.0 + a * 51.0);
      vec3 c = h < 0.5 ? vec3(0.04, 0.1, 0.18) : h < 0.78 ? vec3(0.05, 0.3, 0.42) : h < 0.92 ? vec3(0.08, 0.5, 0.2) : vec3(0.75, 0.5, 0.08);
      trLensEmit += (c * tile + vec3(0.01, 0.015, 0.025)) * vEmit.x * 1.7;
      diffuseColor.rgb = vec3(0.012);
      rough = 0.16;
    } else if (mode == ${MODE.pilot}) {
      // a pilot light or a lit button; a few are out
      float on1 = cab > 0.5 ? vEmit.x * step(0.4, fract(a * 7.31)) : 1.0;
      trLensEmit += base * (0.05 + (cab > 0.5 ? 0.9 : 1.6) * on1);
      diffuseColor.rgb = base * 0.5;
      rough = 0.3;
    } else if (mode == ${MODE.rubber}) {
      diffuseColor.rgb = base * (0.8 + 0.4 * gr.b);
      rough = a > 0.5 ? 0.42 : 0.85;
    } else if (mode == ${MODE.plate}) {
      // chequer plate at the door sills, its diamonds catching the light, rubbed bright where feet go
      vec2 d = vec2(p.x + p.z, p.x - p.z) / 0.03;
      vec2 fd = fract(d) - 0.5;
      float dm = 1.0 - smoothstep(0.12, 0.22, abs(fd.x * fd.y));
      trTilt += (vAxZ * fd.y + vAxY * fd.x) * 0.5 * dm * (1.0 - smoothstep(0.002, 0.006, pix));
      trMetal = 0.85;
      diffuseColor.rgb = base * (0.7 + 0.5 * gr.b);
      rough = 0.42 + 0.2 * gr.b;
    } else if (mode == ${MODE.poster}) {
      // a travel poster: a band of colour, a shape, the operator's name
      float sd = on.z >= 0.0 ? 1.0 : -1.0;
      vec2 c0 = vec2(p.x * sd - sd * (a > 0.5 ? -0.92 : 0.92), p.y - 2.45);
      vec3 sea = a > 0.5 ? vec3(0.1, 0.32, 0.5) : vec3(0.62, 0.32, 0.12);
      vec3 sky = a > 0.5 ? vec3(0.78, 0.75, 0.62) : vec3(0.82, 0.72, 0.46);
      vec3 c = mix(sea, sky, smoothstep(-0.14, -0.1, c0.y + 0.03 * sin(c0.x * 21.0)));
      c = mix(c, a > 0.5 ? vec3(0.86, 0.3, 0.14) : vec3(0.18, 0.28, 0.18), 1.0 - smoothstep(0.1, 0.105, length(c0 - vec2(0.05, 0.1))));
      c = mix(c, vec3(0.92, 0.9, 0.84), 1.0 - smoothstep(-0.27, -0.265, c0.y));
      vec2 l = vec2(c0.x / 0.5 + 0.5, (c0.y + 0.32) / 0.06 + 0.5);
      vec4 dc = trDec(vec4(${[8, 8, 1008, 112].join('.0, ')}.0), l, dFdx(l), dFdy(l));
      diffuseColor.rgb = mix(c, vec3(0.05, 0.08, 0.16), dc.a);
      rough = 0.28;
    } else if (mode == ${MODE.plastic}) {
      diffuseColor.rgb = base * (0.93 + 0.14 * gr.b);
      trTilt += (vAxY * (gr.g - 0.5) + vAxZ * (gr.r - 0.5)) * 0.05;
      rough = 0.6;
    }
    // a closed saloon: darker at the floor, lighter by the windows; what faces up sees the sky through them. Direct sun comes in by the
    // shadow map, through the real openings
    float swapK = smoothstep(6.0, 17.0, length(vLocDir));
    float ao = mix(0.2, 0.42, hT * hT) * (0.8 + 0.3 * on.y) * (1.0 + 0.6 * swapK);
    ao += 0.09 * smoothstep(0.7, 1.36, abs(p.x)) * step(2.1, p.y);
    trAO = ao * (cab > 0.5 ? 1.5 : 1.0);
    // the lamps on, after dark: a warm pool from the middle of the ceiling
    float lk = (cab > 0.5 ? 0.05 : 1.0) * (0.72 + 0.34 * on.y) * (1.0 - 0.22 * smoothstep(0.3, 1.36, abs(p.x)));
    if (mode == ${MODE.floor}) lk *= 0.55; // the lamps are far from the floor; the seats and legs take most of it
    if (mode == ${MODE.moquette}) lk *= mix(0.6, 1.0, swapK); // cloth drinks light: only farther off, where the farther level's flat seats begin
    trLensEmit += diffuseColor.rgb * vec3(1.0, 0.8, 0.56) * ((1.75 + 2.0 * swapK) * vEmit.y * lk + 0.08 * (cab > 0.5 ? 0.0 : 1.0) * (1.0 - uLights));
    trEmK = 0.0;
    trRough = rough;  } else if (tg == ${T.STEEL}) {
    int fin = int(vExtra.x + 0.5);
    vec4 g2 = texture2D(tGrain, puv * 5.3 + 0.3);
    vec4 cr = texture2D(tCrack, puv * 0.7);
    vec3 base = diffuseColor.rgb;
    float up = clamp(0.5 + 0.5 * on.y, 0.0, 1.0);
    float dust = (0.08 + 0.42 * cr.b * cr.b) * (0.25 + 0.75 * up * up) * (1.0 - smoothstep(0.35, 1.25, p.y) * 0.6);
    float rough = 0.55;
    if (fin == ${FIN.paint}) {
      float chip = smoothstep(0.9, 0.95, g2.a) * smoothstep(0.42, 0.7, cr.a);
      base = mix(base * (0.8 + 0.4 * gr.b), vec3(0.3, 0.2, 0.13), chip);
      rough = 0.48 + 0.3 * chip;
      trTilt += (vAxY * (gr.g - 0.5) + vAxZ * (gr.r - 0.5)) * 0.1;
    } else if (fin == ${FIN.rubber}) {
      base *= 0.85 + 0.3 * gr.b;
      dust *= 0.7;
      rough = 0.88;
    } else if (fin == ${FIN.bright}) {
      trMetal = 1.0;
      dust *= 0.12;
      rough = 0.17 + 0.2 * gr.b;
    } else if (fin == ${FIN.grease}) {
      dust *= 0.25;
      rough = 0.26 + 0.2 * cr.a;
    } else {
      // cast or forged steel: a sandy skin
      base *= 0.75 + 0.5 * gr.b;
      trTilt += (vAxY * (gr.g - 0.5) + vAxZ * (gr.r - 0.5)) * 0.3;
      rough = 0.62;
    }
    diffuseColor.rgb = mix(base, vec3(0.3, 0.24, 0.19), clamp(dust, 0.0, 0.85));
    trRough = rough + dust * 0.25;
    if (vExtra.y > 0.5) {
      // stencilled data on a sill: y = 1 marks it, z its centre along the car
      vec2 l = vec2((vExtra.z - p.z) * sign(p.x) / 0.71 + 0.5, (p.y - 1.13) / 0.16 + 0.5);
      vec4 dc = trDec(vec4(8.0, 392.0, 496.0, 112.0), l, dFdx(l), dFdy(l));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.73, 0.68), dc.a * 0.85);
    }
  } else if (tg == ${T.WHEEL}) {
    vec3 base = diffuseColor.rgb;
    float R = max(vExtra.x, 0.1);
    vec2 w = p.yz - vExtra.xy;
    float rr = length(w) / R;
    vec2 fuv = p.zy;
    vec4 g2 = texture2D(tGrain, fuv * 2.9);
    vec4 cr = texture2D(tCrack, fuv * 0.9 + 0.2);
    float face = step(0.55, an.x);
    if (face < 0.5 && rr > 0.965 && rr < 1.02 && abs(p.x) > 0.66) {
      // tread: polished by the rail, ringed with fine lines round it, rusty at its outer edge
      vec4 f = texture2D(tFibre, vec2(atan(w.y, w.x) * 0.6, p.x * 2.6));
      float edge = smoothstep(0.76, 0.785, abs(p.x));
      float band = (1.0 - smoothstep(0.03, 0.05, abs(abs(p.x) - 0.715)));
      diffuseColor.rgb = mix(vec3(0.3, 0.23, 0.17), vec3(0.62, 0.6, 0.57) * (0.82 + 0.3 * f.b), max(band, 0.6 * (1.0 - edge)));
      trMetal = 0.9 * (1.0 - 0.7 * edge);
      trRough = 0.18 + 0.35 * edge + 0.1 * f.a;
    } else {
      // web and rim: brake dust burnt on over rust, thicker towards the rim; a bright disc where one is bolted on
      float disc = (face > 0.5 && abs(p.x) > 0.79 && rr > 0.53 && rr < 0.81 && base.r > 0.15) ? 1.0 : 0.0;
      vec3 rust = mix(vec3(0.17, 0.11, 0.075), vec3(0.3, 0.19, 0.12), g2.b);
      float k = (0.45 + 0.55 * cr.b) * (0.5 + 0.5 * smoothstep(0.3, 0.95, rr));
      vec3 c = mix(base * (0.8 + 0.4 * gr.b), rust, clamp(k, 0.0, 0.92));
      float ring = 0.86 + 0.14 * sin(rr * R * 560.0) * (1.0 - smoothstep(0.0008, 0.002, pix));
      if (disc > 0.5) {
        c = vec3(0.27, 0.25, 0.235) * ring * (0.8 + 0.3 * g2.b);
        trMetal = 0.75;
        trRough = 0.3 + 0.2 * cr.b;
      } else trRough = 0.72 + 0.1 * gr.b;
      diffuseColor.rgb = c;
    }
  } else if (tg == ${T.HEAD} || tg == ${T.TAIL}) {
    // the cover of a lamp: what lies behind it, by a ray in the car frame, so it stays behind the cover as you walk past
    vec3 c = vExtra.xyz;
    float r0 = max(vExtra.w, 0.02);
    vec3 q = p - c;
    vec3 rd = normalize(vLocDir);
    float izd = 1.0 / min(rd.z, -0.15);
    vec3 col = vec3(0.0), em = vec3(0.0);
    if (tg == ${T.HEAD}) {
      float dz = r0 * 0.7;
      vec3 h = q + rd * ((-dz - q.z) * izd);
      float r = length(h.xy) / r0;
      vec3 nb = normalize(vec3(h.xy / r0 * 0.85, 1.0));
      vec3 Rb = reflect(rd, nb);
      float facet = 0.8 + 0.2 * sin(atan(h.y, h.x) * 14.0);
      float bowl = (0.12 + 0.88 * smoothstep(-0.25, 0.75, Rb.y)) * facet;
      float inB = 1.0 - smoothstep(0.95, 1.0, r);
      col = mix(vec3(0.03), vec3(0.85) * bowl, inB);
      em = vEmit * inB * (0.14 + 0.28 * bowl) * exp(-r * 1.2);
      // the projector ball standing forward of the bowl
      float R = r0 * 0.42;
      vec3 o = q - vec3(0.0, 0.0, -dz * 0.45);
      float b = dot(o, rd), cq = dot(o, o) - R * R, disc = b * b - cq;
      if (disc > 0.0) {
        vec3 n = (o + rd * (-b - sqrt(disc))) / R;
        float fres = pow(1.0 - clamp(-dot(n, rd), 0.0, 1.0), 3.0);
        col = vec3(0.03) + vec3(0.75) * pow(max(n.y, 0.0), 7.0) + vec3(0.35) * fres;
        em = vEmit * (2.2 * exp(-3.5 * dot(n.xy, n.xy)) + 0.15);
      }
    } else {
      // a tail lamp: LEDs in rings behind a red prismatic cover, the dots shift against it
      float dz = r0 * 0.35;
      vec3 h = q + rd * ((-dz - q.z) * izd);
      vec2 cell = q.xy / 0.0085;
      float odd = mod(floor(cell.y), 2.0);
      vec2 f = fract(vec2(cell.x + 0.5 * odd, cell.y)) - 0.5;
      float fine = 1.0 - smoothstep(0.0012, 0.0035, pix);
      vec3 tn = normalize(vec3(f * 1.1 * fine, 1.0));
      vec3 Rt = reflect(rd, tn);
      float spark = pow(max(Rt.y * 0.8 + 0.25, 0.0), 5.0);
      col = vec3(0.7, 0.03, 0.02) * (0.34 + 1.4 * spark);
      float rh = length(h.xy) / r0;
      vec2 hc = h.xy / 0.021;
      float hod = mod(floor(hc.y), 2.0);
      vec2 lf = fract(vec2(hc.x + 0.5 * hod, hc.y)) - 0.5;
      float dots = 1.0 - smoothstep(0.14, 0.3, length(lf));
      em = vEmit * vec3(1.0, 0.5, 0.5) * (0.07 + 0.42 * mix(0.5, dots, fine)) * (1.0 - smoothstep(0.9, 1.0, rh));
    }
    diffuseColor.rgb = vec3(0.008);
    trLensAlb = col;
    trLensEmit += em;
    trEmK = 0.0;
    trRough = 0.1;
    trIntE = vec3(0.0);
    {
      vec3 nL = on;
      vec3 Rc = reflect(rd, nL);
      trIntE += trEnv(Rc) * (0.04 + 0.96 * pow(1.0 - clamp(-dot(rd, nL), 0.0, 1.0), 5.0)) * (1.0 - 0.88 * uLights);
    }
  } else if (tg == ${T.DEST}) {
    // the destination display: amber dots behind a dark filter; the far level's plain bar is what these dots add up to
    float sd = 1.0;
    vec2 l = vec2(p.x * sd / 1.1 + 0.5, (p.y - 3.415) / 0.09 + 0.5);
    vec4 dc = trDec(vec4(${[8, 8, 1008, 112].join('.0, ')}.0), l, dFdx(l), dFdy(l));
    vec2 cell = fract(vec2(p.x, p.y) / 0.0085) - 0.5;
    float dotm = mix(1.0 - smoothstep(0.24, 0.42, length(cell)), 0.55, smoothstep(0.0018, 0.005, pix));
    trLensEmit += vEmit * (0.02 + 2.1 * dc.a) * dotm;
    diffuseColor.rgb = vec3(0.012);
    trEmK = 0.0;
    trRough = 0.16;
  } else if (tg == ${T.CONT40} || tg == ${T.CONT20A} || tg == ${T.CONT20B}) {
    // a container that has been round the world: the ribs in the light, rust where the paint has gone, salt streaks down the sides
    vec4 g2 = texture2D(tGrain, puv * 3.1);
    vec4 cr = texture2D(tCrack, puv * 0.3 + 0.1);
    vec4 cr2 = texture2D(tCrack, puv * 0.95);
    float along = an.x > 0.5 ? p.z : p.x;
    float fr = fract(along / 0.28);
    float d = 1.0 - smoothstep(0.012, 0.04, pix);
    if (an.x > 0.5) trTilt += vAxZ * (fr < 0.14 ? -0.5 : fr > 0.5 && fr < 0.64 ? 0.5 : 0.0) * d;
    float edgeR = max(1.0 - smoothstep(0.0, 0.16, abs(p.y - 1.33)), 1.0 - smoothstep(0.0, 0.16, abs(p.y - 3.8)));
    float rust = smoothstep(0.72, 0.86, cr2.a) * smoothstep(0.5, 0.8, cr.b) * 0.7;
    rust = max(rust, smoothstep(0.42, 0.68, cr2.a) * edgeR);
    vec3 c = diffuseColor.rgb * (0.88 + 0.24 * gr.b);
    c = mix(c, vec3(0.13, 0.075, 0.05) * (0.75 + 0.5 * g2.b), clamp(rust, 0.0, 0.85));
    vec4 fb = texture2D(tFibre, vec2(p.y * 0.4, along * 2.1));
    c = mix(c, c * 0.72 + 0.03, smoothstep(0.55, 0.9, fb.b) * 0.5);
    diffuseColor.rgb = c;
    trRough = 0.62 + 0.25 * rust;
  } else {
    // the body: sheet metal under old paint. Everything here is small; the far level's streaks and film stay under it
    float sideK = step(0.7, an.x) * step(1.38, abs(p.x));
    float paintK = step(0.1, dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2)));
    vec2 uvS = sideK > 0.5 ? p.zy : puv;
    vec4 g2 = texture2D(tGrain, uvS * 5.3 + vec2(0.37, 0.11));
    vec4 cr = texture2D(tCrack, uvS * 0.39 + sign(p.x) * 0.31);
    vec4 fb = texture2D(tFibre, vec2(p.z * 0.83, p.y * 3.3));   // lines along the car
    vec4 fv = texture2D(tFibre, vec2(p.y * 0.83, p.z * 3.3));   // runs down it
    float doorD = min(abs(p.z + 3.975), abs(p.z - 3.125));
    if (paintK > 0.5) {
      // orange peel in the highlight
      trTilt += (vAxY * (gr.g - 0.5) + vAxZ * (gr.r - 0.5)) * 0.012;
      if (sideK > 0.5) {
        // panel joints and a row of rivets along the lower band
        float seam = trLine(p.y - 2.045, 0.0028, pix) + trLine(p.y - 1.16, 0.003, pix) + trLine(p.y - 3.16, 0.003, pix);
        seam += trLine(abs(fract((p.z + 1.3) / 3.1) - 0.5) * 3.1 - 1.55, 0.0028, pix) * step(p.y, 2.04);
        diffuseColor.rgb *= 1.0 - 0.72 * clamp(seam, 0.0, 1.0);
        float det = 1.0 - smoothstep(0.0012, 0.003, pix);
        for (int k = 0; k < 2; k++) {
          float ry = k == 0 ? 1.205 : 2.0;
          vec2 rv = vec2((fract(p.z / 0.13) - 0.5) * 0.13, p.y - ry);
          float rd2 = length(rv);
          float rk = (1.0 - smoothstep(0.0045, 0.0065, rd2)) * det;
          diffuseColor.rgb *= 1.0 - 0.18 * rk;
          trTilt += (vAxY * rv.y + vAxZ * rv.x) / 0.006 * 0.25 * rk;
        }
      }
      // stone chips: thick on the skirt, at the door edges and the car ends; each shows primer, a few have rusted
      float zone = sideK * (0.55 * (1.0 - smoothstep(1.3, 1.75, p.y)) + 0.7 * (1.0 - smoothstep(0.03, 0.2, abs(doorD - 0.7)))) + 0.5 * (1.0 - sideK) * step(7.0, abs(p.z));
      zone = clamp(zone, 0.0, 1.0);
      float chip = smoothstep(0.86 - 0.05 * zone, 0.92, g2.a) * smoothstep(0.4, 0.72, cr.a + 0.3 * zone) * zone;
      vec3 under = mix(vec3(0.42, 0.42, 0.41), vec3(0.2, 0.11, 0.06), step(0.55, cr.b));
      diffuseColor.rgb = mix(diffuseColor.rgb, under, clamp(chip * 1.6, 0.0, 0.92));
      trRoughAdd += 0.4 * chip;
      // scratches at hand and bag height by the doors, long and shallow
      if (sideK > 0.5) {
        float band = (1.0 - smoothstep(0.7, 1.5, doorD)) * smoothstep(1.3, 1.5, p.y) * (1.0 - smoothstep(2.1, 2.5, p.y));
        float sc = smoothstep(0.8, 0.92, fb.a) * band;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.2 + 0.04, 0.7 * sc);
        trRoughAdd += 0.25 * sc;
        // dirty runs from the sills and the gutter, broken up by the tile
        float tear = smoothstep(0.6, 0.86, fv.b) * smoothstep(1.3, 2.15, p.y) * (1.0 - smoothstep(2.1, 2.16, p.y));
        tear += smoothstep(0.62, 0.9, fv.a) * smoothstep(2.9, 3.28, p.y) * 0.9;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.7, 0.66), clamp(tear, 0.0, 1.0) * (0.35 + 0.5 * cr.b));
        // the film of the track, in soft blotches rather than one even wash
        float film = (1.0 - smoothstep(1.15, 2.0, p.y + 0.5 * cr.b)) * (0.5 + 0.5 * g2.b);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.17, 0.14), film * 0.42);
        trRoughAdd += film * 0.2;
      } else if (on.z > 0.3 && p.z > 7.0) {
        // the nose has met a lot of insects
        float bug = smoothstep(0.92, 0.96, g2.a) * smoothstep(0.3, 0.7, cr.b);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.05, 0.03), bug * 0.8);
        float film = (1.0 - smoothstep(1.0, 2.1, p.y + 0.4 * cr.b));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.17, 0.14), film * 0.5);
      }
    } else {
      // gaskets, skirt and underframe: rubber with a sheen of use, dusty low down
      if (sideK > 0.5) trRough = 0.42 + 0.15 * gr.b;
      else trRoughAdd += 0.12 * gr.b;
      if (on.y < 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.19, 0.16), (1.0 - smoothstep(0.5, 1.4, p.y)) * (0.2 + 0.4 * cr.b));
    }
  }
}
#endif
#ifdef TR_GLASSPASS
{
  vec3 p = vLoc;
  vec3 on = normalize(vObjN);
  vec3 rd = normalize(vLocDir);
  vec3 nL = dot(on, rd) > 0.0 ? -on : on;
  vec3 R = reflect(rd, nL);
  float cs = clamp(-dot(rd, nL), 0.0, 1.0);
  float Fr = 0.04 + 0.96 * pow(1.0 - cs, 5.0);
  vec3 an = abs(on);
  vec2 uvS = an.x > 0.5 ? p.zy : (an.z > 0.5 ? p.xy : p.xz);
  vec4 blot = texture2D(tCrack, uvS * 0.7 + p.x * 0.31);
  vec4 gr = texture2D(tGrain, uvS * 1.67);
  float dust = 0.012 + 0.05 * blot.b * blot.b;  float tint = 0.66;
  if (tg == ${T.GLASS} && on.z > 0.3) {
    // windscreen: the wipers have cleared two fans in the film of the line, insects below them
    vec2 q0 = vec2(p.x - 0.62, p.y - 2.28), q1 = vec2(p.x + 0.62, p.y - 2.28);
    float fan = max(1.0 - smoothstep(0.82, 0.86, length(q0)), 1.0 - smoothstep(0.82, 0.86, length(q1)));
    dust = mix(0.035 + 0.05 * blot.b, 0.004, fan);
    float bug = smoothstep(0.975, 0.99, gr.a) * smoothstep(0.35, 0.75, blot.b) * (1.0 - 0.85 * fan);
    dust += bug * 0.6;
    tint = 0.84;
  } else if (an.x > 0.5) {
    // side glass: dried runs under the top seal, a bloom of dirt at the bottom corners
    vec4 fv = texture2D(tFibre, vec2(p.y * 0.83, p.z * 3.3));
    dust += 0.05 * smoothstep(0.5, 0.9, fv.b) * smoothstep(2.45, 2.95, p.y);
    dust += 0.08 * (1.0 - smoothstep(2.2, 2.38, p.y)) * (0.3 + blot.a);
  }
  dust = clamp(dust, 0.0, 0.7);
  // the pane: no colour of its own but what lies on it; it mirrors the street, more at a grazing angle
  diffuseColor.rgb = mix(vec3(0.42, 0.39, 0.34) * dust, diffuseColor.rgb, clamp(trDecA, 0.0, 1.0));
  trEmK = 0.0;
  trIntE = trEnv(R) * max(Fr, tg == ${T.GLASS} && on.z > 0.3 ? 0.05 : 0.075) * (1.0 - 0.9 * uLights);
  // a sticker on the door's pane takes the light as a sticker; the pane under it stops
  if (trDecA > 0.01) {
    trIntE *= 1.0 - trDecA;
    dust = max(dust, trDecA);
  }
  trRough = 0.1;
  trTrans = tint * (1.0 - dust) * (1.0 - Fr);
}
#endif
`;
