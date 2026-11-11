export type BrushShape = 'circle' | 'square' | 'line' | 'spray';

export const BRUSH_SIZES = [1, 3, 5, 9, 15] as const;

export function brushCells(
  cx: number,
  cy: number,
  diameter: number,
  shape: 'circle' | 'square',
): Array<[number, number]> {
  const r = (diameter - 1) / 2;
  const reach = Math.ceil(r);
  const limit = r * r + 1e-6;
  const out: Array<[number, number]> = [];
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      if (shape === 'square' || dx * dx + dy * dy <= limit) out.push([cx + dx, cy + dy]);
    }
  }
  return out;
}

export function bresenham(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

export function sprayCells(
  cx: number,
  cy: number,
  diameter: number,
  rng: () => number,
  chance = 0.42,
): Array<[number, number]> {
  return brushCells(cx, cy, diameter, 'circle').filter(() => rng() < chance);
}
