import { El, findPair, HAS_PAIR, RULES_FOR } from './elements';
import type { Simulation } from './simulation';
import { TUNING } from './tuning';

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

/** Contact chemistry: quenching, ice, salt, rust, and the sodium flame. */
export function stepReactions(sim: Simulation): void {
  const { w, h, chunkCols, chunkRows, chunkTtl, type, reacted } = sim;

  for (let cy = 0; cy < chunkRows; cy++) {
    for (let cx = 0; cx < chunkCols; cx++) {
      if (chunkTtl[cy * chunkCols + cx] === 0) continue;
      const x0 = cx * 8;
      const y0 = cy * 8;
      const x1 = Math.min(w, x0 + 8);
      const y1 = Math.min(h, y0 + 8);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * w + x;
          if (reacted[i]) continue;
          const t = type[i];
          if (t === El.Empty) continue;
          if (HAS_PAIR[t] && tryPair(sim, x, y)) continue;
          if (RULES_FOR[t].length && tryContact(sim, x, y)) continue;
          if (t === El.Glass) soakGlass(sim, x, y);
          else if (t === El.Metal) rustMetal(sim, x, y);
          else if (t === El.Rust) crumbleRust(sim, x, y);
          else if (t === El.Fire) tintSodium(sim, x, y);
          else if (t === El.Timber) burnWood(sim, x, y);
        }
      }
    }
  }
}

function tryPair(sim: Simulation, x: number, y: number): boolean {
  const t = sim.type[sim.idx(x, y)];
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny)) continue;
    const j = sim.idx(nx, ny);
    if (sim.reacted[j]) continue;
    const nt = sim.type[j];
    const rule = findPair(t, nt);
    if (!rule) continue;
    const i = sim.idx(x, y);
    sim.reacted[i] = 1;
    sim.reacted[j] = 1;
    const selfIsA = t === rule.a;
    const selfTo = selfIsA ? rule.aTo : rule.bTo;
    const otherTo = selfIsA ? rule.bTo : rule.aTo;
    const selfTemp = selfIsA ? rule.aTemp : rule.bTemp;
    const otherTemp = selfIsA ? rule.bTemp : rule.aTemp;
    sim.setCell(x, y, selfTo, { temp: selfTemp, origin: 'system' });
    sim.setCell(nx, ny, otherTo, { temp: otherTemp, origin: 'system' });
    sim.reacted[sim.idx(x, y)] = 1;
    sim.reacted[sim.idx(nx, ny)] = 1;
    return true;
  }
  return false;
}

function tryContact(sim: Simulation, x: number, y: number): boolean {
  const i = sim.idx(x, y);
  const t = sim.type[i];
  const rules = RULES_FOR[t];
  for (const rule of rules) {
    if (!neighborIs(sim, x, y, rule.neighbor)) continue;
    sim.aux2[i]++;
    if (sim.aux2[i] >= rule.ticks) {
      sim.aux2[i] = 0;
      sim.setCell(x, y, rule.become, {
        temp: rule.setTemp,
        origin: 'system',
      });
    }
    return true;
  }
  if (sim.aux2[i] !== 0 && rules.length) sim.aux2[i] = 0;
  return false;
}

function neighborIs(sim: Simulation, x: number, y: number, neighbor: number): boolean {
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny)) continue;
    if (sim.type[sim.idx(nx, ny)] === neighbor) return true;
  }
  return false;
}

/**
 * Lava melts glass only after a long contact. Fire never does, so a dish can
 * hold a heat experiment. The counter advances every glassLavaStride steps,
 * which is far slower than ice melting in a flame, and it resets if the lava leaves.
 */
function soakGlass(sim: Simulation, x: number, y: number): void {
  const i = sim.idx(x, y);
  if (!neighborIs(sim, x, y, El.Lava)) {
    sim.aux[i] = 0;
    sim.aux2[i] = 0;
    return;
  }
  const tick = sim.aux[i] + 1;
  if (tick < TUNING.glassLavaStride) {
    sim.aux[i] = tick;
    return;
  }
  sim.aux[i] = 0;
  const soaked = Math.min(255, sim.aux2[i] + 1);
  sim.aux2[i] = soaked;
  if (soaked >= TUNING.glassLavaTicks) {
    sim.setCell(x, y, El.MoltenGlass, { temp: 1320, origin: 'system' });
  }
}

/**
 * Saltwater pits metal from the wet surface. Each cell decides from its own
 * variation whether a pit starts there, how deep it may pass, and whether it
 * may widen sideways. Nothing about the choice depends on x, y, or scan order.
 * The creep stops after rustDepth pixels, so the inside of a thick bar stays metal.
 */
function rustMetal(sim: Simulation, x: number, y: number): void {
  const depth = saltwaterDepth(sim, x, y);
  const vertical = rustAt(sim, x, y - 1) || rustAt(sim, x, y + 1);
  const horizontal = rustAt(sim, x - 1, y) || rustAt(sim, x + 1, y);
  const sideOnly = horizontal && !vertical;
  if (!rustCellAllows(sim.variation[sim.idx(x, y)], depth, vertical, sideOnly)) {
    sim.aux[sim.idx(x, y)] = 0;
    sim.aux2[sim.idx(x, y)] = 0;
    return;
  }
  const soaked = soakContact(sim, x, y, El.Saltwater, TUNING.rustStride, true);
  if (soaked >= TUNING.rustTicks) sim.setCell(x, y, El.Rust, { temp: 20, origin: 'system' });
}

function rustAt(sim: Simulation, x: number, y: number): boolean {
  if (!sim.inBounds(x, y) || sim.isBorder(x, y)) return false;
  const t = sim.type[sim.idx(x, y)];
  return t === El.Rust || t === El.RustPowder;
}

/** Distance through metal or rust to the nearest saltwater, or 0 when none is close. */
export function saltwaterDepth(sim: Simulation, x: number, y: number): number {
  const seen = new Uint8Array(sim.w * sim.h);
  const queue: Array<[number, number, number]> = [[x, y, 0]];
  seen[sim.idx(x, y)] = 1;
  let head = 0;
  while (head < queue.length) {
    const [cx, cy, dist] = queue[head++];
    if (dist >= TUNING.rustDepth) continue;
    for (let k = 0; k < 4; k++) {
      const nx = cx + DX[k];
      const ny = cy + DY[k];
      if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
      const j = sim.idx(nx, ny);
      const nt = sim.type[j];
      if (nt === El.Saltwater) return dist + 1;
      if (seen[j]) continue;
      if (nt !== El.Metal && nt !== El.Rust && nt !== El.RustPowder) continue;
      seen[j] = 1;
      queue.push([nx, ny, dist + 1]);
    }
  }
  return 0;
}

/**
 * Whether this metal cell may join a rust pit.
 * Depth 1 nucleates only some cells, so the wet face is not a solid crust.
 * Deeper cells continue only as far as their own roll allows, and a sideways
 * step is rarer than following a pit that is already above or below.
 * Coordinates are not an input, so the same variation does the same thing anywhere.
 */
export function rustCellAllows(
  variation: number,
  depth: number,
  verticalPit: boolean,
  sideOnly: boolean,
): boolean {
  if (depth < 1 || depth > TUNING.rustDepth) return false;
  const roll = variation & 15;
  if (depth === 1) return roll % 3 === 0;
  if (depth > 1 + (roll % 5)) return false;
  if (sideOnly) return (roll & 3) === 0;
  return verticalPit;
}

function crumbleRust(sim: Simulation, x: number, y: number): void {
  const soaked = soakContact(sim, x, y, El.Saltwater, TUNING.crumbleStride);
  if (soaked >= TUNING.crumbleTicks) sim.setCell(x, y, El.RustPowder, { temp: 20, origin: 'system' });
}

function soakContact(sim: Simulation, x: number, y: number, neighbor: number, stride: number, wet = false): number {
  const i = sim.idx(x, y);
  // Root pits stay damp through the metal; only the surface has to touch saltwater.
  if (!wet && !neighborIs(sim, x, y, neighbor)) {
    sim.aux[i] = 0;
    sim.aux2[i] = 0;
    return 0;
  }
  const tick = sim.aux[i] + 1;
  if (tick < stride) {
    sim.aux[i] = tick;
    return sim.aux2[i];
  }
  sim.aux[i] = 0;
  const soaked = Math.min(255, sim.aux2[i] + 1);
  sim.aux2[i] = soaked;
  return soaked;
}

/** Salt in a flame turns that flame bright yellow, then lets it fade back. */
function tintSodium(sim: Simulation, x: number, y: number): void {
  const i = sim.idx(x, y);
  if (neighborIs(sim, x, y, El.Salt)) {
    sim.variation[i] = 48;
    sim.markVisual(x, y);
    return;
  }
  if (sim.variation[i] < 16) return;
  sim.variation[i]--;
  sim.markVisual(x, y);
}

function neighborBurningWood(sim: Simulation, x: number, y: number): boolean {
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
    const j = sim.idx(nx, ny);
    if (sim.type[j] === El.Timber && sim.aux2[j] > 0) return true;
  }
  return false;
}

/** Lit wood keeps burning, spreads slowly, smokes, then becomes ash. Water puts it out. */
function burnWood(sim: Simulation, x: number, y: number): void {
  const i = sim.idx(x, y);
  if (neighborIs(sim, x, y, El.Water)) {
    if (sim.aux[i] !== 0 || sim.aux2[i] !== 0) {
      sim.aux[i] = 0;
      sim.aux2[i] = 0;
      sim.setTemp(x, y, 40);
    }
    return;
  }
  // A flame or the Warmer lights a piece immediately. Heat leaking out of a
  // piece that is already burning does not. That neighbor waits for the spread timer,
  // or a short burn would pass the flame along as fast as conduction.
  if (sim.aux2[i] === 0) {
    const flame = neighborIs(sim, x, y, El.Fire) || neighborIs(sim, x, y, El.Lava);
    const warmed = sim.getTemp(x, y) >= TUNING.woodIgnite && !neighborBurningWood(sim, x, y);
    if (!flame && !warmed) return;
    sim.aux2[i] = TUNING.woodBurnTicks;
    sim.aux[i] = 0;
    sim.setTemp(x, y, 460);
    return;
  }
  sim.setTemp(x, y, Math.max(sim.getTemp(x, y), 420));
  const up = y - 1;
  if (sim.inBounds(x, up) && !sim.isBorder(x, up) && sim.get(x, up) === El.Empty && sim.rng.next() < 0.45) {
    if (sim.rng.next() < 0.55) {
      sim.setCell(x, up, El.Smoke, { temp: 70, aux: 28 + sim.rng.int(16), origin: 'system' });
    } else {
      sim.setCell(x, up, El.Fire, { temp: 520, aux: 16 + sim.rng.int(10), origin: 'system' });
    }
  }
  const tick = sim.aux[i] + 1;
  if (tick < TUNING.woodBurnStride) {
    sim.aux[i] = tick;
    return;
  }
  sim.aux[i] = 0;
  sim.aux2[i]--;
  if (sim.aux2[i] === 0) {
    sim.setCell(x, y, El.Ash, { temp: 80, origin: 'system' });
    return;
  }
  if (sim.aux2[i] % TUNING.woodSpreadTicks !== 0) return;
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
    const j = sim.idx(nx, ny);
    if (sim.type[j] !== El.Timber || sim.aux2[j] !== 0) continue;
    sim.aux2[j] = TUNING.woodBurnTicks;
    sim.aux[j] = 0;
    sim.setTemp(nx, ny, 460);
    sim.wake(nx, ny);
    return;
  }
}
