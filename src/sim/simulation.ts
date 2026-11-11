import {
  ALWAYS,
  DEFAULT_TEMP,
  DEFS,
  El,
  ELEMENT_COUNT,
  findPair,
} from './elements';
import { Rng } from './rng';
import { stepElectricity } from './electricity';
import { stepHeat } from './heat';
import { stepLife } from './life';
import { stepMovement } from './movement';
import { overlapsSolid, pointInBody, stepPhysics, type Body, type BodyKind } from './physics';
import { stepReactions } from './reactions';
import { AMBIENT, CHUNK, TUNING } from './tuning';

export type { Body, BodyKind };
export type CellOrigin = 'user' | 'system';

export interface SetOpts {
  temp?: number;
  aux?: number;
  aux2?: number;
  variation?: number;
  origin?: CellOrigin;
  /** Place into the indestructible border. Used only while building the rim. */
  force?: boolean;
}

export interface SimEvent {
  kind: 'explode' | 'break' | 'splash';
  x: number;
  y: number;
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [-1, 0], [1, 0], [0, 1],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];

/**
 * Fixed cellular world. Hot data lives in typed arrays.
 * Chunks (8×8) stay awake for a few frames after a change so sleeping
 * regions cost almost nothing.
 */
export class Simulation {
  readonly w: number;
  readonly h: number;
  readonly chunkCols: number;
  readonly chunkRows: number;

  type: Uint8Array;
  temp: Int16Array;
  tempNext: Int16Array;
  aux: Uint8Array;
  aux2: Uint8Array;
  variation: Uint8Array;
  charge: Uint8Array;
  /** 1 where a rigid body currently covers the cell. Liquids will not flow back in. */
  bodyBlock: Uint8Array;
  visited: Uint8Array;
  reacted: Uint8Array;
  /** Frames a chunk should keep simulating. 0 = asleep. */
  chunkTtl: Uint8Array;
  /** Renderer clears this after uploading the chunk. */
  visualDirty: Uint8Array;

  counts: Int32Array;
  /** Cells created by the simulation (reactions, growth), not the brush. */
  generated: Int32Array;
  /** Cells the player painted, including brush reactions they triggered. */
  userPaint: Int32Array;

  bodies: Body[] = [];
  nextBodyId = 1;
  events: SimEvent[] = [];
  plantsWatered = false;
  frame = 0;
  nextPortal = 1;
  rng: Rng;

  /** Flat portal coordinate lists, rebuilt when something moves. */
  pax: number[] = [];
  pay: number[] = [];
  pbx: number[] = [];
  pby: number[] = [];

  constructor(w: number, h: number, seed = 1) {
    this.w = w;
    this.h = h;
    this.chunkCols = Math.ceil(w / CHUNK);
    this.chunkRows = Math.ceil(h / CHUNK);
    const n = w * h;
    const chunks = this.chunkCols * this.chunkRows;
    this.type = new Uint8Array(n);
    this.temp = new Int16Array(n);
    this.tempNext = new Int16Array(n);
    this.aux = new Uint8Array(n);
    this.aux2 = new Uint8Array(n);
    this.variation = new Uint8Array(n);
    this.charge = new Uint8Array(n);
    this.bodyBlock = new Uint8Array(n);
    this.visited = new Uint8Array(n);
    this.reacted = new Uint8Array(n);
    this.chunkTtl = new Uint8Array(chunks);
    this.visualDirty = new Uint8Array(chunks);
    this.counts = new Int32Array(ELEMENT_COUNT);
    this.generated = new Int32Array(ELEMENT_COUNT);
    this.userPaint = new Int32Array(ELEMENT_COUNT);
    this.rng = new Rng(seed);
    this.temp.fill(AMBIENT);
    this.counts[El.Empty] = n;
    this.addBorder();
    this.wakeAll();
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  isBorder(x: number, y: number): boolean {
    return x === 0 || y === 0 || x === this.w - 1 || y === this.h - 1;
  }

  get(x: number, y: number): number {
    return this.type[this.idx(x, y)];
  }

  getTemp(x: number, y: number): number {
    return this.temp[this.idx(x, y)];
  }

  count(el: number): number {
    return this.counts[el] ?? 0;
  }

  setTemp(x: number, y: number, temp: number): void {
    if (!this.inBounds(x, y) || this.isBorder(x, y)) return;
    this.temp[this.idx(x, y)] = clampTemp(temp);
    this.wake(x, y);
  }

  setCell(x: number, y: number, el: number, opts?: SetOpts): void {
    if (!this.inBounds(x, y)) return;
    if (this.isBorder(x, y) && !opts?.force) return;
    if (el < 0 || el >= ELEMENT_COUNT) return;
    const i = this.idx(x, y);
    const prev = this.type[i];
    const origin = opts?.origin ?? 'system';
    if (origin === 'user' && el !== El.Empty) this.userPaint[el]++;
    if (prev === el && opts?.temp === undefined && opts?.aux === undefined && opts?.aux2 === undefined) {
      this.wake(x, y);
      return;
    }
    if (prev !== el) {
      this.counts[prev]--;
      this.counts[el]++;
      if (origin === 'system' && el !== El.Empty) this.generated[el]++;
    }
    this.type[i] = el;
    this.temp[i] = opts?.temp !== undefined ? clampTemp(opts.temp) : DEFAULT_TEMP[el];
    let aux = opts?.aux ?? (el === El.Fire ? TUNING.fireLife : 0);
    if (el === El.Portal && opts?.aux === undefined && prev !== El.Portal) {
      aux = this.nextPortal;
      this.nextPortal = this.nextPortal === 1 ? 2 : 1;
    }
    this.aux[i] = aux;
    this.aux2[i] = opts?.aux2 ?? 0;
    if (prev !== el) this.variation[i] = opts?.variation ?? this.rng.int(16);
    this.wake(x, y);
  }

  /** Brush entry. Pair reactions (water on lava, water on fire) resolve instead of overwriting. */
  paintUser(x: number, y: number, el: number, opts?: { aux?: number }): void {
    if (!this.inBounds(x, y) || this.isBorder(x, y)) return;
    if (el < 0 || el >= ELEMENT_COUNT) return;
    const prev = this.type[this.idx(x, y)];
    if (prev === El.Wall && el !== El.Empty) return;
    if (el !== El.Empty && prev !== El.Empty && prev !== el) {
      const pair = findPair(prev, el);
      if (pair) {
        this.userPaint[el]++;
        const selfIsA = prev === pair.a;
        const existingTo = selfIsA ? pair.aTo : pair.bTo;
        const incomingTo = selfIsA ? pair.bTo : pair.aTo;
        const existingTemp = selfIsA ? pair.aTemp : pair.bTemp;
        const incomingTemp = selfIsA ? pair.bTemp : pair.aTemp;
        this.setCell(x, y, existingTo, { temp: existingTemp, origin: 'system' });
        if (incomingTo !== El.Empty) {
          if (existingTo === El.Empty) {
            this.setCell(x, y, incomingTo, { temp: incomingTemp, origin: 'system' });
          } else {
            const spot = this.findEmptyNeighbor(x, y);
            if (spot) this.setCell(spot.x, spot.y, incomingTo, { temp: incomingTemp, origin: 'system' });
          }
        }
        return;
      }
    }
    this.setCell(x, y, el, { origin: 'user', aux: opts?.aux });
  }

  eraseAt(x: number, y: number): void {
    if (!this.inBounds(x, y) || this.isBorder(x, y)) return;
    this.setCell(x, y, El.Empty, { origin: 'user' });
    const px = x + 0.5;
    const py = y + 0.5;
    this.bodies = this.bodies.filter((b) => !pointInBody(b, px, py));
  }

  swap(x: number, y: number, nx: number, ny: number): void {
    const i = this.idx(x, y);
    const j = this.idx(nx, ny);
    this.exchange(i, j);
    this.visited[i] = 1;
    this.visited[j] = 1;
    this.wake(x, y);
    this.wake(nx, ny);
  }

  /** Move a cell into an empty destination without counting it as newly created. */
  moveCell(x: number, y: number, nx: number, ny: number): void {
    const i = this.idx(x, y);
    const j = this.idx(nx, ny);
    this.type[j] = this.type[i];
    this.temp[j] = this.temp[i];
    this.aux[j] = this.aux[i];
    this.aux2[j] = this.aux2[i];
    this.variation[j] = this.variation[i];
    this.type[i] = El.Empty;
    this.temp[i] = AMBIENT;
    this.aux[i] = 0;
    this.aux2[i] = 0;
    this.variation[i] = 0;
    this.visited[i] = 1;
    this.visited[j] = 1;
    this.wake(x, y);
    this.wake(nx, ny);
  }

  findEmptyNeighbor(x: number, y: number): { x: number; y: number } | null {
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny) || this.isBorder(nx, ny)) continue;
      if (this.type[this.idx(nx, ny)] === El.Empty) return { x: nx, y: ny };
    }
    return null;
  }

  spawnBody(kind: BodyKind, x: number, y: number): Body | null {
    if (this.bodies.length >= TUNING.maxBodies) return null;
    const preset = PRESETS[kind];
    const body: Body = {
      id: this.nextBodyId++,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      angle: 0,
      av: 0,
      hw: preset.hw,
      hh: preset.hh,
      health: preset.health,
      maxHealth: preset.health,
      grounded: false,
      asleep: false,
      sleep: 0,
      hurt: '',
    };
    if (body.x - body.hw < 1 || body.y - body.hh < 1) return null;
    if (body.x + body.hw > this.w - 1 || body.y + body.hh > this.h - 1) return null;
    if (overlapsSolid(this, body)) return null;
    for (const other of this.bodies) {
      if (bodiesOverlap(body, other)) return null;
    }
    this.bodies.push(body);
    this.wake(x | 0, y | 0);
    return body;
  }

  resetScores(): void {
    this.generated.fill(0);
    this.userPaint.fill(0);
  }

  recomputeCounts(): void {
    this.counts.fill(0);
    for (let i = 0; i < this.type.length; i++) this.counts[this.type[i]]++;
  }

  clearAll(): void {
    this.type.fill(El.Empty);
    this.temp.fill(AMBIENT);
    this.aux.fill(0);
    this.aux2.fill(0);
    this.variation.fill(0);
    this.charge.fill(0);
    this.bodies.length = 0;
    this.events.length = 0;
    this.recomputeCounts();
    this.addBorder();
    this.resetScores();
    this.wakeAll();
    this.frame = 0;
    this.plantsWatered = false;
  }

  addBorder(): void {
    for (let x = 0; x < this.w; x++) {
      this.setCell(x, 0, El.Wall, { force: true });
      this.setCell(x, this.h - 1, El.Wall, { force: true });
    }
    for (let y = 0; y < this.h; y++) {
      this.setCell(0, y, El.Wall, { force: true });
      this.setCell(this.w - 1, y, El.Wall, { force: true });
    }
  }

  wakeAll(): void {
    this.chunkTtl.fill(4);
    this.visualDirty.fill(1);
  }

  sleepAll(): void {
    this.chunkTtl.fill(0);
  }

  wake(x: number, y: number): void {
    const cx = x >> 3;
    const cy = y >> 3;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) this.wakeChunk(cx + ox, cy + oy);
    }
  }

  markVisual(x: number, y: number): void {
    const cx = x >> 3;
    const cy = y >> 3;
    if (cx < 0 || cy < 0 || cx >= this.chunkCols || cy >= this.chunkRows) return;
    this.visualDirty[cy * this.chunkCols + cx] = 1;
  }

  step(): void {
    this.frame++;
    this.events.length = 0;
    this.visited.fill(0);
    this.reacted.fill(0);
    stepElectricity(this);
    stepReactions(this);
    stepHeat(this);
    stepLife(this);
    stepMovement(this);
    stepPhysics(this);
    this.reinforce();
    for (let i = 0; i < this.chunkTtl.length; i++) {
      if (this.chunkTtl[i] > 0) this.chunkTtl[i]--;
    }
  }

  emit(kind: SimEvent['kind'], x: number, y: number): void {
    if (this.events.length >= 8) return;
    this.events.push({ kind, x, y });
  }

  /** Keep sources, growing life, and off-temperature cells awake. */
  reinforce(): void {
    const { type, temp, w } = this;
    let watered = false;
    for (let i = 0; i < type.length; i++) {
      if (type[i] !== El.Plant) continue;
      const x = i % w;
      const y = (i / w) | 0;
      if (touches(this, x, y, El.Water)) {
        watered = true;
        break;
      }
    }
    this.plantsWatered = watered;
    for (let i = 0; i < type.length; i++) {
      const t = type[i];
      if (t === El.Empty) {
        if (Math.abs(temp[i] - AMBIENT) > 6) {
          const x = i % w;
          const y = (i / w) | 0;
          this.wake(x, y);
        }
        continue;
      }
      const hot = Math.abs(temp[i] - DEFAULT_TEMP[t]) > 8;
      if (ALWAYS[t] || hot || (t === El.Plant && watered)) {
        const x = i % w;
        const y = (i / w) | 0;
        this.wake(x, y);
      }
    }
  }

  private wakeChunk(cx: number, cy: number): void {
    if (cx < 0 || cy < 0 || cx >= this.chunkCols || cy >= this.chunkRows) return;
    const i = cy * this.chunkCols + cx;
    if (this.chunkTtl[i] < 4) this.chunkTtl[i] = 4;
    this.visualDirty[i] = 1;
  }

  private exchange(i: number, j: number): void {
    let tmp = this.type[i];
    this.type[i] = this.type[j];
    this.type[j] = tmp;
    tmp = this.temp[i];
    this.temp[i] = this.temp[j];
    this.temp[j] = tmp;
    tmp = this.aux[i];
    this.aux[i] = this.aux[j];
    this.aux[j] = tmp;
    tmp = this.aux2[i];
    this.aux2[i] = this.aux2[j];
    this.aux2[j] = tmp;
    tmp = this.variation[i];
    this.variation[i] = this.variation[j];
    this.variation[j] = tmp;
  }
}

const PRESETS: Record<BodyKind, { hw: number; hh: number; health: number }> = {
  box: { hw: 2.5, hh: 2.5, health: 90 },
  ball: { hw: 2.15, hh: 2.15, health: 70 },
  plank: { hw: 6.5, hh: 0.75, health: 60 },
};

function clampTemp(t: number): number {
  const n = Math.round(t);
  if (n < -40) return -40;
  if (n > 1400) return 1400;
  return n;
}

export function touches(sim: Simulation, x: number, y: number, el: number): boolean {
  for (let k = 0; k < 4; k++) {
    const nx = x + (k === 2 ? -1 : k === 3 ? 1 : 0);
    const ny = y + (k === 0 ? -1 : k === 1 ? 1 : 0);
    if (!sim.inBounds(nx, ny)) continue;
    if (sim.type[sim.idx(nx, ny)] === el) return true;
  }
  return false;
}

function bodiesOverlap(a: Body, b: Body): boolean {
  return Math.abs(a.x - b.x) < a.hw + b.hw - 0.05 && Math.abs(a.y - b.y) < a.hh + b.hh - 0.05;
}

export function assertHealthy(sim: Simulation): void {
  let tally = 0;
  for (let i = 0; i < sim.type.length; i++) {
    const t = sim.type[i];
    if (t >= ELEMENT_COUNT) throw new Error(`bad type ${t} at ${i}`);
    tally++;
    const tp = sim.temp[i];
    if (!Number.isFinite(tp) || tp < -50 || tp > 1500) throw new Error(`bad temp ${tp} at ${i}`);
  }
  if (tally !== sim.type.length) throw new Error('length');
  let sum = 0;
  for (let i = 0; i < sim.counts.length; i++) {
    if (sim.counts[i] < 0) throw new Error(`negative count ${DEFS[i]?.name}`);
    sum += sim.counts[i];
  }
  if (sum !== sim.type.length) throw new Error(`count drift ${sum}`);
  for (const b of sim.bodies) {
    const blob = b.x + b.y + b.vx + b.vy + b.angle + b.av + b.health;
    if (!Number.isFinite(blob)) throw new Error(`bad body ${b.id}`);
  }
}
