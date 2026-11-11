import {
  ACID_RESIST,
  CHARGE,
  El,
  findPair,
  FLAMMABLE,
  HAS_PAIR,
  RULES_FOR,
  VOID_IMMUNE,
} from './elements';
import type { Simulation } from './simulation';
import { TUNING } from './tuning';

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

/** Chemical contact: pairs, burning, acid, void, and clone. Explosions flush after the scan. */
export function stepReactions(sim: Simulation): void {
  const boom: number[] = [];
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
          if (RULES_FOR[t].length && tryContact(sim, x, y, boom)) continue;
          if (t === El.Acid) doAcid(sim, x, y);
          else if (t === El.Void) doVoid(sim, x, y);
          else if (t === El.Clone) doClone(sim, x, y);
        }
      }
    }
  }

  const limit = Math.min(boom.length, TUNING.maxExplosions);
  for (let n = 0; n < limit; n++) {
    const i = boom[n];
    explode(sim, i % w, (i / w) | 0);
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

function tryContact(sim: Simulation, x: number, y: number, boom: number[]): boolean {
  const i = sim.idx(x, y);
  const t = sim.type[i];
  const rules = RULES_FOR[t];
  for (const rule of rules) {
    if (!neighborMatches(sim, x, y, rule.neighbor)) continue;
    sim.aux2[i]++;
    if (sim.aux2[i] >= rule.ticks) {
      sim.aux2[i] = 0;
      if (rule.explode) {
        if (boom.length < TUNING.maxExplosions * 2) boom.push(i);
      } else {
        sim.setCell(x, y, rule.become, {
          temp: rule.setTemp,
          origin: 'system',
        });
      }
    }
    return true;
  }
  if (sim.aux2[i] !== 0 && rules.length) sim.aux2[i] = 0;
  return false;
}

function neighborMatches(sim: Simulation, x: number, y: number, neighbor: number): boolean {
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny)) continue;
    const j = sim.idx(nx, ny);
    if (neighbor === CHARGE) {
      if (sim.charge[j] > 0 || sim.type[j] === El.Battery) return true;
    } else if (sim.type[j] === neighbor) return true;
  }
  return false;
}

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
    const r = ACID_RESIST[nt];
    // Eat the softest neighbor so acid clears sand before it chews the box.
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
  sim.setCell(tx, ty, El.Empty, { origin: 'system' });
}

function doVoid(sim: Simulation, x: number, y: number): void {
  // Prefer eating whatever is falling in from above, then the sides.
  const order = [1, 2, 3, 0];
  for (const k of order) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
    const nt = sim.type[sim.idx(nx, ny)];
    if (nt === El.Empty || VOID_IMMUNE[nt]) continue;
    sim.setCell(nx, ny, El.Empty, { origin: 'system' });
    return;
  }
}

const COPY_BLOCK = new Set<number>([El.Empty, El.Wall, El.Void, El.Clone, El.Portal]);

function doClone(sim: Simulation, x: number, y: number): void {
  for (let k = 0; k < 4; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    const ox = x - DX[k];
    const oy = y - DY[k];
    if (!sim.inBounds(nx, ny) || !sim.inBounds(ox, oy)) continue;
    if (sim.isBorder(ox, oy)) continue;
    const nt = sim.type[sim.idx(nx, ny)];
    if (COPY_BLOCK.has(nt)) continue;
    if (sim.type[sim.idx(ox, oy)] !== El.Empty) continue;
    const src = sim.idx(nx, ny);
    sim.setCell(ox, oy, nt, {
      temp: sim.temp[src],
      variation: sim.variation[src],
      origin: 'system',
    });
    sim.visited[sim.idx(ox, oy)] = 1;
    return;
  }
}

function explode(sim: Simulation, x: number, y: number): void {
  sim.emit('explode', x, y);
  const r = TUNING.explodeRadius;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (!sim.inBounds(nx, ny) || sim.isBorder(nx, ny)) continue;
      const t = sim.get(nx, ny);
      if (t === El.Wall || t === El.Void) continue;
      if (t === El.Water && d2 <= 8) {
        sim.setCell(nx, ny, El.Steam, { temp: 140, origin: 'system' });
        continue;
      }
      if (t === El.Stone || t === El.Metal || t === El.Ice || t === El.Battery || t === El.Bulb || t === El.Portal || t === El.Clone) {
        sim.setTemp(nx, ny, Math.min(1400, sim.getTemp(nx, ny) + 160));
        continue;
      }
      if (t === El.Empty && d2 > 5) continue;
      if (t === El.Acid) continue;
      const life = Math.max(24, TUNING.fireLife - d2 * 3);
      if (t === El.Empty || FLAMMABLE[t] || t === El.Fire || t === El.Bug || t === El.Sand || t === El.Gunpowder) {
        sim.setCell(nx, ny, El.Fire, { temp: 560, aux: life, origin: 'system' });
      }
    }
  }
  for (const b of sim.bodies) {
    const dx = b.x - (x + 0.5);
    const dy = b.y - (y + 0.5);
    const dist = Math.hypot(dx, dy);
    if (dist >= 8) continue;
    const force = (1 - dist / 8) * 2.4;
    const inv = dist < 0.001 ? 0 : 1 / dist;
    b.vx = clamp(b.vx + dx * inv * force, -0.9, 0.9);
    b.vy = clamp(b.vy + dy * inv * force, -0.9, 0.9);
    b.health -= force * 16;
    b.asleep = false;
    b.hurt = 'fire';
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}
