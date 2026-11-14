import { El, HEAT_CONDUCT, PHASE_RULES } from './elements';
import type { Simulation } from './simulation';
import { AMBIENT, TUNING } from './tuning';

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

/**
 * Heat moves only between real materials, plus hot cells leaking into still air.
 * Calm air does not warm ice, so ice lasts until fire or lava reaches it.
 */
export function stepHeat(sim: Simulation): void {
  const { w, h, chunkCols, chunkRows, chunkTtl, type, temp, tempNext } = sim;
  tempNext.set(temp);

  for (let cy = 0; cy < chunkRows; cy++) {
    for (let cx = 0; cx < chunkCols; cx++) {
      if (chunkTtl[cy * chunkCols + cx] === 0) continue;
      const x0 = cx * 8;
      const y0 = cy * 8;
      const x1 = Math.min(w, x0 + 8);
      const y1 = Math.min(h, y0 + 8);
      for (let y = y0; y < y1; y++) {
        const row = y * w;
        for (let x = x0; x < x1; x++) {
          const i = row + x;
          const t = type[i];
          const tp = temp[i];
          if (t === El.Empty) {
            if (Math.abs(tp - AMBIENT) < 2) continue;
            tempNext[i] = driftAir(sim, x, y, tp);
            continue;
          }
          let sum = 0;
          let n = 0;
          for (let k = 0; k < 4; k++) {
            const nx = x + DX[k];
            const ny = y + DY[k];
            if (!sim.inBounds(nx, ny)) continue;
            const j = ny * w + nx;
            const nt = temp[j];
            const nType = type[j];
            const stillAir = nType === El.Empty && Math.abs(nt - AMBIENT) < 2;
            if (stillAir) {
              // Glass keeps its heat instead of leaking into open air, so a held flame can climb all the way to a melt.
              if (tp > 70 && t !== El.Glass) {
                sum += AMBIENT;
                n++;
              }
              continue;
            }
            sum += nt;
            n++;
          }
          if (n === 0) continue;
          const avg = sum / n;
          const delta = (avg - tp) * HEAT_CONDUCT[t] * TUNING.heatK;
          let next = tp + Math.trunc(delta);
          if (next === tp && HEAT_CONDUCT[t] > 0 && Math.abs(avg - tp) >= 6) {
            next = tp + (avg > tp ? 1 : -1);
          }
          tempNext[i] = clampTemp(next);
        }
      }
    }
  }

  temp.set(tempNext);
  inject(sim);
  coolStone(sim);
  shareThroughGlass(sim);
  phase(sim);
}

/** Hot stone and hot metal fade toward room temperature. Water next to them pulls heat out faster. Glass is left to conduction so a flame outside a dish can boil what is inside. */
function coolStone(sim: Simulation): void {
  const { w, h, chunkCols, chunkRows, chunkTtl, type, temp } = sim;
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
          if ((type[i] !== El.Stone && type[i] !== El.Metal) || temp[i] <= AMBIENT) continue;
          let loss = temp[i] > 80 ? 4 : 1;
          for (let k = 0; k < 4; k++) {
            const nx = x + DX[k];
            const ny = y + DY[k];
            if (!sim.inBounds(nx, ny)) continue;
            const nt = type[ny * w + nx];
            if (nt === El.Water || nt === El.Steam) loss += 8;
          }
          temp[i] = clampTemp(Math.max(AMBIENT, temp[i] - loss));
        }
      }
    }
  }
}

function driftAir(sim: Simulation, x: number, y: number, tp: number): number {
  let sum = tp;
  let n = 1;
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny)) continue;
    sum += sim.temp[ny * sim.w + nx];
    n++;
  }
  const avg = sum / n;
  let next = tp + Math.trunc((avg - tp) * 0.35 + (AMBIENT - tp) * 0.15);
  if (next === tp) next = tp + (tp > AMBIENT ? -1 : 1);
  return clampTemp(next);
}

function inject(sim: Simulation): void {
  const { w, h, chunkCols, chunkRows, chunkTtl, type } = sim;
  for (let cy = 0; cy < chunkRows; cy++) {
    for (let cx = 0; cx < chunkCols; cx++) {
      if (chunkTtl[cy * chunkCols + cx] === 0) continue;
      const x0 = cx * 8;
      const y0 = cy * 8;
      const x1 = Math.min(w, x0 + 8);
      const y1 = Math.min(h, y0 + 8);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const t = type[y * w + x];
          if (t === El.Fire) {
            add(sim, x, y - 1, TUNING.fireInject);
            add(sim, x, y + 1, TUNING.fireInject);
            add(sim, x - 1, y, TUNING.fireInject);
            add(sim, x + 1, y, TUNING.fireInject);
            const i = y * w + x;
            if (sim.temp[i] < 460) sim.temp[i] = 460;
          } else if (t === El.Lava || t === El.Molten || t === El.MoltenGlass) {
            add(sim, x, y - 1, TUNING.lavaInject);
            add(sim, x, y + 1, TUNING.lavaInject);
            add(sim, x - 1, y, TUNING.lavaInject);
            add(sim, x + 1, y, TUNING.lavaInject);
            // A body of lava stays hot long enough to melt glass. A lone drop still crusts.
            if (t === El.Lava && lavaNeighbors(sim, x, y) >= 2) {
              const i = y * w + x;
              if (sim.temp[i] < 900) sim.temp[i] = Math.min(900, sim.temp[i] + 24);
            }
          } else if (t === El.Ice) {
            chill(sim, x, y - 1);
            chill(sim, x, y + 1);
            chill(sim, x - 1, y);
            chill(sim, x + 1, y);
          }
        }
      }
    }
  }
}

function lavaNeighbors(sim: Simulation, x: number, y: number): number {
  let n = 0;
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny)) continue;
    if (sim.type[sim.idx(nx, ny)] === El.Lava) n++;
  }
  return n;
}

function add(sim: Simulation, x: number, y: number, delta: number): void {
  if (!sim.inBounds(x, y) || sim.isBorder(x, y)) return;
  const t = sim.type[sim.idx(x, y)];
  // Stone and metal cool lava by conduction. A direct blast would keep lava molten forever.
  // Glass is not in this list: a flame against a dish has to warm the glass, and the glass passes that heat inward.
  if (t === El.Stone || t === El.Metal) return;
  const i = sim.idx(x, y);
  sim.temp[i] = clampTemp(sim.temp[i] + delta);
  sim.wake(x, y);
}

/**
 * A glass pane should not insulate the dish. Each tick it hands part of its
 * temperature difference to the material on the other side, so a flame outside
 * can bring the liquid inside to a boil.
 */
function shareThroughGlass(sim: Simulation): void {
  const { w, h, type, temp } = sim;
  const delta = new Int32Array(temp.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const t = type[i];
      if (t !== El.Glass && t !== El.MoltenGlass) continue;
      const tp = temp[i];
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k];
        const ny = y + DY[k];
        if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
        const j = ny * w + nx;
        const nt = type[j];
        // Open air is not a heat sink. Lava is a heat source of its own: pulling a
        // third of it into the pane would turn the lava to stone in one touch.
        if (nt === El.Empty || nt === El.Glass || nt === El.MoltenGlass || nt === El.Lava) continue;
        const diff = tp - temp[j];
        let flow = Math.trunc(diff * 0.35);
        if (flow === 0 && Math.abs(diff) >= 4) flow = diff > 0 ? 1 : -1;
        if (flow === 0) continue;
        delta[i] -= flow;
        delta[j] += flow;
      }
    }
  }
  for (let i = 0; i < delta.length; i++) {
    if (delta[i] === 0) continue;
    temp[i] = clampTemp(temp[i] + delta[i]);
    const x = i % w;
    const y = (i / w) | 0;
    sim.wake(x, y);
  }
}

function chill(sim: Simulation, x: number, y: number): void {
  if (!sim.inBounds(x, y)) return;
  const i = sim.idx(x, y);
  const t = sim.type[i];
  // Still air is not a cold sink. Chilling it would just leak heat back into the ice.
  if (t !== El.Water && t !== El.Steam) return;
  if (sim.temp[i] <= 0) return;
  sim.temp[i] = clampTemp(sim.temp[i] - TUNING.iceChill);
  sim.wake(x, y);
}

function phase(sim: Simulation): void {
  const { w, h, chunkCols, chunkRows, chunkTtl, type, temp } = sim;
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
          const t = type[i];
          if (t === El.Empty || sim.isBorder(x, y)) continue;
          const tp = temp[i];
          for (const rule of PHASE_RULES) {
            if (rule.from !== t) continue;
            const hit = rule.op === '>' ? tp > rule.temp : tp < rule.temp;
            if (!hit) continue;
            sim.setCell(x, y, rule.to, {
              temp: rule.setTemp ?? tp,
              origin: 'system',
            });
            break;
          }
        }
      }
    }
  }
}

function clampTemp(t: number): number {
  if (t < -40) return -40;
  if (t > 1400) return 1400;
  return t | 0;
}
