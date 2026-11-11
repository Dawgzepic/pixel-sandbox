import { describe, expect, it } from 'vitest';
import { bresenham, brushCells, sprayCells } from '../src/brush';
import { cellFromLocal, layoutView, panForZoom } from '../src/render/camera';

describe('brush', () => {
  it('paints a single cell, a circle, and a square', () => {
    expect(brushCells(4, 4, 1, 'circle')).toEqual([[4, 4]]);
    const circle = brushCells(0, 0, 3, 'circle');
    expect(circle).toContainEqual([0, 0]);
    expect(circle).toContainEqual([1, 0]);
    expect(circle).not.toContainEqual([1, 1]);
    expect(brushCells(0, 0, 3, 'square')).toHaveLength(9);
  });

  it('draws a straight line and a thinner spray', () => {
    const line = bresenham(0, 0, 4, 0);
    expect(line).toEqual([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
    const spray = sprayCells(3, 3, 5, () => 0.1, 0.5);
    const full = brushCells(3, 3, 5, 'circle');
    expect(spray.length).toBe(full.length);
    const sparse = sprayCells(3, 3, 5, () => 0.9, 0.4);
    expect(sparse).toHaveLength(0);
  });
});

describe('camera', () => {
  it('maps the center of a fitted view to the center cell', () => {
    const view = layoutView(400, 600, 100, 150, 1, 0, 0);
    const cell = cellFromLocal(view.ox + view.dw / 2, view.oy + view.dh / 2, view, 100, 150);
    expect(cell).toEqual({ x: 50, y: 75 });
  });

  it('keeps the focal cell steady while zooming', () => {
    const next = panForZoom(0, 0, 100, 150, 0.25, 0.5, 50, 75, 100, 150);
    expect(next.x + 0.25 * 50).toBeCloseTo(25);
    expect(next.y + 0.5 * 75).toBeCloseTo(75);
  });
});
