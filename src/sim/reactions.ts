import { El, findPair, HAS_PAIR, RULES_FOR } from './elements';
import type { Simulation } from './simulation';
import { saltUnits, TUNING } from './tuning';

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
          if (isMelt(t) && tryQuench(sim, x, y)) continue;
          if (t === El.Salt) {
            if (meltIceWithSalt(sim, x, y)) continue;
            warmSalt(sim, x, y);
            dissolveSalt(sim, x, y);
            continue;
          }
          if (t === El.Ash) {
            dissolveAsh(sim, x, y);
            continue;
          }
          if (t === El.Silica) {
            warmSand(sim, x, y);
            continue;
          }
          if (t === El.RustPowder) tintMoltenGlass(sim, x, y);
          if (t === El.Saltwater) diluteSalt(sim, x, y);
          if (RULES_FOR[t].length && tryContact(sim, x, y)) continue;
          if (t === El.Glass) soakGlass(sim, x, y, El.MoltenGlass);
          else if (t === El.BrownGlass) soakGlass(sim, x, y, El.MoltenBrown);
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

function isWet(t: number): boolean {
  return t === El.Water || t === El.Saltwater || t === El.Lye;
}

function isMelt(t: number): boolean {
  return t === El.Molten || t === El.MoltenGlass || t === El.MoltenSalt || t === El.MoltenBrown;
}

function hotEnoughToMeltSalt(t: number): boolean {
  return t === El.Lava || t === El.Molten || t === El.MoltenGlass || t === El.MoltenBrown || t === El.MoltenSalt;
}

function tryQuench(sim: Simulation, x: number, y: number): boolean {
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
    if (!isWet(sim.get(nx, ny))) continue;
    quenchMolten(sim, x, y, nx, ny);
    return true;
  }
  return false;
}

/**
 * Water or saltwater flashes into one steam cell. The molten cell it touches
 * cools by the same amount as the Cooler, in place, until it solidifies.
 * Nothing is thrown. Lava is left to its own stone-and-steam rule.
 */
export function quenchMolten(sim: Simulation, x: number, y: number, nx = x, ny = y): void {
  const same = nx === x && ny === y;
  const spots: Array<[number, number]> = same ? [[x, y]] : [[x, y], [nx, ny]];
  let mx = -1;
  let my = -1;
  let wx = -1;
  let wy = -1;
  for (const [cx, cy] of spots) {
    const t = sim.get(cx, cy);
    if (isWet(t)) {
      wx = cx;
      wy = cy;
    }
    if (isMelt(t)) {
      mx = cx;
      my = cy;
    }
  }
  if (same && mx < 0 && isMelt(sim.get(x, y))) {
    mx = x;
    my = y;
  }
  if (mx >= 0) {
    sim.setTemp(mx, my, sim.getTemp(mx, my) - TUNING.coolerMolten);
    sim.reacted[sim.idx(mx, my)] = 1;
    sim.visited[sim.idx(mx, my)] = 1;
  }
  if (wx >= 0) {
    sim.setCell(wx, wy, El.Steam, { temp: 140, origin: 'system' });
    sim.reacted[sim.idx(wx, wy)] = 1;
    sim.visited[sim.idx(wx, wy)] = 1;
    return;
  }
  if (mx < 0) return;
  const spot = sim.findEmptyNeighbor(mx, my);
  if (!spot) return;
  sim.setCell(spot.x, spot.y, El.Steam, { temp: 140, origin: 'system' });
  sim.visited[sim.idx(spot.x, spot.y)] = 1;
}

/** Salt on ice becomes saltwater and the grain is used up. Nearby cells lose heat. */
function meltIceWithSalt(sim: Simulation, x: number, y: number): boolean {
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
    if (sim.get(nx, ny) !== El.Ice) continue;
    sim.setCell(nx, ny, El.Saltwater, { aux: TUNING.saltCap, temp: -8, origin: 'system' });
    sim.setCell(x, y, El.Empty, { origin: 'system' });
    for (let n = 0; n < 4; n++) {
      const cx = nx + DX[n];
      const cy = ny + DY[n];
      if (!sim.inBounds(cx, cy) || sim.isBorder(cx, cy)) continue;
      if (sim.get(cx, cy) === El.Saltwater && cx === nx && cy === ny) continue;
      sim.setTemp(cx, cy, sim.getTemp(cx, cy) - TUNING.saltIceChill);
    }
    sim.reacted[sim.idx(nx, ny)] = 1;
    return true;
  }
  return false;
}

/** Lava and other melts push salt up to its melting point. Warmer and fire do it more slowly. */
function warmSalt(sim: Simulation, x: number, y: number): void {
  if (!neighborHot(sim, x, y, hotEnoughToMeltSalt)) return;
  sim.setTemp(x, y, sim.getTemp(x, y) + TUNING.saltTouchHeat);
}

function warmSand(sim: Simulation, x: number, y: number): void {
  if (!neighborHot(sim, x, y, (t) => t === El.Lava || t === El.Molten || t === El.MoltenGlass || t === El.MoltenBrown)) return;
  sim.setTemp(x, y, sim.getTemp(x, y) + TUNING.sandTouchHeat);
}

function neighborHot(sim: Simulation, x: number, y: number, match: (t: number) => boolean): boolean {
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
    if (match(sim.get(nx, ny))) return true;
  }
  return false;
}

/** Rust powder dissolves into molten glass and leaves it brown. */
function tintMoltenGlass(sim: Simulation, x: number, y: number): void {
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
    if (sim.get(nx, ny) !== El.MoltenGlass) continue;
    const temp = sim.getTemp(nx, ny);
    sim.setCell(nx, ny, El.MoltenBrown, { temp, origin: 'system' });
    sim.setCell(x, y, El.Empty, { origin: 'system' });
    sim.reacted[sim.idx(nx, ny)] = 1;
    return;
  }
}

/** One ash grain fills three plain water cells. Saltwater is left alone. */
function dissolveAsh(sim: Simulation, x: number, y: number): void {
  const i = sim.idx(x, y);
  let left = sim.aux[i];
  if (left <= 0) left = TUNING.saltGrain;
  const spot = nearestSoluteRoom(sim, x, y, El.Lye);
  if (!spot) {
    sim.aux[i] = left;
    return;
  }
  const give = Math.min(left, spot.room);
  const have = sim.get(spot.x, spot.y) === El.Water ? 0 : saltUnits(sim.aux[sim.idx(spot.x, spot.y)]);
  const next = Math.min(TUNING.saltCap, have + give);
  if (sim.get(spot.x, spot.y) === El.Water) {
    sim.setCell(spot.x, spot.y, El.Lye, { aux: next, temp: 22, origin: 'system' });
  } else {
    sim.aux[sim.idx(spot.x, spot.y)] = next;
    sim.wake(spot.x, spot.y);
  }
  left -= give;
  if (left <= 0) sim.setCell(x, y, El.Empty, { origin: 'system' });
  else sim.aux[i] = left;
}

/** One grain is twelve units. It fills the nearest unsaturated water within three cells. */
function dissolveSalt(sim: Simulation, x: number, y: number): void {
  const i = sim.idx(x, y);
  let left = sim.aux[i];
  if (left <= 0) left = TUNING.saltGrain;
  const spot = nearestBrineRoom(sim, x, y);
  if (!spot) {
    sim.aux[i] = left;
    return;
  }
  const give = Math.min(left, spot.room);
  const have = sim.get(spot.x, spot.y) === El.Water ? 0 : saltUnits(sim.aux[sim.idx(spot.x, spot.y)]);
  const next = Math.min(TUNING.saltCap, have + give);
  if (sim.get(spot.x, spot.y) === El.Water) {
    sim.setCell(spot.x, spot.y, El.Saltwater, { aux: next, temp: 22, origin: 'system' });
  } else {
    sim.aux[sim.idx(spot.x, spot.y)] = next;
    sim.wake(spot.x, spot.y);
  }
  left -= give;
  if (left <= 0) sim.setCell(x, y, El.Empty, { origin: 'system' });
  else sim.aux[i] = left;
}

function nearestBrineRoom(sim: Simulation, x: number, y: number): { x: number; y: number; room: number } | null {
  return nearestSoluteRoom(sim, x, y, El.Saltwater);
}

function nearestSoluteRoom(
  sim: Simulation,
  x: number,
  y: number,
  solute: number,
): { x: number; y: number; room: number } | null {
  const seen = new Uint8Array(sim.w * sim.h);
  const queue: Array<[number, number, number]> = [[x, y, 0]];
  seen[sim.idx(x, y)] = 1;
  let best: { x: number; y: number; room: number; units: number; dist: number } | null = null;
  let head = 0;
  while (head < queue.length) {
    const [cx, cy, dist] = queue[head++];
    if (dist >= 3) continue;
    for (let k = 0; k < 4; k++) {
      const nx = cx + DX[k];
      const ny = cy + DY[k];
      if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
      const j = sim.idx(nx, ny);
      if (seen[j]) continue;
      const nt = sim.type[j];
      if (nt !== El.Water && nt !== solute) continue;
      seen[j] = 1;
      const units = nt === El.Water ? 0 : saltUnits(sim.aux[j]);
      const room = TUNING.saltCap - units;
      const nextDist = dist + 1;
      if (room > 0 && (!best || nextDist < best.dist || (nextDist === best.dist && units < best.units))) {
        best = { x: nx, y: ny, room, units, dist: nextDist };
      }
      if (nextDist < 3) queue.push([nx, ny, nextDist]);
    }
  }
  return best ? { x: best.x, y: best.y, room: best.room } : null;
}

/** Share one salt unit with a fresher neighbor. Fresh water turns into pale saltwater. */
function diluteSalt(sim: Simulation, x: number, y: number): void {
  if (sim.frame % TUNING.saltMixStride !== 0) return;
  const i = sim.idx(x, y);
  const units = saltUnits(sim.aux[i]);
  let bestX = -1;
  let bestY = -1;
  let bestUnits = units;
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
    const nt = sim.get(nx, ny);
    const other = nt === El.Water ? 0 : nt === El.Saltwater ? saltUnits(sim.aux[sim.idx(nx, ny)]) : -1;
    if (other < 0 || other >= bestUnits) continue;
    if (units - other < 2 && other !== 0) continue;
    bestUnits = other;
    bestX = nx;
    bestY = ny;
  }
  if (bestX < 0 || units < 1) return;
  const next = units - 1;
  if (next <= 0) sim.setCell(x, y, El.Water, { temp: sim.getTemp(x, y), origin: 'system' });
  else sim.aux[i] = next;
  if (sim.get(bestX, bestY) === El.Water) {
    sim.setCell(bestX, bestY, El.Saltwater, { aux: 1, temp: 22, origin: 'system' });
  } else {
    sim.aux[sim.idx(bestX, bestY)] = Math.min(TUNING.saltCap, bestUnits + 1);
    sim.wake(bestX, bestY);
  }
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
function soakGlass(sim: Simulation, x: number, y: number, product: number): void {
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
    sim.setCell(x, y, product, { temp: 1320, origin: 'system' });
  }
}

/**
 * Wet metal keeps rusting. Moisture is saltwater, plain water, or rust that
 * still touches either of those, including rust farther in as long as the
 * water has not gone. Dry metal stops. Each cell's own variation only changes
 * the pace, so the front stays ragged without a repeating pattern.
 */
function rustMetal(sim: Simulation, x: number, y: number): void {
  const i = sim.idx(x, y);
  const rate = moistureRate(sim, x, y);
  if (rate <= 0) {
    sim.aux[i] = 0;
    sim.aux2[i] = 0;
    return;
  }
  if (gainMoisture(sim, i, rate, sim.variation[i], TUNING.rustStride, TUNING.rustTicks)) {
    sim.setCell(x, y, El.Rust, { temp: 20, origin: 'system' });
  }
}

function crumbleRust(sim: Simulation, x: number, y: number): void {
  const i = sim.idx(x, y);
  let lx = 0;
  let ly = 0;
  let rate = 0;
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
    const nt = sim.get(nx, ny);
    const score = liquidScore(nt, sim.aux[sim.idx(nx, ny)]);
    if (score <= rate) continue;
    rate = score;
    lx = nx;
    ly = ny;
  }
  // Only liquid on the rust itself knocks it loose. Wet rust farther in stays
  // solid until the water reaches it, then the grain drops into that water.
  if (rate <= 0) {
    if (moistureRate(sim, x, y) <= 0) {
      sim.aux[i] = 0;
      sim.aux2[i] = 0;
    }
    return;
  }
  if (gainMoisture(sim, i, rate, sim.variation[i], TUNING.crumbleStride, TUNING.crumbleTicks)) {
    sim.setCell(x, y, El.RustPowder, { temp: 20, origin: 'system' });
    sim.swap(x, y, lx, ly);
  }
}

/** Steps until full-strength saltwater rusts one metal cell of the given variation. */
export function fullSaltRustSteps(variation = 0): number {
  const stride = TUNING.rustStride + (variation % 5) * 2;
  return Math.ceil(TUNING.rustTicks / TUNING.saltCap) * stride;
}

function gainMoisture(
  sim: Simulation,
  i: number,
  rate: number,
  variation: number,
  stride: number,
  goal: number,
): boolean {
  const wait = (stride + (variation % 5) * 2) * (rate === 1 ? TUNING.rustWaterSlow : 1);
  const step = sim.aux[i] + 1;
  if (step < wait) {
    sim.aux[i] = step;
    return false;
  }
  sim.aux[i] = 0;
  const gain = rate === 1 ? 1 : rate - 1;
  const points = Math.min(255, sim.aux2[i] + gain);
  sim.aux2[i] = points;
  return points >= goal;
}

let wetScore = new Uint8Array(0);
let wetFrame = -1;
let wetTypes: Uint8Array | null = null;

/** 0 dry, 1 plain water, 2–5 salt strength 1–4. Salt outranks water. */
function moistureMap(sim: Simulation): Uint8Array {
  if (wetTypes !== sim.type || wetFrame !== sim.frame || wetScore.length !== sim.type.length) {
    wetTypes = sim.type;
    wetFrame = sim.frame;
    if (wetScore.length !== sim.type.length) wetScore = new Uint8Array(sim.type.length);
    else wetScore.fill(0);
    const queue: number[] = [];
    for (let i = 0; i < sim.type.length; i++) {
      const t = sim.type[i];
      if (t !== El.Rust && t !== El.RustPowder) continue;
      const x = i % sim.w;
      const y = (i / sim.w) | 0;
      let best = 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k];
        const ny = y + DY[k];
        if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
        best = Math.max(best, liquidScore(sim.type[sim.idx(nx, ny)], sim.aux[sim.idx(nx, ny)]));
      }
      if (best <= 0) continue;
      wetScore[i] = best;
      queue.push(i);
    }
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++];
      const score = wetScore[i];
      const x = i % sim.w;
      const y = (i / sim.w) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k];
        const ny = y + DY[k];
        if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
        const j = sim.idx(nx, ny);
        const nt = sim.type[j];
        if (nt !== El.Rust && nt !== El.RustPowder) continue;
        if (wetScore[j] >= score) continue;
        wetScore[j] = score;
        queue.push(j);
      }
    }
  }
  return wetScore;
}

function liquidScore(t: number, aux: number): number {
  if (t === El.Saltwater) return saltUnits(aux) + 1;
  if (t === El.Water) return 1;
  return 0;
}

function moistureRate(sim: Simulation, x: number, y: number): number {
  const map = moistureMap(sim);
  let best = 0;
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
    const j = sim.idx(nx, ny);
    const nt = sim.type[j];
    const wet = liquidScore(nt, sim.aux[j]);
    if (wet > best) best = wet;
    if ((nt === El.Rust || nt === El.RustPowder) && map[j] > best) best = map[j];
  }
  return best;
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
  if (neighborIs(sim, x, y, El.Water) || neighborIs(sim, x, y, El.Lye)) {
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
