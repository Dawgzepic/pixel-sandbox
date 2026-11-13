import { describe, expect, it } from 'vitest';
import { BUBBLE_TEMP, showsBubble } from '../src/render/bubbles';
import { OUTLINE_TOOLS } from '../src/ui/icons';
import { brushCells } from '../src/brush';

describe('boiling bubbles', () => {
  it('draws bubbles only in hot water and moves them upward', () => {
    expect(showsBubble(4, 10, 0, BUBBLE_TEMP - 1)).toBe(false);
    expect(showsBubble(4, 5, 0, 96)).toBe(true);
    expect(showsBubble(4, 5, 3, 96)).toBe(false);
    expect(showsBubble(4, 4, 3, 96)).toBe(true);
  });
});

describe('brush outlines', () => {
  it('outlines the invisible tools at the current brush size', () => {
    expect(OUTLINE_TOOLS.has('Eraser')).toBe(true);
    expect(OUTLINE_TOOLS.has('Warmer')).toBe(true);
    expect(OUTLINE_TOOLS.has('Cooler')).toBe(true);
    expect(OUTLINE_TOOLS.has('Water')).toBe(false);
    expect(brushCells(8, 8, 5, 'circle').length).toBeGreaterThan(1);
    expect(brushCells(8, 8, 1, 'circle')).toEqual([[8, 8]]);
  });
});