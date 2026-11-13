import { ACID_RESIST, El, findPair, HAS_PAIR, RULES_FOR } from './elements';
import type { Simulation } from './simulation';

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

/** Foam pixels placed this step, so one pour erupts instead of filling the map. */
let foamBudget = 0;

/**
 * Contact chemistry: neutralization, quenching, ice, acid on metal,
 * and peroxide breaking into gas or foam.
 */
export function stepReactions(sim: Simulation): void {
  foamBudget = 40;
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
          if (t === El.Acid) doAcid(sim, x, y);
          else if (t === El.Peroxide) doPeroxide(sim, x, y);
          else if (t === El.Oxygen) trapOxygen(sim, x, y);
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
    if (selfTo === El.Salt || otherTo === El.Salt) sim.emit('splash', x, y);
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

/** Acid eats metal and leaves hydrogen. Stone, walls, and the other reagents stay. */
function doAcid(sim: Simulation, x: number, y: number): void {
  const i = sim.idx(x, y);
  let tx = -1;
  let ty = -1;
  let resist = 0;
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
    const nt = sim.type[sim.idx(nx, ny)];
    if (nt !== El.Metal) continue;
    const r = ACID_RESIST[nt];
    if (r > 0 && (tx < 0 || r < resist)) {
      tx = nx;
      ty = ny;
      resist = r;
    }
  }
  if (tx < 0) {
    sim.aux[i] = 0;
    return;
  }
  sim.aux[i]++;
  if (sim.aux[i] < resist) return;
  sim.aux[i] = 0;
  sim.setCell(tx, ty, El.Hydrogen, { temp: 32, aux: 48, origin: 'system' });
  sim.setTemp(x, y, Math.min(72, sim.getTemp(x, y) + 14));
  sim.emit('splash', tx, ty);
}

/**
 * Peroxide slowly becomes water and oxygen.
 * A crystal of iodide wakes the whole connected pool, which then goes much faster.
 * Soap on or beside that liquid traps the gas as a foam column.
 */
function doPeroxide(sim: Simulation, x: number, y: number): void {
  const i = sim.idx(x, y);
  if (sim.aux2[i] === 0 && (neighborIs(sim, x, y, El.Iodide) || neighborCatalyzed(sim, x, y))) {
    catalyzePool(sim, x, y);
  }
  const fast = sim.aux2[i] > 0;
  const chance = fast ? 0.72 : 0.02;
  if (sim.rng.next() > chance) return;
  const soapy = soapyAt(sim, x, y);
  sim.setCell(x, y, El.Water, { temp: fast ? 36 : 24, origin: 'system' });
  sim.reacted[sim.idx(x, y)] = 1;
  vent(sim, x, y, fast, soapy);
}

function neighborCatalyzed(sim: Simulation, x: number, y: number): boolean {
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny)) continue;
    const j = sim.idx(nx, ny);
    if (sim.type[j] === El.Peroxide && sim.aux2[j] > 0) return true;
  }
  return false;
}

/** Mark every peroxide cell connected to this one, so one crystal sets off the cup. */
function catalyzePool(sim: Simulation, x: number, y: number): void {
  const stack: Array<[number, number]> = [[x, y]];
  const seen = new Set<number>([sim.idx(x, y)]);
  let n = 0;
  while (stack.length > 0 && n < 120) {
    const [cx, cy] = stack.pop()!;
    const i = sim.idx(cx, cy);
    if (sim.type[i] !== El.Peroxide) continue;
    sim.aux2[i] = 12;
    sim.wake(cx, cy);
    n++;
    for (let k = 0; k < 4; k++) {
      const nx = cx + DX[k];
      const ny = cy + DY[k];
      if (!sim.inBounds(nx, ny)) continue;
      const j = sim.idx(nx, ny);
      if (seen.has(j) || sim.type[j] !== El.Peroxide) continue;
      seen.add(j);
      stack.push([nx, ny]);
    }
  }
}

function soapyAt(sim: Simulation, x: number, y: number): boolean {
  if (neighborIs(sim, x, y, El.Soap) || neighborIs(sim, x, y, El.Foam)) return true;
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny)) continue;
    if (neighborIs(sim, nx, ny, El.Soap)) return true;
  }
  return false;
}

/** Oxygen that drifts into soap afterward is caught and piled on. It was already counted at birth. */
function trapOxygen(sim: Simulation, x: number, y: number): void {
  if (!neighborIs(sim, x, y, El.Soap) && !neighborIs(sim, x, y, El.Foam)) return;
  const fast = sim.aux2[sim.idx(x, y)] === 2;
  sim.setCell(x, y, El.Foam, { temp: 28, aux: fast ? 200 : 80, origin: 'system' });
  sim.reacted[sim.idx(x, y)] = 1;
  if (fast) erupt(sim, x, y - 1, 4);
}

/**
 * Send the new gas to the surface of the liquid.
 * Soap turns it into foam on the way up. Without soap it stays a free gas.
 */
function vent(sim: Simulation, x: number, y: number, fast: boolean, soapy: boolean): void {
  let cx = x;
  let cy = y;
  for (let n = 0; n < 28; n++) {
    const up = cy - 1;
    if (!sim.inBounds(cx, up) || sim.isBorder(cx, up)) break;
    const t = sim.get(cx, up);
    if (t === El.Soap || t === El.Foam) soapy = true;
    if (t === El.Empty || t === El.Oxygen || t === El.Hydrogen || t === El.Steam || t === El.Smoke) {
      if (soapy) releaseFoam(sim, cx, up, fast);
      else placeGas(sim, cx, up, fast);
      return;
    }
    if (
      t === El.Peroxide || t === El.Water || t === El.Acid || t === El.Base || t === El.Foam || t === El.Soap
    ) {
      cy = up;
      continue;
    }
    const dir = sim.rng.next() < 0.5 ? -1 : 1;
    if (sim.inBounds(cx + dir, cy) && !sim.isBorder(cx + dir, cy) && sim.get(cx + dir, cy) === El.Empty) {
      cx += dir;
      continue;
    }
    break;
  }
  const spot = sim.findEmptyNeighbor(x, y);
  if (!spot) return;
  if (soapy) releaseFoam(sim, spot.x, spot.y, fast);
  else placeGas(sim, spot.x, spot.y, fast);
}

function releaseFoam(sim: Simulation, x: number, y: number, fast: boolean): void {
  const placed = erupt(sim, x, y, fast ? 6 : 1);
  if (placed <= 0) return;
  if (fast) sim.gasFast++;
  else sim.gasSlow++;
}

function placeGas(sim: Simulation, x: number, y: number, fast: boolean): void {
  sim.setCell(x, y, El.Oxygen, { temp: 30, aux: 42, aux2: fast ? 2 : 1, origin: 'system' });
  sim.reacted[sim.idx(x, y)] = 1;
  if (fast) sim.gasFast++;
  else sim.gasSlow++;
}

/** Stack foam upward from this cell so the column climbs instead of sinking. */
function erupt(sim: Simulation, x: number, y: number, count: number): number {
  let cx = x;
  let cy = y;
  let placed = 0;
  let guard = 0;
  while (placed < count && foamBudget > 0 && guard < 48) {
    guard++;
    if (!sim.inBounds(cx, cy) || sim.isBorder(cx, cy)) break;
    const top = climbFoam(sim, cx, cy);
    cx = top.x;
    cy = top.y;
    const up = cy - 1;
    const spot = foamSpot(sim, cx, up) ?? (placed === 0 ? foamSpot(sim, cx, cy) : null);
    if (!spot) break;
    sim.setCell(spot.x, spot.y, El.Foam, { temp: 28, aux: 200, origin: 'system' });
    sim.reacted[sim.idx(spot.x, spot.y)] = 1;
    foamBudget--;
    placed++;
    cx = spot.x;
    cy = spot.y;
    if (placed % 3 === 0) cx += sim.rng.next() < 0.5 ? -1 : 1;
  }
  if (placed > 1) sim.emit('splash', x, y);
  return placed;
}

function climbFoam(sim: Simulation, x: number, y: number): { x: number; y: number } {
  let cx = x;
  let cy = y;
  for (let n = 0; n < 80; n++) {
    const up = cy - 1;
    if (!sim.inBounds(cx, up) || sim.isBorder(cx, up)) break;
    if (sim.get(cx, up) !== El.Foam) break;
    cy = up;
  }
  return { x: cx, y: cy };
}

function foamSpot(sim: Simulation, x: number, y: number): { x: number; y: number } | null {
  const options = [x, x - 1, x + 1];
  for (const cx of options) {
    if (!sim.inBounds(cx, y) || sim.isBorder(cx, y)) continue;
    const t = sim.get(cx, y);
    if (t === El.Empty || t === El.Oxygen || t === El.Hydrogen || t === El.Steam || t === El.Smoke) {
      return { x: cx, y };
    }
  }
  return null;
}
