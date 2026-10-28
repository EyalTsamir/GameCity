// Vehicle classes for the traffic sim: physical size, driving style and how
// they are drawn. Model index = position in MODEL_KINDS (one InstancedMesh each).

export type ModelKind = 'compact' | 'hatch' | 'sedan' | 'suv' | 'estate' | 'mpv' | 'delivery' | 'lorry' | 'bus' | 'icecream' | 'bike' | 'moto';

export const MODEL_KINDS: ModelKind[] = ['compact', 'hatch', 'sedan', 'suv', 'delivery', 'lorry', 'bus', 'icecream', 'bike', 'moto', 'estate', 'mpv'];

/** Variants of the sedan family (instance attribute selects the extra parts). */
export const SEDAN_PLAIN = 0;
export const SEDAN_TAXI = 1;
export const SEDAN_POLICE = 2;

export interface VehicleSpec {
  model: ModelKind;
  modelIndex: number;
  /** body length / width / height (m) */
  len: number;
  width: number;
  height: number;
  /** wheel base and front overhang (front bumper to front axle) */
  wheelbase: number;
  frontOverhang: number;
  wheelR: number;
  /** IDM: max acceleration, comfortable deceleration, time headway */
  accel: number;
  decel: number;
  headway: number;
  /** multiplier on the speed limit */
  speedFactor: number;
  /** extra lateral clearance a turning body needs (off-tracking, overhang swing) */
  sweep: number;
  /** label for info cards */
  label: string;
  /** two-wheelers: render variant of the 'bike' / 'moto' model and the rider anchor table index */
  variant?: number;
  /** two-wheelers: ridden on the right of the lane (m from the lane centre) */
  offset?: number;
}

function spec(model: ModelKind, o: Omit<VehicleSpec, 'model' | 'modelIndex'>): VehicleSpec {
  return { model, modelIndex: MODEL_KINDS.indexOf(model), ...o };
}

export const SPECS: Record<ModelKind, VehicleSpec> = {
  compact: spec('compact', { len: 3.55, width: 1.66, height: 1.5, wheelbase: 2.3, frontOverhang: 0.62, wheelR: 0.29, accel: 1.9, decel: 2.6, headway: 1.25, speedFactor: 0.97, sweep: 0.3, label: 'City car' }),
  hatch: spec('hatch', { len: 4.0, width: 1.74, height: 1.47, wheelbase: 2.55, frontOverhang: 0.78, wheelR: 0.31, accel: 1.9, decel: 2.6, headway: 1.25, speedFactor: 1.0, sweep: 0.32, label: 'Hatchback' }),
  sedan: spec('sedan', { len: 4.45, width: 1.78, height: 1.44, wheelbase: 2.7, frontOverhang: 0.85, wheelR: 0.32, accel: 1.8, decel: 2.6, headway: 1.3, speedFactor: 1.02, sweep: 0.35, label: 'Saloon' }),
  suv: spec('suv', { len: 4.55, width: 1.86, height: 1.74, wheelbase: 2.75, frontOverhang: 0.85, wheelR: 0.37, accel: 1.7, decel: 2.5, headway: 1.35, speedFactor: 1.0, sweep: 0.38, label: 'Estate' }),
  delivery: spec('delivery', { len: 6.1, width: 2.1, height: 2.85, wheelbase: 3.6, frontOverhang: 1.0, wheelR: 0.42, accel: 1.25, decel: 2.2, headway: 1.6, speedFactor: 0.9, sweep: 0.6, label: 'Delivery van' }),
  lorry: spec('lorry', { len: 7.6, width: 2.35, height: 3.05, wheelbase: 4.4, frontOverhang: 1.3, wheelR: 0.48, accel: 1.0, decel: 2.0, headway: 1.8, speedFactor: 0.85, sweep: 0.85, label: 'Lorry' }),
  bus: spec('bus', { len: 11.0, width: 2.5, height: 3.1, wheelbase: 6.0, frontOverhang: 2.6, wheelR: 0.48, accel: 1.05, decel: 2.0, headway: 1.8, speedFactor: 0.88, sweep: 1.0, label: 'Bus' }),
  icecream: spec('icecream', { len: 5.0, width: 2.0, height: 2.6, wheelbase: 3.0, frontOverhang: 0.9, wheelR: 0.36, accel: 1.3, decel: 2.3, headway: 1.6, speedFactor: 0.75, sweep: 0.5, label: 'Ice-cream van' }),
  // parked only (silhouette variety in car parks; the traffic mix is unchanged)
  estate: spec('estate', { len: 4.7, width: 1.8, height: 1.5, wheelbase: 2.82, frontOverhang: 0.93, wheelR: 0.32, accel: 1.8, decel: 2.6, headway: 1.3, speedFactor: 1.0, sweep: 0.35, label: 'Estate' }),
  mpv: spec('mpv', { len: 4.5, width: 1.84, height: 1.7, wheelbase: 2.85, frontOverhang: 0.82, wheelR: 0.33, accel: 1.7, decel: 2.5, headway: 1.35, speedFactor: 0.98, sweep: 0.36, label: 'People carrier' }),
  bike: spec('bike', { len: 1.75, width: 0.62, height: 1.75, wheelbase: 1.05, frontOverhang: 0.36, wheelR: 0.34, accel: 1.1, decel: 2.2, headway: 1.0, speedFactor: 0.5, sweep: 0.1, label: 'Cyclist', variant: 0, offset: 0.85 }),
  moto: spec('moto', { len: 1.82, width: 0.72, height: 1.7, wheelbase: 1.3, frontOverhang: 0.26, wheelR: 0.24, accel: 2.3, decel: 3.0, headway: 1.05, speedFactor: 0.88, sweep: 0.1, label: 'Moped', variant: 0, offset: 0.45 }),
};

/** two-wheelers by type: the ridden vehicle (sim dimensions) and its render variant */
export const TWO_WHEELERS = {
  bicycle: SPECS.bike,
  escooter: spec('bike', { len: 1.15, width: 0.55, height: 1.75, wheelbase: 0.8, frontOverhang: 0.17, wheelR: 0.11, accel: 1.2, decel: 2.4, headway: 1.0, speedFactor: 0.5, sweep: 0.1, label: 'E-scooter rider', variant: 1, offset: 0.9 }),
  dutch: spec('bike', { len: 1.8, width: 0.66, height: 1.75, wheelbase: 1.05, frontOverhang: 0.4, wheelR: 0.34, accel: 0.9, decel: 2.0, headway: 1.1, speedFactor: 0.42, sweep: 0.1, label: 'Cyclist', variant: 2, offset: 0.85 }),
  scooter: SPECS.moto,
  courier: spec('moto', { len: 1.85, width: 0.72, height: 1.7, wheelbase: 1.3, frontOverhang: 0.26, wheelR: 0.24, accel: 2.3, decel: 3.0, headway: 0.95, speedFactor: 0.92, sweep: 0.1, label: 'Delivery rider', variant: 1, offset: 0.45 }),
  motorbike: spec('moto', { len: 2.08, width: 0.8, height: 1.7, wheelbase: 1.42, frontOverhang: 0.33, wheelR: 0.3, accel: 2.8, decel: 3.4, headway: 1.0, speedFactor: 0.98, sweep: 0.1, label: 'Motorcyclist', variant: 2, offset: 0.35 }),
};
export type TwoWheelType = keyof typeof TWO_WHEELERS;
export const isTwoWheeler = (sp: VehicleSpec): boolean => sp.model === 'bike' || sp.model === 'moto';

/** Two-wheeler share of ordinary traffic (Tel-Aviv street mix: mopeds and couriers everywhere). */
export const MIX_2W: { type: TwoWheelType; w: number }[] = [
  { type: 'bicycle', w: 7 },
  { type: 'dutch', w: 4 },
  { type: 'escooter', w: 7 },
  { type: 'scooter', w: 9 },
  { type: 'courier', w: 7 },
  { type: 'motorbike', w: 5 },
];
/** paint colours: bicycles, e-scooter operators, mopeds, courier boxes, motorbikes */
export const COLORS_2W: Record<TwoWheelType, string[]> = {
  bicycle: ['#1d1f22', '#c8382f', '#2e5c8a', '#e9e4d8', '#3b6b4a', '#6d6f73', '#e0a526'],
  dutch: ['#2b3a4a', '#4d6b55', '#e9e4d8', '#8a2f2f', '#1d1f22', '#b8a07a'],
  escooter: ['#6fbe44', '#1d1f22', '#2bb3b1', '#f2c230', '#e8e6e0'],
  scooter: ['#9fd3c4', '#e9e4d8', '#c8382f', '#f2c84b', '#5b84b1', '#3a3e45', '#f4f2ec', '#d98b6b'],
  courier: ['#1fb26b', '#e8432e', '#2a9fd8', '#f2b81c', '#00a082'],
  motorbike: ['#1d1f22', '#b8202a', '#2e5c8a', '#e9e4d8', '#3a3e45', '#d77a2a'],
};

/** Population mix for ordinary traffic (buses, police and the ice-cream van are managed separately). */
export const MIX: { model: ModelKind; variant: number; w: number }[] = [
  { model: 'compact', variant: 0, w: 17 },
  { model: 'hatch', variant: 0, w: 21 },
  { model: 'sedan', variant: SEDAN_PLAIN, w: 19 },
  { model: 'sedan', variant: SEDAN_TAXI, w: 8 },
  { model: 'suv', variant: 0, w: 15 },
  { model: 'delivery', variant: 0, w: 7 },
  { model: 'lorry', variant: 0, w: 4 },
];

/** Body colours (instance colour on the painted parts). */
export const BODY_COLORS = [
  '#e63946',
  '#f4a261',
  '#2a9d8f',
  '#e9c46a',
  '#457b9d',
  '#f1faee',
  '#264653',
  '#8d6cab',
  '#f4f2ec',
  '#c8ccd0',
  '#767c84',
  '#3a3e45',
  '#9fd3c4',
  '#d9839b',
  '#b5523b',
];

export const TAXI_COLOR = '#f5c518';
export const POLICE_COLOR = '#f7f7f4';
export const ICECREAM_COLORS = ['#f6b8cf', '#a8e0d1'];
export const LORRY_CAB_COLORS = ['#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#3a3e45', '#e9c46a'];
export const DELIVERY_LOGOS = 4;
