import { ACID_RESIST, DENSITY, El, findPair, FLAMMABLE, IS_GAS, IS_LIQUID, MOVABLE } from './elements';
import { stampBodies } from './physics';
import type { Simulation } from './simulation';

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

/** Powders fall, liquids flow, gases rise and drift, foam holds its column. */
export function stepMovement(sim: Simulation): void {
  stampBodies(sim);
  let minY = sim.h;
  let maxY = -1;
  for (let cy = 0; cy < sim.chunkRows; cy++) {
    const base = cy * sim.chunkCols;
    for (let cx = 0; cx < sim.chunkCols; cx++) {
      if (sim.chunkTtl[base + cx] === 0) continue;
      const y0 = cy * 8;
      if (y0 < minY) minY = y0;
      const y1 = Math.min(sim.h - 1, y0 + 7);
      if (y1 > maxY) maxY = y1;
    }
  }
  if (maxY < 0) return;
  const leftFirst = (sim.frame & 1) === 0;
  for (let y = maxY; y >= minY; y--) {
    if (leftFirst) {
      for (let x = 1; x < sim.w - 1; x++) moveCell(sim, x, y);
    } else {
      for (let x = sim.w - 2; x >= 1; x--) moveCell(sim, x, y);
    }
  }
}

function moveCell(sim: Simulation, x: number, y: number): void {
  const cx = x >> 3;
  const cy = y >> 3;
  if (sim.chunkTtl[cy * sim.chunkCols + cx] === 0) return;
  const i = sim.idx(x, y);
  if (sim.visited[i]) return;
  const t = sim.type[i];
  if (!MOVABLE[t]) return;
  if (t === El.Fire) {
    moveFire(sim, x, y);
    return;
  }
  if (t === El.Smoke) {
    moveSmoke(sim, x, y);
    return;
  }
  if (t === El.Foam) {
    moveFoam(sim, x, y);
    return;
  }
  if (t === El.Oxygen || t === El.Hydrogen) {
    moveFadingGas(sim, x, y);
    return;
  }
  if (IS_GAS[t]) {
    moveGas(sim, x, y);
    return;
  }
  if (shove(sim, x, y)) return;
  moveFall(sim, x, y, t);
}

function shove(sim: Simulation, x: number, y: number): boolean {
  const i = sim.idx(x, y);
  let ix = sim.impulseX[i];
  let iy = sim.impulseY[i];
  if (ix === 0 && iy === 0) return false;
  if (ix > 0) sim.impulseX[i] = ix - 1;
  else if (ix < 0) sim.impulseX[i] = ix + 1;
  if (iy > 0) sim.impulseY[i] = iy - 1;
  else if (iy < 0) sim.impulseY[i] = iy + 1;
  ix = Math.sign(ix);
  iy = Math.sign(iy);
  const density = DENSITY[sim.type[i]];
  if (iy !== 0 && tryEnter(sim, x, y, x, y + iy, density, iy < 0)) return true;
  if (ix !== 0 && tryEnter(sim, x, y, x + ix, y, density, false)) return true;
  if (ix !== 0 && iy !== 0 && tryEnter(sim, x, y, x + ix, y + iy, density, iy < 0)) return true;
  return false;
}

function moveFall(sim: Simulation, x: number, y: number, t: number): void {
  if (shouldCling(sim, x, y, t)) return;
  const density = DENSITY[t];
  const liquid = IS_LIQUID[t] === 1;
  // Diagonal bias flips every frame. Horizontal flow commits for a few
  // frames so a puddle crawls instead of vibrating in place.
  const diag = (sim.frame & 1) === 0 ? [-1, 1] : [1, -1];
  const side = ((sim.frame >> 3) & 1) === 0 ? [-1, 1] : [1, -1];
  if (tryEnter(sim, x, y, x, y + 1, density, false)) return;
  for (const dx of diag) {
    if (tryEnter(sim, x, y, x + dx, y + 1, density, false)) return;
  }
  if (!liquid) return;
  for (const dx of side) {
    if (tryEnter(sim, x, y, x + dx, y, density, false)) return;
  }
}

function shouldCling(sim: Simulation, x: number, y: number, t: number): boolean {
  if (t === El.Acid) {
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
      if (ACID_RESIST[sim.type[sim.idx(nx, ny)]] > 0) return true;
    }
  }
  return false;
}

function moveFoam(sim: Simulation, x: number, y: number): void {
  const i = sim.idx(x, y);
  if (sim.aux[i] <= 1) {
    sim.setCell(x, y, El.Empty, { origin: 'system' });
    return;
  }
  sim.aux[i]--;
  // Stay piled. A little sideways drift keeps the head soft without shooting it to the ceiling.
  if (sim.rng.next() > 0.12) return;
  const dx = sim.rng.next() < 0.5 ? -1 : 1;
  tryEmpty(sim, x, y, x + dx, y);
}

function moveFadingGas(sim: Simulation, x: number, y: number): void {
  const i = sim.idx(x, y);
  if (sim.aux[i] <= 1) {
    sim.setCell(x, y, El.Empty, { origin: 'system' });
    return;
  }
  sim.aux[i]--;
  const drift = Math.sign(sim.impulseX[i]) || (sim.rng.next() < 0.65 ? sim.rng.int(3) - 1 : 0);
  decayImpulse(sim, i);
  if (drift !== 0 && sim.rng.next() < 0.55 && tryEmpty(sim, x, y, x + drift, y - 1)) return;
  if (tryEmpty(sim, x, y, x, y - 1)) return;
  if (drift !== 0) tryEmpty(sim, x, y, x + drift, y);
}

function moveGas(sim: Simulation, x: number, y: number): void {
  const density = DENSITY[sim.get(x, y)];
  const side = (sim.frame & 1) === 0 ? [-1, 1] : [1, -1];
  if (tryEnter(sim, x, y, x, y - 1, density, true)) return;
  for (const dx of side) {
    if (tryEnter(sim, x, y, x + dx, y - 1, density, true)) return;
  }
  for (const dx of side) {
    if (tryEmpty(sim, x, y, x + dx, y)) return;
  }
}

function moveFire(sim: Simulation, x: number, y: number): void {
  const i = sim.idx(x, y);
  const poof = sim.aux2[i] > 0;
  if (!poof && clinging(sim, x, y)) {
    if (sim.aux[i] < 24) sim.aux[i] = 24;
    const up = y - 1;
    if (sim.rng.next() < 0.3 && sim.inBounds(x, up) && !sim.isBorder(x, up) && sim.get(x, up) === El.Empty) {
      sim.setCell(x, up, El.Fire, { temp: 500, aux: 5 + sim.rng.int(6), origin: 'system' });
    }
    return;
  }
  sim.aux[i]--;
  if (sim.aux[i] <= 0) {
    if (sim.rng.next() < 0.8) {
      sim.setCell(x, y, El.Smoke, { temp: 70 + sim.rng.int(40), aux: 10 + sim.rng.int(22), origin: 'system' });
      sim.addImpulse(x, y, sim.rng.int(3) - 1, -1);
    } else {
      sim.setCell(x, y, El.Empty, { origin: 'system' });
    }
    return;
  }
  if (poof && sim.aux2[i] > 0) sim.aux2[i]--;
  const ix = Math.sign(sim.impulseX[i]) || (sim.rng.next() < 0.55 ? (sim.rng.next() < 0.5 ? -1 : 1) : 0);
  const iy = poof ? Math.sign(sim.impulseY[i]) || -1 : -1;
  decayImpulse(sim, i);
  if (ix !== 0 && sim.rng.next() < (poof ? 0.85 : 0.6) && tryEmpty(sim, x, y, x + ix, y + iy)) return;
  if (tryEmpty(sim, x, y, x, y + iy)) return;
  if (ix !== 0 && tryEmpty(sim, x, y, x + ix, y)) return;
  sim.aux[i] = Math.max(0, sim.aux[i] - 1);
}

function moveSmoke(sim: Simulation, x: number, y: number): void {
  const i = sim.idx(x, y);
  if (sim.aux[i] <= 1) {
    sim.setCell(x, y, El.Empty, { origin: 'system' });
    return;
  }
  sim.aux[i]--;
  const drift = Math.sign(sim.impulseX[i]) || sim.rng.int(3) - 1;
  const rise = sim.rng.next() < 0.7 ? -1 : 0;
  decayImpulse(sim, i);
  if (sim.aux[i] > 12 && sim.rng.next() < 0.18) {
    const sx = x + (sim.rng.next() < 0.5 ? -1 : 1);
    const sy = y - 1;
    if (sim.inBounds(sx, sy) && !sim.isBorder(sx, sy) && sim.get(sx, sy) === El.Empty) {
      sim.setCell(sx, sy, El.Smoke, { temp: 50, aux: 6 + sim.rng.int(8), origin: 'system' });
    }
  }
  if (drift !== 0 && tryEmpty(sim, x, y, x + drift, y + rise)) return;
  if (rise !== 0 && tryEmpty(sim, x, y, x, y + rise)) return;
  if (drift !== 0) tryEmpty(sim, x, y, x + drift, y);
}

function clinging(sim: Simulation, x: number, y: number): boolean {
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny)) continue;
    if (FLAMMABLE[sim.type[sim.idx(nx, ny)]]) return true;
  }
  return false;
}

function decayImpulse(sim: Simulation, i: number): void {
  if (sim.impulseX[i] > 0) sim.impulseX[i]--;
  else if (sim.impulseX[i] < 0) sim.impulseX[i]++;
  if (sim.impulseY[i] > 0) sim.impulseY[i]--;
  else if (sim.impulseY[i] < 0) sim.impulseY[i]++;
}

function tryEmpty(sim: Simulation, x: number, y: number, nx: number, ny: number): boolean {
  if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) return false;
  if (sim.bodyBlock[sim.idx(nx, ny)]) return false;
  if (sim.type[sim.idx(nx, ny)] !== El.Empty) return false;
  sim.swap(x, y, nx, ny);
  return true;
}

function tryEnter(
  sim: Simulation,
  x: number,
  y: number,
  nx: number,
  ny: number,
  density: number,
  rising: boolean,
): boolean {
  if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) return false;
  if (quench(sim, x, y, nx, ny)) return true;
  const dest = sim.idx(nx, ny);
  if (sim.bodyBlock[dest]) return false;
  const dt = sim.type[dest];
  if (dt === El.Empty) {
    sim.swap(x, y, nx, ny);
    return true;
  }
  if (!MOVABLE[dt]) return false;
  if (rising ? DENSITY[dt] > density : DENSITY[dt] < density) {
    sim.swap(x, y, nx, ny);
    return true;
  }
  return false;
}

/** Lava or molten metal meeting water hardens in that step, with steam, instead of sinking through. */
function quench(sim: Simulation, x: number, y: number, nx: number, ny: number): boolean {
  const a = sim.get(x, y);
  const b = sim.get(nx, ny);
  const water = a === El.Water || b === El.Water;
  const hot = a === El.Lava || b === El.Lava || a === El.Molten || b === El.Molten;
  if (!water || !hot) return false;
  const rule = findPair(a, b);
  if (!rule) return false;
  const selfIsA = a === rule.a;
  sim.setCell(x, y, selfIsA ? rule.aTo : rule.bTo, { temp: selfIsA ? rule.aTemp : rule.bTemp, origin: 'system' });
  sim.setCell(nx, ny, selfIsA ? rule.bTo : rule.aTo, { temp: selfIsA ? rule.bTemp : rule.aTemp, origin: 'system' });
  sim.visited[sim.idx(x, y)] = 1;
  sim.visited[sim.idx(nx, ny)] = 1;
  return true;
}

