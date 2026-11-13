/**
 * Element catalog.
 *
 * Ids are stable: saves store them, so retired slots stay reserved and new
 * materials are appended. Retired cells are scrubbed on load and cannot be painted.
 *
 * Adding an element later:
 * 1. Append an id in `El` (never renumber old ids).
 * 2. Add a row in `DEFS` with a state, density, and the flags below.
 * 3. Powders fall, liquids flow, gases rise, and solids sit automatically.
 * 4. Unique chemistry goes in `PAIR_RULES` or reactions.ts.
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
  Molten: 23,
  Base: 24,
  Peroxide: 25,
  Iodide: 26,
  Soap: 27,
  Salt: 28,
  Hydrogen: 29,
  Oxygen: 30,
  Foam: 31,
  Glass: 32,
  MoltenGlass: 33,
} as const;

export type ElId = (typeof El)[keyof typeof El];

export const ELEMENT_COUNT = 34;

export type ElementState = 'empty' | 'powder' | 'liquid' | 'gas' | 'solid' | 'fire' | 'foam';

export interface ElementDef {
  id: number;
  name: string;
  /** Chemical formula, when the material has one. */
  formula?: string;
  /** Picker grouping. Retired rows are not shown. */
  category: 'powder' | 'liquid' | 'fire' | 'solid' | 'gas' | 'tool';
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
  /** Ticks of contact before acid corrodes it. 0 = immune. */
  acidResist: number;
  heatConduct: number;
  defaultTemp: number;
  /** Chunks containing this stay awake so the behavior keeps running. */
  alwaysActive: boolean;
  /** 0 none, 1 fire/lava. */
  glow: number;
  voidImmune: boolean;
  conductive: boolean;
  /** Old save id. Not paintable, and stripped when a world is loaded. */
  retired?: boolean;
}

function retired(id: number, name: string): ElementDef {
  return {
    id, name, category: 'solid', blurb: '',
    color: [40, 32, 48], variance: 0, state: 'solid', density: 9,
    movable: false, solid: true, displaceable: false, flammable: false,
    acidResist: 0, heatConduct: 0.05, defaultTemp: 20, alwaysActive: false,
    glow: 0, voidImmune: true, conductive: false, retired: true,
  };
}

export const DEFS: ElementDef[] = [
  {
    id: El.Empty, name: 'Empty', category: 'tool', blurb: '',
    color: [16, 8, 22], variance: 0, state: 'empty', density: 0,
    movable: false, solid: false, displaceable: false, flammable: false,
    acidResist: 0, heatConduct: 0.05, defaultTemp: 20, alwaysActive: false,
    glow: 0, voidImmune: true, conductive: false,
  },
  retired(El.Sand, 'Sand'),
  {
    id: El.Water, name: 'Water', formula: 'H2O', category: 'liquid',
    blurb: 'Flows. Puts out fire. Freezes, boils. Meets lava: stone and steam.',
    color: [64, 126, 214], variance: 14, state: 'liquid', density: 1,
    movable: true, solid: false, displaceable: true, flammable: false,
    acidResist: 0, heatConduct: 0.4, defaultTemp: 18, alwaysActive: true,
    glow: 0, voidImmune: false, conductive: false,
  },
  retired(El.Oil, 'Oil'),
  {
    id: El.Acid, name: 'Hydrochloric acid', formula: 'HCl', category: 'liquid',
    blurb: 'A strong acid. It warms against a base, and it chews into metal.',
    color: [130, 232, 64], variance: 18, state: 'liquid', density: 1.19,
    movable: true, solid: false, displaceable: true, flammable: false,
    acidResist: 0, heatConduct: 0.32, defaultTemp: 20, alwaysActive: true,
    glow: 0, voidImmune: false, conductive: false,
  },
  {
    id: El.Fire, name: 'Fire', category: 'fire',
    blurb: 'Ignites and heats whatever is already there. Only empty air becomes flame.',
    color: [255, 132, 32], variance: 28, state: 'fire', density: 0.2,
    movable: true, solid: false, displaceable: true, flammable: false,
    acidResist: 0, heatConduct: 0.2, defaultTemp: 480, alwaysActive: true,
    glow: 1, voidImmune: false, conductive: false,
  },
  retired(El.Gunpowder, 'Gunpowder'),
  retired(El.Wood, 'Wood'),
  retired(El.Seed, 'Seed'),
  retired(El.Plant, 'Plant'),
  retired(El.Bug, 'Bug'),
  {
    id: El.Metal, name: 'Metal', category: 'solid',
    blurb: 'Solid conductor. Heats from dull red to white and melts if fire is held on it.',
    color: [176, 190, 206], variance: 8, state: 'solid', density: 9,
    movable: false, solid: true, displaceable: false, flammable: false,
    acidResist: 8, heatConduct: 1, defaultTemp: 20, alwaysActive: false,
    glow: 0, voidImmune: false, conductive: true,
  },
  retired(El.Battery, 'Battery'),
  retired(El.Bulb, 'Bulb'),
  {
    id: El.Ice, name: 'Ice', formula: 'H2O', category: 'solid',
    blurb: 'Frozen water. Stays frozen in open air. Heat, fire, or lava melts it.',
    color: [186, 236, 255], variance: 10, state: 'solid', density: 8,
    movable: false, solid: true, displaceable: false, flammable: false,
    acidResist: 0, heatConduct: 0.55, defaultTemp: -20, alwaysActive: false,
    glow: 0, voidImmune: false, conductive: false,
  },
  {
    id: El.Steam, name: 'Steam', formula: 'H2O', category: 'gas',
    blurb: 'Hot water vapor. Rises, drifts, then condenses as it cools.',
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
    blurb: 'Glows while hot, then cools to gray. Held fire melts it into lava.',
    color: [118, 118, 132], variance: 12, state: 'solid', density: 9,
    movable: false, solid: true, displaceable: false, flammable: false,
    acidResist: 0, heatConduct: 0.28, defaultTemp: 20, alwaysActive: false,
    glow: 0, voidImmune: false, conductive: false,
  },
  retired(El.Void, 'Void'),
  retired(El.Clone, 'Clone'),
  retired(El.Portal, 'Portal'),
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
  {
    id: El.Molten, name: 'Molten metal', category: 'liquid',
    blurb: 'Molten metal. Flows and glows. Water hardens it back into hot metal.',
    color: [255, 168, 48], variance: 18, state: 'liquid', density: 3.4,
    movable: true, solid: false, displaceable: true, flammable: false,
    acidResist: 0, heatConduct: 0.45, defaultTemp: 1040, alwaysActive: true,
    glow: 1, voidImmune: false, conductive: true,
  },
  {
    id: El.Base, name: 'Sodium hydroxide', formula: 'NaOH', category: 'liquid',
    blurb: 'A strong base. Against acid it settles into salt and warm water.',
    color: [214, 196, 255], variance: 12, state: 'liquid', density: 1.12,
    movable: true, solid: false, displaceable: true, flammable: false,
    acidResist: 0, heatConduct: 0.3, defaultTemp: 20, alwaysActive: true,
    glow: 0, voidImmune: false, conductive: false,
  },
  retired(El.Peroxide, 'Hydrogen peroxide'),
  retired(El.Iodide, 'Potassium iodide'),
  retired(El.Soap, 'Soap'),
  {
    id: El.Salt, name: 'Sodium chloride', formula: 'NaCl', category: 'powder',
    blurb: 'Salt left behind when an acid and a base meet.',
    color: [238, 242, 246], variance: 8, state: 'powder', density: 1.35,
    movable: true, solid: false, displaceable: true, flammable: false,
    acidResist: 0, heatConduct: 0.2, defaultTemp: 20, alwaysActive: false,
    glow: 0, voidImmune: false, conductive: false,
  },
  {
    id: El.Hydrogen, name: 'Hydrogen', formula: 'H2', category: 'gas',
    blurb: 'A light gas. It rises, drifts, and fades.',
    color: [196, 255, 236], variance: 10, state: 'gas', density: 0.04,
    movable: true, solid: false, displaceable: true, flammable: false,
    acidResist: 0, heatConduct: 0.12, defaultTemp: 30, alwaysActive: true,
    glow: 0, voidImmune: false, conductive: false,
  },
  retired(El.Oxygen, 'Oxygen'),
  retired(El.Foam, 'Foam'),
  {
    id: El.Glass, name: 'Glass', formula: 'SiO2', category: 'solid',
    blurb: 'A clear dish. Heat passes through it. Acid leaves it alone. Held fire melts it.',
    color: [168, 214, 228], variance: 18, state: 'solid', density: 8,
    movable: false, solid: true, displaceable: false, flammable: false,
    acidResist: 0, heatConduct: 1, defaultTemp: 20, alwaysActive: false,
    glow: 0, voidImmune: false, conductive: false,
  },
  {
    id: El.MoltenGlass, name: 'Molten glass', category: 'liquid',
    blurb: 'Molten glass. Flows and glows. Water hardens it back into hot glass.',
    color: [255, 214, 120], variance: 16, state: 'liquid', density: 2.2,
    movable: true, solid: false, displaceable: true, flammable: false,
    acidResist: 0, heatConduct: 0.4, defaultTemp: 1040, alwaysActive: true,
    glow: 1, voidImmune: false, conductive: false,
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
export const RETIRED = new Uint8Array(ELEMENT_COUNT);

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
  RETIRED[d.id] = d.retired ? 1 : 0;
}

export interface ContactRule {
  self: number;
  neighbor: number;
  become: number;
  ticks: number;
  setTemp?: number;
}

export const CONTACT_RULES: ContactRule[] = [
  { self: El.Ice, neighbor: El.Molten, become: El.Water, ticks: 2, setTemp: 40 },
  { self: El.Ice, neighbor: El.Fire, become: El.Water, ticks: 4, setTemp: 10 },
  { self: El.Ice, neighbor: El.Lava, become: El.Water, ticks: 2, setTemp: 30 },
  { self: El.Ice, neighbor: El.MoltenGlass, become: El.Water, ticks: 2, setTemp: 40 },
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
  { a: El.Water, b: El.Molten, aTo: El.Steam, bTo: El.Metal, aTemp: 120, bTemp: 480 },
  { a: El.Water, b: El.MoltenGlass, aTo: El.Steam, bTo: El.Glass, aTemp: 120, bTemp: 420 },
  { a: El.Water, b: El.Fire, aTo: El.Steam, bTo: El.Empty, aTemp: 110, bTemp: 20 },
  { a: El.Ice, b: El.Lava, aTo: El.Steam, bTo: El.Stone, aTemp: 140, bTemp: 280 },
  { a: El.Acid, b: El.Base, aTo: El.Salt, bTo: El.Water, aTemp: 68, bTemp: 84 },
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
  { from: El.Metal, to: El.Molten, op: '>', temp: 1000, setTemp: 1040 },
  { from: El.Molten, to: El.Metal, op: '<', temp: 520, setTemp: 480 },
  { from: El.Glass, to: El.MoltenGlass, op: '>', temp: 1000, setTemp: 1040 },
  { from: El.MoltenGlass, to: El.Glass, op: '<', temp: 520, setTemp: 400 },
];

export function elementByName(name: string): ElementDef | undefined {
  const lower = name.toLowerCase();
  return DEFS.find((d) => d.name.toLowerCase() === lower && !d.retired);
}

/** Common name, plus the formula when the material has one. */
export function elementLabel(def: Pick<ElementDef, 'name' | 'formula'>): string {
  return def.formula ? `${def.name} (${def.formula})` : def.name;
}
