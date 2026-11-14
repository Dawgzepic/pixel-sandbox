/** Water at or above this temperature is boiling and grows a rising bubble. */
export const BUBBLE_TEMP = 88;

/** Cells between one bubble and the next in the same column. */
export const BUBBLE_SPACING = 4;

/** How far a bubble keeps drawing after it leaves the surface, as steam. */
export const STEAM_TRAIL = 4;

const SCAN = 48;

export type BoilCell = 'boiling' | 'open' | 'solid';

export interface RiseMark {
  /** Inside the water, or the same bubble after it has crossed the surface. */
  place: 'water' | 'steam';
  /** 0 at the bottom of the boiling column, 1 at the surface. */
  lift: number;
  /** 1 on the leading cell, lower on the cell it just left, so the streak connects. */
  strength: number;
}

/**
 * Bubbles are born at the bottom of a boiling column. Each one climbs through
 * the water and continues a few cells into the air as steam, so leaving the
 * surface is the same streak instead of a new puff.
 */
export function risingBoil(
  at: (x: number, y: number) => BoilCell,
  x: number,
  y: number,
  frame: number,
): RiseMark | null {
  const here = at(x, y);
  if (here === 'solid') return null;
  const rise = Math.floor(frame / 3);
  if (here === 'boiling') {
    const bottom = walk(at, x, y, 1, 'boiling');
    const top = walk(at, x, y, -1, 'boiling');
    const depth = bottom - y;
    const span = Math.max(1, bottom - top);
    const strength = streak(depth, rise, x);
    if (strength === 0) return null;
    return { place: 'water', lift: depth / span, strength };
  }
  let surface = -1;
  for (let d = 1; d <= STEAM_TRAIL; d++) {
    const below = at(x, y + d);
    if (below === 'solid') return null;
    if (below === 'open') continue;
    surface = y + d;
    break;
  }
  if (surface < 0) return null;
  const bottom = walk(at, x, surface, 1, 'boiling');
  const depth = bottom - y;
  const strength = streak(depth, rise, x);
  if (strength === 0) return null;
  return { place: 'steam', lift: 1, strength };
}

function walk(at: (x: number, y: number) => BoilCell, x: number, y: number, dir: 1 | -1, kind: BoilCell): number {
  let cursor = y;
  for (let n = 0; n < SCAN; n++) {
    const next = cursor + dir;
    if (at(x, next) !== kind) break;
    cursor = next;
  }
  return cursor;
}

/** 1 on the bubble head, a softer value on the cell just below it, else 0. */
function streak(depth: number, rise: number, x: number): number {
  const shift = ((x % BUBBLE_SPACING) + BUBBLE_SPACING) % BUBBLE_SPACING;
  const phase = mod(depth - rise + shift, BUBBLE_SPACING);
  if (phase === 0) return 1;
  if (phase === BUBBLE_SPACING - 1) return 0.72;
  return 0;
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}
