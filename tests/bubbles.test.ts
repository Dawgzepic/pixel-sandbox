import { describe, expect, it } from 'vitest';
import { BUBBLE_TEMP, risingBoil, type BoilCell } from '../src/render/bubbles';
import { OUTLINE_TOOLS, QUICK } from '../src/ui/icons';
import { brushCells } from '../src/brush';

/** Boiling water from y=10 (surface) through y=16 (bottom). Air above is open. */
function column(x: number, y: number): BoilCell {
  if (x !== 4) return 'solid';
  if (y >= 10 && y <= 16) return 'boiling';
  if (y < 10) return 'open';
  return 'solid';
}

describe('boiling bubbles', () => {
  it('starts bubbles at the bottom and carries them out as steam', () => {
    expect(risingBoil(() => 'solid', 4, 16, 0)).toBeNull();
    expect(risingBoil(column, 4, 16, 0)).toMatchObject({ place: 'water', lift: 0, strength: 1 });
    expect(risingBoil(column, 4, 10, 0)).toBeNull();

    const climbed = risingBoil(column, 4, 15, 3);
    expect(climbed?.place).toBe('water');
    expect(climbed?.strength).toBe(1);
    expect(risingBoil(column, 4, 16, 3)?.strength).toBeLessThan(1);

    const atSurface = risingBoil(column, 4, 10, 18);
    const leaving = risingBoil(column, 4, 9, 21);
    const stillConnected = risingBoil(column, 4, 10, 21);
    expect(atSurface).toMatchObject({ place: 'water', strength: 1 });
    expect(leaving).toMatchObject({ place: 'steam', strength: 1 });
    expect(stillConnected?.place).toBe('water');
    expect(stillConnected?.strength).toBeGreaterThan(0);
    expect(BUBBLE_TEMP).toBe(88);
  });
});

describe('brush outlines', () => {
  it('outlines the invisible tools at the current brush size', () => {
    expect(OUTLINE_TOOLS.has('Eraser')).toBe(true);
    expect(OUTLINE_TOOLS.has('Warmer')).toBe(true);
    expect(OUTLINE_TOOLS.has('Cooler')).toBe(true);
    expect(OUTLINE_TOOLS.has('Water')).toBe(false);
    expect(QUICK).not.toContain('Warmer');
    expect(QUICK).not.toContain('Cooler');
    expect(brushCells(8, 8, 5, 'circle').length).toBeGreaterThan(1);
    expect(brushCells(8, 8, 1, 'circle')).toEqual([[8, 8]]);
  });
});
