import { DISPLACE, El, IS_SOLID } from './elements';
import type { Simulation } from './simulation';

export type BodyKind = 'box' | 'ball' | 'plank';

export interface Body {
  id: number;
  kind: BodyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  av: number;
  hw: number;
  hh: number;
  health: number;
  maxHealth: number;
  grounded: boolean;
  asleep: boolean;
  sleep: number;
  hurt: '' | 'fire' | 'acid' | 'void';
}

interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

const GRAVITY = 0.1;
const MAX_V = 0.72;

/** Two short substeps so crates stack and nothing tunnels through a one-cell floor. */
export function stepPhysics(sim: Simulation): void {
  const bodies = sim.bodies;
  if (bodies.length === 0) {
    return;
  }
  for (let sub = 0; sub < 2; sub++) {
    for (const b of bodies) {
      if (b.health <= 0) continue;
      if (b.asleep) {
        if (!supported(sim, b)) b.asleep = false;
        else continue;
      }
      b.vy = Math.min(MAX_V, b.vy + GRAVITY);
      if (b.kind === 'box') {
        b.x += b.vx;
        resolveAabb(sim, b, 'x');
        b.y += b.vy;
        resolveAabb(sim, b, 'y');
      } else if (b.kind === 'ball') {
        b.x += b.vx;
        b.y += b.vy;
        resolveBall(sim, b);
        b.angle += b.vx / b.hw;
      } else {
        b.x += b.vx;
        b.y += b.vy;
        b.angle += b.av;
        resolvePlank(sim, b);
      }
    }
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        resolvePair(bodies[i], bodies[j]);
      }
    }
  }

  for (const b of bodies) {
    if (b.health <= 0) continue;
    b.grounded = supported(sim, b);
    if (b.grounded) {
      b.vx *= 0.62;
      b.av *= 0.5;
      if (Math.abs(b.vy) < 0.1) b.vy = 0;
      if (Math.abs(b.vx) < 0.02 && Math.abs(b.vy) < 0.02 && Math.abs(b.av) < 0.02) {
        b.sleep++;
        if (b.sleep > 8) {
          b.asleep = true;
          b.vx = 0;
          b.vy = 0;
          b.av = 0;
        }
      } else b.sleep = 0;
    } else {
      b.vx *= 0.995;
      b.sleep = 0;
    }
    contain(sim, b);
  }

  displaceAll(sim);
  damageAll(sim);
  reap(sim);
}

export function pointInBody(b: Body, px: number, py: number): boolean {
  if (b.kind === 'ball') {
    const dx = px - b.x;
    const dy = py - b.y;
    return dx * dx + dy * dy <= b.hw * b.hw;
  }
  if (b.kind === 'plank') return distToSegment(px, py, b) <= b.hh + 0.05;
  return px >= b.x - b.hw && px <= b.x + b.hw && py >= b.y - b.hh && py <= b.y + b.hh;
}

/** Mark cells a body is covering so sand and liquids do not flow back into it. */
export function stampBodies(sim: Simulation): void {
  sim.bodyBlock.fill(0);
  for (const b of sim.bodies) {
    if (b.health <= 0) continue;
    const box = aabbOf(b);
    const x0 = Math.max(1, Math.floor(box.l));
    const x1 = Math.min(sim.w - 2, Math.floor(box.r));
    const y0 = Math.max(1, Math.floor(box.t));
    const y1 = Math.min(sim.h - 2, Math.floor(box.b));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (cellInside(b, x, y)) sim.bodyBlock[sim.idx(x, y)] = 1;
      }
    }
  }
}

export function overlapsSolid(sim: Simulation, b: Body): boolean {
  const box = aabbOf(b);
  const x0 = Math.max(0, Math.floor(box.l));
  const x1 = Math.min(sim.w - 1, Math.floor(box.r));
  const y0 = Math.max(0, Math.floor(box.t));
  const y1 = Math.min(sim.h - 1, Math.floor(box.b));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!solid(sim, x, y)) continue;
      const hit = overlap(box, x, y);
      if (hit.ox > 0.04 && hit.oy > 0.04) return true;
    }
  }
  return false;
}

export function aabbOf(b: Body): Rect {
  if (b.kind !== 'plank') {
    return { l: b.x - b.hw, t: b.y - b.hh, r: b.x + b.hw, b: b.y + b.hh };
  }
  const c = Math.abs(Math.cos(b.angle));
  const s = Math.abs(Math.sin(b.angle));
  const hx = c * b.hw + s * b.hh;
  const hy = s * b.hw + c * b.hh;
  return { l: b.x - hx, t: b.y - hy, r: b.x + hx, b: b.y + hy };
}

function resolveAabb(sim: Simulation, b: Body, axis: 'x' | 'y'): void {
  for (let iter = 0; iter < 3; iter++) {
    const box = aabbOf(b);
    let best = 0;
    let pushPositive = true;
    const x0 = Math.max(0, Math.floor(box.l));
    const x1 = Math.min(sim.w - 1, Math.floor(box.r - 0.0001));
    const y0 = Math.max(0, Math.floor(box.t));
    const y1 = Math.min(sim.h - 1, Math.floor(box.b - 0.0001));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!solid(sim, x, y)) continue;
        const hit = overlap(box, x, y);
        if (hit.ox <= 0.02 || hit.oy <= 0.02) continue;
        if (axis === 'y') {
          const up = box.b - y;
          const down = y + 1 - box.t;
          if (up < down) {
            if (up > best) {
              best = up;
              pushPositive = false;
            }
          } else if (down > best) {
            best = down;
            pushPositive = true;
          }
        } else {
          const left = box.r - x;
          const right = x + 1 - box.l;
          if (left < right) {
            if (left > best) {
              best = left;
              pushPositive = false;
            }
          } else if (right > best) {
            best = right;
            pushPositive = true;
          }
        }
      }
    }
    if (best <= 0) return;
    if (axis === 'y') {
      b.y += pushPositive ? best : -best;
      if (!pushPositive && b.vy > 0) b.vy = 0;
      if (pushPositive && b.vy < 0) b.vy = 0;
    } else {
      b.x += pushPositive ? best : -best;
      if (!pushPositive && b.vx > 0) b.vx = 0;
      if (pushPositive && b.vx < 0) b.vx = 0;
    }
  }
}

function resolveBall(sim: Simulation, b: Body): void {
  for (let iter = 0; iter < 4; iter++) {
    const hit = deepestCircle(sim, b.x, b.y, b.hw);
    if (!hit) break;
    b.x += hit.px;
    b.y += hit.py;
    const vn = b.vx * hit.nx + b.vy * hit.ny;
    if (vn < 0) {
      b.vx -= vn * hit.nx;
      b.vy -= vn * hit.ny;
    }
    if (hit.ny < -0.4 && b.vy > 0) b.vy = 0;
  }
}

function resolvePlank(sim: Simulation, b: Body): void {
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  for (let iter = 0; iter < 3; iter++) {
    let best: { px: number; py: number; nx: number; ny: number; pen: number; ox: number; oy: number } | null = null;
    for (let n = 0; n < 7; n++) {
      const t = -b.hw + (2 * b.hw * n) / 6;
      const sx = b.x + c * t;
      const sy = b.y + s * t;
      const hit = deepestCircle(sim, sx, sy, b.hh);
      if (hit && (!best || hit.pen > best.pen)) best = { ...hit, ox: c * t, oy: s * t };
    }
    if (!best) break;
    b.x += best.px * 0.85;
    b.y += best.py * 0.85;
    b.av += (best.ox * best.py - best.oy * best.px) * 0.06;
    b.av = clamp(b.av, -0.12, 0.12);
    if (best.ny < -0.35 && b.vy > 0) b.vy = 0;
  }
}

function resolvePair(a: Body, b: Body): void {
  if (a.health <= 0 || b.health <= 0) return;
  if (a.kind === 'ball' || b.kind === 'ball') {
    resolveBallPair(a, b);
    return;
  }
  const A = aabbOf(a);
  const B = aabbOf(b);
  const overlapX = Math.min(A.r, B.r) - Math.max(A.l, B.l);
  const overlapY = Math.min(A.b, B.b) - Math.max(A.t, B.t);
  // Ignore hairline contact so stacked crates can fall asleep.
  if (overlapX <= 0.04 || overlapY <= 0.04) return;
  if (overlapX < overlapY) separateX(a, b, overlapX);
  else separateY(a, b, overlapY);
}

function separateY(a: Body, b: Body, overlapY: number): void {
  const aAbove = a.y <= b.y;
  const top = aAbove ? a : b;
  const bot = aAbove ? b : a;
  if (bot.asleep || bot.grounded) {
    top.y -= overlapY;
    if (top.vy > 0) top.vy = 0;
    top.grounded = true;
    top.asleep = false;
  } else if (top.asleep || top.grounded) {
    bot.y += overlapY;
    if (bot.vy < 0) bot.vy = 0;
    bot.asleep = false;
  } else {
    top.y -= overlapY * 0.5;
    bot.y += overlapY * 0.5;
    const avg = (top.vy + bot.vy) * 0.5;
    top.vy = avg;
    bot.vy = avg;
  }
}

function separateX(a: Body, b: Body, overlapX: number): void {
  const aLeft = a.x <= b.x;
  const left = aLeft ? a : b;
  const right = aLeft ? b : a;
  const pushLeft = !(left.asleep || left.grounded) || (right.asleep || right.grounded);
  const pushRight = !(right.asleep || right.grounded) || (left.asleep || left.grounded);
  if (pushLeft && pushRight) {
    left.x -= overlapX * 0.5;
    right.x += overlapX * 0.5;
  } else if (pushLeft) left.x -= overlapX;
  else right.x += overlapX;
  if (overlapX > 0.12) {
    left.asleep = false;
    right.asleep = false;
  }
}

function resolveBallPair(a: Body, b: Body): void {
  const ra = a.kind === 'ball' ? a.hw : Math.min(a.hw, a.hh);
  const rb = b.kind === 'ball' ? b.hw : Math.min(b.hw, b.hh);
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const min = ra + rb;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min || d2 < 1e-8) return;
  const d = Math.sqrt(d2);
  const pen = min - d;
  dx /= d;
  dy /= d;
  const aFixed = a.asleep || a.grounded;
  const bFixed = b.asleep || b.grounded;
  if (bFixed && !aFixed) {
    a.x -= dx * pen;
    a.y -= dy * pen;
  } else if (aFixed && !bFixed) {
    b.x += dx * pen;
    b.y += dy * pen;
  } else {
    a.x -= dx * pen * 0.5;
    a.y -= dy * pen * 0.5;
    b.x += dx * pen * 0.5;
    b.y += dy * pen * 0.5;
  }
  if (dy > 0.4 && a.vy > 0) a.vy = 0;
  if (dy < -0.4 && b.vy > 0) b.vy = 0;
  if (pen > 0.12) {
    a.asleep = false;
    b.asleep = false;
  }
}

function supported(sim: Simulation, b: Body): boolean {
  const box = aabbOf(b);
  const y = Math.floor(box.b + 0.08);
  const x0 = Math.max(0, Math.floor(box.l + 0.2));
  const x1 = Math.min(sim.w - 1, Math.floor(box.r - 0.2));
  for (let x = x0; x <= x1; x++) {
    if (solid(sim, x, y)) return true;
  }
  for (const other of sim.bodies) {
    if (other === b || other.health <= 0) continue;
    const ob = aabbOf(other);
    const gap = ob.t - box.b;
    const overlapX = Math.min(box.r, ob.r) - Math.max(box.l, ob.l);
    if (gap >= -0.08 && gap < 0.15 && overlapX > 0.4) return true;
  }
  return false;
}

function displaceAll(sim: Simulation): void {
  const reserved = new Set<number>();
  for (const b of sim.bodies) {
    if (b.health <= 0) continue;
    const box = aabbOf(b);
    const moves: Array<{ x: number; y: number; nx: number; ny: number }> = [];
    const x0 = Math.max(1, Math.floor(box.l));
    const x1 = Math.min(sim.w - 2, Math.floor(box.r));
    const y0 = Math.max(1, Math.floor(box.t));
    const y1 = Math.min(sim.h - 2, Math.floor(box.b));
    let moved = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = sim.get(x, y);
        if (!DISPLACE[t]) continue;
        if (!cellInside(b, x, y)) continue;
        const spot = findSpot(sim, b, x, y, reserved);
        if (!spot) continue;
        reserved.add(sim.idx(spot.x, spot.y));
        moves.push({ x, y, nx: spot.x, ny: spot.y });
      }
    }
    for (const m of moves) {
      if (sim.get(m.x, m.y) === El.Empty || sim.get(m.nx, m.ny) !== El.Empty) continue;
      sim.moveCell(m.x, m.y, m.nx, m.ny);
      moved++;
    }
    if (moved >= 3) sim.emit('splash', b.x, b.y);
  }
}

function findSpot(
  sim: Simulation,
  b: Body,
  x: number,
  y: number,
  reserved: Set<number>,
): { x: number; y: number } | null {
  const pdx = Math.sign(x + 0.5 - b.x) || 1;
  const first: Array<[number, number]> = [
    [pdx, 0], [-pdx, 0], [0, -1], [pdx, -1], [-pdx, -1], [0, 1],
  ];
  for (const [dx, dy] of first) {
    const spot = freeCell(sim, b, x + dx, y + dy, reserved);
    if (spot) return spot;
  }
  for (let r = 1; r <= 7; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const spot = freeCell(sim, b, x + dx, y + dy, reserved);
        if (spot) return spot;
      }
    }
  }
  return null;
}

function freeCell(
  sim: Simulation,
  b: Body,
  x: number,
  y: number,
  reserved: Set<number>,
): { x: number; y: number } | null {
  if (!sim.inBounds(x, y) || sim.isBorder(x, y)) return null;
  const i = sim.idx(x, y);
  if (reserved.has(i)) return null;
  if (sim.type[i] !== El.Empty) return null;
  if (cellInside(b, x, y)) return null;
  return { x, y };
}

function cellInside(b: Body, x: number, y: number): boolean {
  const px = x + 0.5;
  const py = y + 0.5;
  if (b.kind === 'ball') {
    const dx = px - b.x;
    const dy = py - b.y;
    return dx * dx + dy * dy <= (b.hw - 0.15) * (b.hw - 0.15);
  }
  if (b.kind === 'plank') return distToSegment(px, py, b) <= Math.max(0.2, b.hh - 0.15);
  return px > b.x - b.hw + 0.15 && px < b.x + b.hw - 0.15 && py > b.y - b.hh + 0.15 && py < b.y + b.hh - 0.15;
}

function damageAll(sim: Simulation): void {
  for (const b of sim.bodies) {
    if (b.health <= 0) continue;
    const box = aabbOf(b);
    const x0 = Math.max(1, Math.floor(box.l - 0.5));
    const x1 = Math.min(sim.w - 2, Math.floor(box.r + 0.5));
    const y0 = Math.max(1, Math.floor(box.t - 0.5));
    const y1 = Math.min(sim.h - 2, Math.floor(box.b + 0.5));
    let acid = 0;
    let fire = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!nearBody(b, x, y)) continue;
        const t = sim.get(x, y);
        if (t === El.Acid) acid++;
        else if (t === El.Fire || t === El.Lava || t === El.Molten) fire++;
      }
    }
    if (acid === 0 && fire === 0) continue;
    b.hurt = acid > 0 ? 'acid' : 'fire';
    b.health -= acid * 1.15 + fire * 1.05;
    b.asleep = false;
  }
}

function nearBody(b: Body, x: number, y: number): boolean {
  const px = x + 0.5;
  const py = y + 0.5;
  if (b.kind === 'ball') {
    const dx = px - b.x;
    const dy = py - b.y;
    return dx * dx + dy * dy <= (b.hw + 0.6) * (b.hw + 0.6);
  }
  if (b.kind === 'plank') return distToSegment(px, py, b) <= b.hh + 0.55;
  return px >= b.x - b.hw - 0.4 && px <= b.x + b.hw + 0.4 && py >= b.y - b.hh - 0.4 && py <= b.y + b.hh + 0.4;
}

function reap(sim: Simulation): void {
  const keep: Body[] = [];
  for (const b of sim.bodies) {
    if (b.health > 0 && Number.isFinite(b.x) && Number.isFinite(b.y)) {
      keep.push(b);
      continue;
    }
    sim.emit('break', b.x, b.y);
    if (b.hurt === 'fire') sprinkle(sim, b, El.Fire);
  }
  sim.bodies = keep;
}

function sprinkle(sim: Simulation, b: Body, el: number): void {
  const box = aabbOf(b);
  const x0 = Math.max(1, Math.floor(box.l));
  const x1 = Math.min(sim.w - 2, Math.floor(box.r));
  const y0 = Math.max(1, Math.floor(box.t));
  const y1 = Math.min(sim.h - 2, Math.floor(box.b));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!cellInside(b, x, y)) continue;
      const t = sim.get(x, y);
      if (t === El.Empty) {
        sim.setCell(x, y, el, { origin: 'system' });
      }
    }
  }
}

function contain(sim: Simulation, b: Body): void {
  const pad = 1.05;
  if (b.x < pad) b.x = pad;
  if (b.y < pad) b.y = pad;
  if (b.x > sim.w - pad) b.x = sim.w - pad;
  if (b.y > sim.h - pad) b.y = sim.h - pad;
}

function deepestCircle(
  sim: Simulation,
  cx: number,
  cy: number,
  rad: number,
): { px: number; py: number; nx: number; ny: number; pen: number } | null {
  const x0 = Math.max(0, Math.floor(cx - rad));
  const x1 = Math.min(sim.w - 1, Math.floor(cx + rad));
  const y0 = Math.max(0, Math.floor(cy - rad));
  const y1 = Math.min(sim.h - 1, Math.floor(cy + rad));
  let best: { px: number; py: number; nx: number; ny: number; pen: number } | null = null;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!solid(sim, x, y)) continue;
      const qx = Math.max(x, Math.min(cx, x + 1));
      const qy = Math.max(y, Math.min(cy, y + 1));
      const dx = cx - qx;
      const dy = cy - qy;
      const d2 = dx * dx + dy * dy;
      if (d2 < 1e-8) {
        const left = cx - x;
        const right = x + 1 - cx;
        const top = cy - y;
        const bot = y + 1 - cy;
        const m = Math.min(left, right, top, bot);
        let px = 0;
        let py = 0;
        if (m === left) px = -(m + 0.02);
        else if (m === right) px = m + 0.02;
        else if (m === top) py = -(m + 0.02);
        else py = m + 0.02;
        const pen = m + rad;
        if (!best || pen > best.pen) {
          const len = Math.hypot(px, py) || 1;
          best = { px, py, nx: px / len, ny: py / len, pen };
        }
        continue;
      }
      if (d2 >= rad * rad) continue;
      const d = Math.sqrt(d2);
      const pen = rad - d;
      if (pen < 0.001) continue;
      const nx = dx / d;
      const ny = dy / d;
      if (!best || pen > best.pen) best = { px: nx * pen, py: ny * pen, nx, ny, pen };
    }
  }
  return best;
}

function overlap(box: Rect, x: number, y: number): { ox: number; oy: number } {
  return {
    ox: Math.min(box.r, x + 1) - Math.max(box.l, x),
    oy: Math.min(box.b, y + 1) - Math.max(box.t, y),
  };
}

function solid(sim: Simulation, x: number, y: number): boolean {
  if (!sim.inBounds(x, y)) return true;
  return IS_SOLID[sim.type[sim.idx(x, y)]] === 1;
}

function distToSegment(px: number, py: number, b: Body): number {
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  const ax = b.x - c * b.hw;
  const ay = b.y - s * b.hw;
  const bx = b.x + c * b.hw;
  const by = b.y + s * b.hw;
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby || 1;
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const qx = ax + abx * t;
  const qy = ay + aby * t;
  return Math.hypot(px - qx, py - qy);
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}
