import { ACID_RESIST, DENSITY, El, FLAMMABLE, IS_GAS, IS_LIQUID, MOVABLE } from './elements';
import { stampBodies } from './physics';
import type { Simulation } from './simulation';

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

/** Powders fall, liquids flow, steam rises, fire climbs off fuel, portals teleport. */
export function stepMovement(sim: Simulation): void {
  stampBodies(sim);
  collectPortals(sim);
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
  if (IS_GAS[t]) {
    moveGas(sim, x, y);
    return;
  }
  moveFall(sim, x, y, t);
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
  if (FLAMMABLE[t]) {
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (!sim.inBounds(nx, ny)) continue;
      const nt = sim.type[sim.idx(nx, ny)];
      if (nt === El.Fire || nt === El.Lava) return true;
    }
  }
  return false;
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
  let cling = false;
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny)) continue;
    if (FLAMMABLE[sim.type[sim.idx(nx, ny)]]) {
      cling = true;
      break;
    }
  }
  if (cling) {
    if (sim.aux[i] < 40) sim.aux[i] = 40;
    return;
  }
  sim.aux[i]--;
  if (sim.aux[i] <= 0) {
    sim.setCell(x, y, El.Empty, { origin: 'system' });
    return;
  }
  const up = y - 1;
  if (sim.inBounds(x, up) && !sim.isBorder(x, up) && sim.get(x, up) === El.Empty) {
    sim.swap(x, y, x, up);
  } else {
    sim.aux[i] = Math.max(0, sim.aux[i] - 1);
  }
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
  const dest = sim.idx(nx, ny);
  if (sim.bodyBlock[dest] && sim.type[dest] !== El.Portal) return false;
  const dt = sim.type[dest];
  if (dt === El.Portal) return tryTeleport(sim, x, y, nx, ny);
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

function tryTeleport(sim: Simulation, x: number, y: number, nx: number, ny: number): boolean {
  const enteredB = sim.aux[sim.idx(nx, ny)] === 2;
  const xs = enteredB ? sim.pax : sim.pbx;
  const ys = enteredB ? sim.pay : sim.pby;
  for (let p = 0; p < xs.length; p++) {
    if (xs[p] === nx && ys[p] === ny) continue;
    const spot = emptyNear(sim, xs[p], ys[p]);
    if (!spot) continue;
    sim.moveCell(x, y, spot.x, spot.y);
    return true;
  }
  return false;
}

function emptyNear(sim: Simulation, x: number, y: number): { x: number; y: number } | null {
  const dirs = [
    [0, 1], [-1, 0], [1, 0], [0, -1],
    [-1, 1], [1, 1], [-1, -1], [1, -1],
  ];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
    if (sim.bodyBlock[sim.idx(nx, ny)]) continue;
    if (sim.type[sim.idx(nx, ny)] === El.Empty) return { x: nx, y: ny };
  }
  return null;
}

function collectPortals(sim: Simulation): void {
  sim.pax.length = 0;
  sim.pay.length = 0;
  sim.pbx.length = 0;
  sim.pby.length = 0;
  if (sim.count(El.Portal) === 0) return;
  const { type, aux, w } = sim;
  for (let i = 0; i < type.length; i++) {
    if (type[i] !== El.Portal) continue;
    const x = i % w;
    const y = (i / w) | 0;
    if (aux[i] === 2) {
      sim.pbx.push(x);
      sim.pby.push(y);
    } else {
      sim.pax.push(x);
      sim.pay.push(y);
    }
  }
}
