import { El, IS_SOLID } from './elements';
import type { Simulation } from './simulation';
import { TUNING } from './tuning';

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

/** Seeds, plants, and bugs. A full scan keeps life correct even in quiet chunks. */
export function stepLife(sim: Simulation): void {
  const { w, h, type } = sim;
  let watered = false;
  for (let i = 0; i < type.length; i++) {
    if (type[i] !== El.Plant) continue;
    const x = i % w;
    const y = (i / w) | 0;
    if (touches(sim, x, y, El.Water)) {
      watered = true;
      break;
    }
  }
  sim.plantsWatered = watered;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const t = type[y * w + x];
      if (t === El.Seed) growSeed(sim, x, y);
      else if (t === El.Plant) growPlant(sim, x, y);
      else if (t === El.Bug) moveBug(sim, x, y);
    }
  }
}

function growSeed(sim: Simulation, x: number, y: number): void {
  const below = sim.get(x, y + 1);
  const supported = IS_SOLID[below] === 1 || below === El.Seed || below === El.Plant;
  const i = sim.idx(x, y);
  if (!supported || findDrink(sim, x, y) === null) {
    if (!supported) sim.aux[i] = 0;
    return;
  }
  sim.aux[i]++;
  if (sim.aux[i] < TUNING.seedTicks) return;
  const drink = findDrink(sim, x, y);
  if (drink === null) return;
  const wx = drink % sim.w;
  const wy = (drink / sim.w) | 0;
  sim.setCell(wx, wy, El.Empty, { origin: 'system' });
  sim.setCell(x, y, El.Plant, { origin: 'system', aux: TUNING.seedBudget - 1 });
}

function growPlant(sim: Simulation, x: number, y: number): void {
  const i = sim.idx(x, y);
  const budget = sim.aux[i];
  if (budget === 0) return;
  if ((sim.frame + x * 3 + y) % TUNING.plantGrowTicks !== 0) return;
  let nx = x;
  let ny = y - 1;
  if (sim.isBorder(nx, ny) || sim.get(nx, ny) !== El.Empty) {
    const dx = ((x + sim.frame) & 1) === 0 ? -1 : 1;
    nx = x + dx;
    ny = y;
    if (sim.isBorder(nx, ny) || sim.get(nx, ny) !== El.Empty) return;
    const under = sim.get(nx, y + 1);
    if (IS_SOLID[under] !== 1 && under !== El.Plant) return;
  }
  const drink = findDrink(sim, x, y);
  if (drink === null) return;
  const wx = drink % sim.w;
  const wy = (drink / sim.w) | 0;
  sim.aux[i] = 0;
  sim.setCell(wx, wy, El.Empty, { origin: 'system' });
  sim.setCell(nx, ny, El.Plant, { origin: 'system', aux: budget - 1 });
}

/** Water touching this seed or plant, or connected through the vine and the pool. */
function findDrink(sim: Simulation, x: number, y: number): number | null {
  const start = sim.idx(x, y);
  const queue = [start];
  const seen = new Set<number>([start]);
  let head = 0;
  while (head < queue.length && seen.size < 200) {
    const i = queue[head++];
    const cx = i % sim.w;
    const cy = (i / sim.w) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = cx + DX[k];
      const ny = cy + DY[k];
      if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
      const j = sim.idx(nx, ny);
      if (seen.has(j)) continue;
      const t = sim.type[j];
      if (t === El.Water) return j;
      if (t !== El.Plant && t !== El.Seed) continue;
      seen.add(j);
      queue.push(j);
    }
  }
  return null;
}

function moveBug(sim: Simulation, x: number, y: number): void {
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny)) continue;
    const nt = sim.get(nx, ny);
    if (nt === El.Fire || nt === El.Acid || nt === El.Lava) {
      sim.setCell(x, y, El.Empty, { origin: 'system' });
      return;
    }
  }
  const i = sim.idx(x, y);
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
    if (sim.get(nx, ny) !== El.Plant) continue;
    sim.aux[i]++;
    if (sim.aux[i] >= TUNING.bugEatTicks) {
      sim.aux[i] = 0;
      sim.setCell(nx, ny, El.Empty, { origin: 'system' });
    }
    return;
  }
  const by = y + 1;
  if (!sim.isBorder(x, by) && sim.visited[i] === 0) {
    const below = sim.get(x, by);
    if (
      below === El.Empty ||
      below === El.Water ||
      below === El.Oil ||
      below === El.Steam ||
      below === El.Fire
    ) {
      sim.swap(x, y, x, by);
      return;
    }
  }
  sim.aux[i]++;
  if (sim.aux[i] < TUNING.bugCrawlTicks) return;
  sim.aux[i] = 0;
  let bestX = 0;
  let bestY = 0;
  let best = -1;
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
    if (sim.get(nx, ny) !== El.Empty) continue;
    const score = touches(sim, nx, ny, El.Plant) ? 2 : 1;
    if (score > best) {
      best = score;
      bestX = nx;
      bestY = ny;
    }
  }
  if (best > 0 && sim.visited[i] === 0) sim.swap(x, y, bestX, bestY);
}

function touches(sim: Simulation, x: number, y: number, el: number): boolean {
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny)) continue;
    if (sim.type[sim.idx(nx, ny)] === el) return true;
  }
  return false;
}
