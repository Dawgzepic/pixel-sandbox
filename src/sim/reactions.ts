import { ACID_RESIST, El, findPair, HAS_PAIR, RULES_FOR } from './elements';
import type { Simulation } from './simulation';
import { TUNING } from './tuning';

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

/** Contact chemistry: neutralization, quenching, ice, and acid on metal. */
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
          if (t === El.Acid) doAcid(sim, x, y);
          else if (t === El.Glass) soakGlass(sim, x, y);
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

/** Acid eats metal and leaves hydrogen. Glass, stone, and walls stay. */
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
