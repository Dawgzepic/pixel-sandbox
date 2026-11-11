/**
 * Element catalog.
 *
 * Adding an element later:
 * 1. Append an id in `El` (never renumber old ids — saves store them).
 * 2. Add a row in `DEFS` with a state, density, and the flags below.
 * 3. Powders fall, liquids flow, gases rise, and solids sit automatically.
 * 4. Flammable / acid / heat behavior is flag-driven.
 * 5. Unique rules go in `CONTACT_RULES` / `PAIR_RULES`, or a small branch
 *    in life.ts / reactions.ts / movement.ts when flags are not enough.
 */
export const El = {
  Empty: 0,
  Sand: 1,
  Water: 2,
  Oil: 3,
  Acid: 4,
  Fire: 5,
  Gunpowder: 6,
  Wood: 7,
  Seed: 8,
  Plant: 9,
  Bug: 10,
  Metal: 11,
  Battery: 12,
  Bulb: 13,
  Ice: 14,
  Steam: 15,
  Lava: 16,
  Stone: 17,
  Void: 18,
  Clone: 19,
  Portal: 20,
  Wall: 21,
  Smoke: 22,
} as const;

export type ElId = (typeof El)[keyof typeof El];

export const ELEMENT_COUNT = 23;

export type ElementState = 'empty' | 'powder' | 'liquid' | 'gas' | 'solid' | 'fire' | 'life';

export interface ElementDef {
  id: number;
  name: string;
  /** Picker grouping. */
  category: 'powder' | 'liquid' | 'fire' | 'solid' | 'life' | 'power' | 'gas' | 'magic' | 'tool';
  blurb: string;
  color: [number, number, number];
  /** Per-cell RGB jitter, in channel units. */
  variance: number;
  state: ElementState;
  density: number;
  movable: boolean;
  /** Blocks rigid boxes, balls, and planks. */
  solid: boolean;
  displaceable: boolean;
  flammable: boolean;
  /** Ticks of contact before acid deletes it. 0 = immune. */
  acidResist: number;
  heatConduct: number;
  defaultTemp: number;
  /** Chunks containing this stay awake so the behavior keeps running. */
  alwaysActive: boolean;
  /** 0 none, 1 fire/lava, 2 electric, 3 magic. */
  glow: number;
  voidImmune: boolean;
  conductive: boolean;
}

export const DEFS: ElementDef[] = [
  {
    id: El.Empty, name: 'Empty', category: 'tool', blurb: '',
    color: [16, 8, 22], variance: 0, state: 'empty', density: 0,
    movable: false, solid: false, displaceable: false, flammable: false,
    acidResist: 0, heatConduct: 0.05, defaultTemp: 20, alwaysActive: false,
    glow: 0, voidImmune: true, conductive: false,
  },
  {
    id: El.Sand, name: 'Sand', category: 'powder',
    blurb: 'Piles up, sinks in water, and crusts into stone on lava.',
    color: [214, 178, 92], variance: 22, state: 'powder', density: 1.55,
    movable: true, solid: false, displaceable: true, flammable: false,
    acidResist: 4, heatConduct: 0.18, defaultTemp: 20, alwaysActive: false,
    glow: 0, voidImmune: false, conductive: false,
  },
  {
    id: El.Water, name: 'Water', category: 'liquid',
    blurb: 'Flows. Puts out fire. Freezes, boils. Meets lava: stone and steam.',
    color: [64, 126, 214], variance: 14, state: 'liquid', density: 1,
    movable: true, solid: false, displaceable: true, flammable: false,
    acidResist: 0, heatConduct: 0.4, defaultTemp: 18, alwaysActive: true,
    glow: 0, voidImmune: false, conductive: false,
  },
  {
    id: El.Oil, name: 'Oil', category: 'liquid',
    blurb: 'Floats on water. A small spill burns. A pool goes up in a whoosh.',
    color: [120, 78, 36], variance: 16, state: 'liquid', density: 0.55,
    movable: true, solid: false, displaceable: true, flammable: true,
    acidResist: 3, heatConduct: 0.16, defaultTemp: 22, alwaysActive: false,
    glow: 0, voidImmune: false, conductive: false,
  },
  {
    id: El.Acid, name: 'Acid', category: 'liquid',
    blurb: 'Sinks through sand and dissolves wood, metal, plants, and more.',
    color: [130, 232, 64], variance: 18, state: 'liquid', density: 1.7,
    movable: true, solid: false, displaceable: true, flammable: false,
    acidResist: 0, heatConduct: 0.3, defaultTemp: 20, alwaysActive: true,
    glow: 0, voidImmune: false, conductive: false,
  },
  {
    id: El.Fire, name: 'Fire', category: 'fire',
    blurb: 'Bursts, flickers, and drifts. Leaves smoke that billows and fades.',
    color: [255, 132, 32], variance: 28, state: 'fire', density: 0.2,
    movable: true, solid: false, displaceable: true, flammable: false,
    acidResist: 0, heatConduct: 0.2, defaultTemp: 480, alwaysActive: true,
    glow: 1, voidImmune: false, conductive: false,
  },
  {
    id: El.Gunpowder, name: 'Gunpowder', category: 'powder',
    blurb: 'Fire, lava, or a spark blows it up and flings whatever is nearby.',
    color: [72, 66, 78], variance: 12, state: 'powder', density: 1.4,
    movable: true, solid: false, displaceable: true, flammable: true,
    acidResist: 4, heatConduct: 0.14, defaultTemp: 20, alwaysActive: false,
    glow: 0, voidImmune: false, conductive: false,
  },
  {
    id: El.Wood, name: 'Wood', category: 'solid',
    blurb: 'Solid fuel. Holds up structures. Crates and planks burn too.',
    color: [156, 98, 48], variance: 16, state: 'solid', density: 8,
    movable: false, solid: true, displaceable: false, flammable: true,
    acidResist: 8, heatConduct: 0.12, defaultTemp: 20, alwaysActive: false,
    glow: 0, voidImmune: false, conductive: false,
  },
  {
    id: El.Seed, name: 'Seed', category: 'life',
    blurb: 'Rests by water, drinks, and grows a short vine. No water, no growth.',
    color: [196, 176, 96], variance: 14, state: 'powder', density: 1.35,
    movable: true, solid: false, displaceable: true, flammable: true,
    acidResist: 3, heatConduct: 0.12, defaultTemp: 20, alwaysActive: true,
    glow: 0, voidImmune: false, conductive: false,
  },
  {
    id: El.Plant, name: 'Plant', category: 'life',
    blurb: 'Climbs while it can drink connected water, then stops. Burns. Bugs eat it.',
    color: [46, 170, 64], variance: 20, state: 'life', density: 8,
    movable: false, solid: true, displaceable: false, flammable: true,
    acidResist: 3, heatConduct: 0.14, defaultTemp: 20, alwaysActive: false,
    glow: 0, voidImmune: false, conductive: false,
  },
  {
    id: El.Bug, name: 'Bug', category: 'life',
    blurb: 'Crawls, eats plants, and dies in fire, lava, or acid.',
    color: [214, 64, 118], variance: 14, state: 'life', density: 1.05,
    movable: false, solid: false, displaceable: true, flammable: false,
    acidResist: 2, heatConduct: 0.1, defaultTemp: 22, alwaysActive: true,
    glow: 0, voidImmune: false, conductive: false,
  },
  {
    id: El.Metal, name: 'Metal', category: 'power',
    blurb: 'Solid conductor. Draw it as wire between a battery and a bulb.',
    color: [176, 190, 206], variance: 8, state: 'solid', density: 9,
    movable: false, solid: true, displaceable: false, flammable: false,
    acidResist: 16, heatConduct: 1, defaultTemp: 20, alwaysActive: false,
    glow: 0, voidImmune: false, conductive: true,
  },
  {
    id: El.Battery, name: 'Battery', category: 'power',
    blurb: 'Sends electricity through metal. A spark ignites gunpowder.',
    color: [232, 196, 48], variance: 8, state: 'solid', density: 9,
    movable: false, solid: true, displaceable: false, flammable: false,
    acidResist: 12, heatConduct: 0.4, defaultTemp: 22, alwaysActive: false,
    glow: 2, voidImmune: false, conductive: true,
  },
  {
    id: El.Bulb, name: 'Bulb', category: 'power',
    blurb: 'Lights up when electricity reaches it through metal.',
    color: [244, 236, 190], variance: 8, state: 'solid', density: 8,
    movable: false, solid: true, displaceable: false, flammable: false,
    acidResist: 8, heatConduct: 0.2, defaultTemp: 20, alwaysActive: false,
    glow: 2, voidImmune: false, conductive: true,
  },
  {
    id: El.Ice, name: 'Ice', category: 'solid',
    blurb: 'Stays frozen in open air. Heat, fire, or lava melts it.',
    color: [186, 236, 255], variance: 10, state: 'solid', density: 8,
    movable: false, solid: true, displaceable: false, flammable: false,
    acidResist: 6, heatConduct: 0.55, defaultTemp: -20, alwaysActive: false,
    glow: 0, voidImmune: false, conductive: false,
  },
  {
    id: El.Steam, name: 'Steam', category: 'gas',
    blurb: 'Hot gas. Rises, then condenses back into water as it cools.',
    color: [214, 224, 232], variance: 8, state: 'gas', density: 0.12,
    movable: true, solid: false, displaceable: true, flammable: false,
    acidResist: 0, heatConduct: 0.22, defaultTemp: 120, alwaysActive: true,
    glow: 0, voidImmune: false, conductive: false,
  },
  {
    id: El.Lava, name: 'Lava', category: 'fire',
    blurb: 'Heavy and very hot. Cools into stone. Water makes stone and steam.',
    color: [255, 78, 24], variance: 22, state: 'liquid', density: 2.6,
    movable: true, solid: false, displaceable: true, flammable: false,
    acidResist: 0, heatConduct: 0.5, defaultTemp: 900, alwaysActive: true,
    glow: 1, voidImmune: false, conductive: false,
  },
  {
    id: El.Stone, name: 'Stone', category: 'solid',
    blurb: 'Hot stone glows, then cools back to gray. Water cools it faster.',
    color: [118, 118, 132], variance: 12, state: 'solid', density: 9,
    movable: false, solid: true, displaceable: false, flammable: false,
    acidResist: 48, heatConduct: 0.28, defaultTemp: 20, alwaysActive: false,
    glow: 0, voidImmune: false, conductive: false,
  },
  {
    id: El.Void, name: 'Void', category: 'magic',
    blurb: 'Deletes whatever touches it. Walls are immune.',
    color: [36, 0, 48], variance: 8, state: 'solid', density: 9,
    movable: false, solid: true, displaceable: false, flammable: false,
    acidResist: 0, heatConduct: 0.02, defaultTemp: 20, alwaysActive: true,
    glow: 3, voidImmune: true, conductive: false,
  },
  {
    id: El.Clone, name: 'Clone', category: 'magic',
    blurb: 'Copies whatever touches it across to the opposite side.',
    color: [198, 96, 255], variance: 12, state: 'solid', density: 9,
    movable: false, solid: true, displaceable: false, flammable: false,
    acidResist: 12, heatConduct: 0.08, defaultTemp: 20, alwaysActive: true,
    glow: 3, voidImmune: false, conductive: false,
  },
  {
    id: El.Portal, name: 'Portal', category: 'magic',
    blurb: 'Paint two colors. Elements that enter one come out the other.',
    color: [40, 220, 210], variance: 10, state: 'solid', density: 9,
    movable: false, solid: true, displaceable: false, flammable: false,
    acidResist: 12, heatConduct: 0.05, defaultTemp: 20, alwaysActive: false,
    glow: 3, voidImmune: false, conductive: false,
  },
  {
    id: El.Wall, name: 'Wall', category: 'tool',
    blurb: 'Indestructible barrier. The eraser can still remove it.',
    color: [78, 58, 102], variance: 8, state: 'solid', density: 10,
    movable: false, solid: true, displaceable: false, flammable: false,
    acidResist: 0, heatConduct: 0.04, defaultTemp: 20, alwaysActive: false,
    glow: 0, voidImmune: true, conductive: false,
  },
  {
    id: El.Smoke, name: 'Smoke', category: 'fire',
    blurb: 'Billows, drifts, and fades. Flames leave it behind.',
    color: [150, 146, 156], variance: 18, state: 'gas', density: 0.18,
    movable: true, solid: false, displaceable: true, flammable: false,
    acidResist: 0, heatConduct: 0.08, defaultTemp: 60, alwaysActive: true,
    glow: 0, voidImmune: false, conductive: false,
  },
];

export const DENSITY = new Float32Array(ELEMENT_COUNT);
export const MOVABLE = new Uint8Array(ELEMENT_COUNT);
export const IS_SOLID = new Uint8Array(ELEMENT_COUNT);
export const DISPLACE = new Uint8Array(ELEMENT_COUNT);
export const FLAMMABLE = new Uint8Array(ELEMENT_COUNT);
export const ACID_RESIST = new Uint8Array(ELEMENT_COUNT);
export const HEAT_CONDUCT = new Float32Array(ELEMENT_COUNT);
export const DEFAULT_TEMP = new Int16Array(ELEMENT_COUNT);
export const ALWAYS = new Uint8Array(ELEMENT_COUNT);
export const GLOW = new Uint8Array(ELEMENT_COUNT);
export const VOID_IMMUNE = new Uint8Array(ELEMENT_COUNT);
export const CONDUCTIVE = new Uint8Array(ELEMENT_COUNT);
export const IS_LIQUID = new Uint8Array(ELEMENT_COUNT);
export const IS_GAS = new Uint8Array(ELEMENT_COUNT);
export const IS_POWDER = new Uint8Array(ELEMENT_COUNT);
export const HAS_PAIR = new Uint8Array(ELEMENT_COUNT);

for (const d of DEFS) {
  DENSITY[d.id] = d.density;
  MOVABLE[d.id] = d.movable ? 1 : 0;
  IS_SOLID[d.id] = d.solid ? 1 : 0;
  DISPLACE[d.id] = d.displaceable ? 1 : 0;
  FLAMMABLE[d.id] = d.flammable ? 1 : 0;
  ACID_RESIST[d.id] = d.acidResist;
  HEAT_CONDUCT[d.id] = d.heatConduct;
  DEFAULT_TEMP[d.id] = d.defaultTemp;
  ALWAYS[d.id] = d.alwaysActive ? 1 : 0;
  GLOW[d.id] = d.glow;
  VOID_IMMUNE[d.id] = d.voidImmune ? 1 : 0;
  CONDUCTIVE[d.id] = d.conductive ? 1 : 0;
  IS_LIQUID[d.id] = d.state === 'liquid' ? 1 : 0;
  IS_GAS[d.id] = d.state === 'gas' ? 1 : 0;
  IS_POWDER[d.id] = d.state === 'powder' ? 1 : 0;
}

/** Neighbor sentinel: any charged cell or a battery. */
export const CHARGE = -1;

export interface ContactRule {
  self: number;
  neighbor: number;
  become: number;
  ticks: number;
  explode?: boolean;
  setTemp?: number;
}

export const CONTACT_RULES: ContactRule[] = [
  { self: El.Sand, neighbor: El.Lava, become: El.Stone, ticks: 5, setTemp: 280 },
  { self: El.Wood, neighbor: El.Fire, become: El.Fire, ticks: 18, setTemp: 480 },
  { self: El.Wood, neighbor: El.Lava, become: El.Fire, ticks: 8, setTemp: 520 },
  { self: El.Plant, neighbor: El.Fire, become: El.Fire, ticks: 10, setTemp: 460 },
  { self: El.Plant, neighbor: El.Lava, become: El.Fire, ticks: 6, setTemp: 500 },
  { self: El.Seed, neighbor: El.Fire, become: El.Fire, ticks: 6, setTemp: 460 },
  { self: El.Oil, neighbor: El.Fire, become: El.Fire, ticks: 3, setTemp: 500 },
  { self: El.Oil, neighbor: El.Lava, become: El.Fire, ticks: 2, setTemp: 540 },
  { self: El.Gunpowder, neighbor: El.Fire, become: El.Fire, ticks: 1, explode: true },
  { self: El.Gunpowder, neighbor: El.Lava, become: El.Fire, ticks: 1, explode: true },
  { self: El.Gunpowder, neighbor: CHARGE, become: El.Fire, ticks: 1, explode: true },
  { self: El.Ice, neighbor: El.Fire, become: El.Water, ticks: 4, setTemp: 10 },
  { self: El.Ice, neighbor: El.Lava, become: El.Water, ticks: 2, setTemp: 30 },
  { self: El.Bug, neighbor: El.Fire, become: El.Empty, ticks: 1 },
  { self: El.Bug, neighbor: El.Acid, become: El.Empty, ticks: 1 },
  { self: El.Bug, neighbor: El.Lava, become: El.Empty, ticks: 1 },
];

export const RULES_FOR: ContactRule[][] = Array.from({ length: ELEMENT_COUNT }, () => []);
for (const rule of CONTACT_RULES) RULES_FOR[rule.self].push(rule);

export interface PairRule {
  a: number;
  b: number;
  aTo: number;
  bTo: number;
  /** Temperature of the A product and the B product. */
  aTemp: number;
  bTemp: number;
}

export const PAIR_RULES: PairRule[] = [
  { a: El.Water, b: El.Lava, aTo: El.Steam, bTo: El.Stone, aTemp: 120, bTemp: 300 },
  { a: El.Water, b: El.Fire, aTo: El.Steam, bTo: El.Empty, aTemp: 110, bTemp: 20 },
  { a: El.Ice, b: El.Lava, aTo: El.Steam, bTo: El.Stone, aTemp: 140, bTemp: 280 },
];

const pairMap = new Map<number, PairRule>();
for (const rule of PAIR_RULES) {
  pairMap.set((rule.a << 8) | rule.b, rule);
  pairMap.set((rule.b << 8) | rule.a, rule);
  HAS_PAIR[rule.a] = 1;
  HAS_PAIR[rule.b] = 1;
}

export function findPair(a: number, b: number): PairRule | undefined {
  return pairMap.get((a << 8) | b);
}

export interface PhaseRule {
  from: number;
  to: number;
  op: '>' | '<';
  temp: number;
  setTemp?: number;
}

export const PHASE_RULES: PhaseRule[] = [
  { from: El.Ice, to: El.Water, op: '>', temp: 2 },
  { from: El.Water, to: El.Steam, op: '>', temp: 100, setTemp: 115 },
  { from: El.Water, to: El.Ice, op: '<', temp: -4 },
  { from: El.Steam, to: El.Water, op: '<', temp: 78, setTemp: 85 },
  { from: El.Lava, to: El.Stone, op: '<', temp: 400, setTemp: 280 },
  { from: El.Stone, to: El.Lava, op: '>', temp: 1100, setTemp: 960 },
];

export function elementByName(name: string): ElementDef | undefined {
  const lower = name.toLowerCase();
  return DEFS.find((d) => d.name.toLowerCase() === lower);
}
