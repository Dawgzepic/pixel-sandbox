import { describe, expect, it } from 'vitest';
import { El } from '../src/sim/elements';
import { handDrag, handMix } from '../src/sim/movement';
import { rustCellAllows, saltwaterDepth } from '../src/sim/reactions';
import { Simulation } from '../src/sim/simulation';
import { TUNING } from '../src/sim/tuning';
import { GROUPS } from '../src/ui/icons';

function sim(w = 24, h = 28, seed = 2): Simulation {
  return new Simulation(w, h, seed);
}

describe('hand tool', () => {
  it('mixes water along the drag and leaves glass where it is', () => {
    const world = sim();
    world.setCell(6, 10, El.Water);
    world.setCell(8, 10, El.Glass);
    handMix(world, 6, 10, 1, 'circle', 1, 0);
    expect(world.get(7, 10)).toBe(El.Water);
    expect(world.get(8, 10)).toBe(El.Glass);
    handMix(world, 7, 10, 1, 'circle', 1, 0);
    expect(world.get(8, 10)).toBe(El.Glass);
    expect(world.count(El.Water)).toBe(1);
  });

  it('drags loose material and crumbles rust without moving glass', () => {
    const world = sim();
    world.setCell(5, 12, El.Water);
    world.setCell(9, 12, El.Glass);
    world.setCell(5, 14, El.Rust);
    handDrag(world, 6, 12, 1, 'circle', 1, 0);
    expect(world.get(6, 12)).toBe(El.Water);
    expect(world.get(9, 12)).toBe(El.Glass);
    handDrag(world, 6, 14, 1, 'circle', 1, 0);
    expect(world.get(6, 14)).toBe(El.RustPowder);
    expect(world.get(9, 12)).toBe(El.Glass);
  });
});

describe('root rust', () => {
  it('pits a wet cell and leaves metal that is out of reach', () => {
    const world = sim(20, 16, 1);
    const y = world.h - 2;
    world.setCell(1, y, El.Stone);
    world.setCell(2, y, El.Saltwater);
    world.setCell(13, y, El.Stone);
    for (let x = 3; x <= 12; x++) world.setCell(x, y, El.Metal);
    world.variation[world.idx(3, y)] = 0;
    expect(saltwaterDepth(world, 3, y)).toBe(1);
    expect(saltwaterDepth(world, 8, y)).toBe(0);
    world.aux2[world.idx(8, y)] = 250;
    for (let i = 0; i < 20; i++) world.step();
    expect(world.get(8, y)).toBe(El.Metal);

    const hold = TUNING.rustStride * TUNING.rustTicks;
    for (let i = 0; i < hold + 4; i++) world.step();
    expect(world.get(3, y)).toBe(El.Rust);
    expect(world.get(8, y)).toBe(El.Metal);
  });

  it('decides each pit from the cell, not from its column', () => {
    expect(rustCellAllows(0, 1, false, false)).toBe(true);
    expect(rustCellAllows(1, 1, false, false)).toBe(false);
    expect(rustCellAllows(2, 1, true, false)).toBe(false);
    expect(rustCellAllows(0, 2, true, false)).toBe(false);
    expect(rustCellAllows(4, 5, true, false)).toBe(true);
    expect(rustCellAllows(4, 5, false, true)).toBe(true);
    expect(rustCellAllows(1, 2, false, true)).toBe(false);
    expect(rustCellAllows(4, 6, true, false)).toBe(false);
    expect(rustCellAllows(9, 1, false, false)).toBe(true);
    expect(rustCellAllows(9, 1, false, false)).toBe(rustCellAllows(9, 1, true, true));
  });

  it('grows uneven pits and stops a few pixels in', () => {
    const world = sim(18, 24, 3);
    const top = 4;
    const x0 = 2;
    const width = 13;
    for (let row = 0; row <= 7; row++) {
      world.setCell(1, top + row, El.Stone);
      world.setCell(x0 + width, top + row, El.Stone);
    }
    const rolls: number[][] = [
      [0, 1, 2, 4, 3, 5, 8, 6, 7, 9, 11, 12, 10],
      [0, 1, 1, 1, 4, 1, 1, 2, 1, 14, 1, 1, 1],
      [1, 1, 1, 1, 4, 1, 1, 2, 1, 4, 1, 1, 1],
      [1, 1, 1, 1, 9, 1, 1, 1, 1, 3, 1, 1, 1],
      [1, 1, 1, 1, 4, 1, 1, 1, 1, 2, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ];
    for (let x = 0; x < width; x++) {
      world.setCell(x0 + x, top, El.Saltwater);
      for (let row = 0; row < rolls.length; row++) {
        world.setCell(x0 + x, top + 1 + row, El.Metal);
        world.variation[world.idx(x0 + x, top + 1 + row)] = rolls[row][x];
      }
    }
    const steps = TUNING.rustStride * TUNING.rustTicks * 5 + 40;
    for (let i = 0; i < steps; i++) world.step();

    const pitted = (x: number, row: number) => {
      const t = world.get(x0 + x, top + 1 + row);
      return t === El.Rust || t === El.RustPowder;
    };
    const nucleators = [0, 4, 7, 9, 11];
    for (const x of nucleators) expect(pitted(x, 0)).toBe(true);
    for (let x = 0; x < width; x++) {
      if (!nucleators.includes(x)) expect(pitted(x, 0)).toBe(false);
    }
    const gaps: number[] = [];
    for (let i = 1; i < nucleators.length; i++) gaps.push(nucleators[i] - nucleators[i - 1]);
    expect(new Set(gaps).size).toBeGreaterThan(1);

    expect(pitted(0, 1)).toBe(false);
    expect(pitted(4, 1)).toBe(true);
    expect(pitted(4, 4)).toBe(true);
    expect(pitted(9, 3)).toBe(true);
    expect(pitted(9, 4)).toBe(false);
    expect(pitted(7, 2)).toBe(true);
    expect(pitted(7, 3)).toBe(false);
    expect(pitted(1, 1)).toBe(false);
    for (let x = 0; x < width; x++) expect(world.get(x0 + x, top + 1 + 5)).toBe(El.Metal);
  });
});

describe('chunky rust and freezing', () => {
  it('keeps rust powder in a steep pile', () => {
    const world = sim();
    const y = world.h - 2;
    for (let x = 4; x <= 12; x++) world.setCell(x, y, El.Stone);
    for (let row = 1; row <= 5; row++) world.setCell(8, y - row, El.RustPowder);
    for (let i = 0; i < 20; i++) world.step();
    let minX = 99;
    let maxX = 0;
    for (let row = 1; row <= 6; row++) {
      for (let x = 4; x <= 12; x++) {
        if (world.get(x, y - row) !== El.RustPowder) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    expect(maxX - minX).toBeLessThan(2);
    expect(world.count(El.RustPowder)).toBe(5);
  });

  it('does not freeze saltwater, and still freezes plain water', () => {
    const brine = sim();
    const y = brine.h - 2;
    brine.setCell(5, y, El.Stone);
    brine.setCell(7, y, El.Stone);
    brine.setCell(6, y, El.Saltwater);
    brine.setTemp(6, y, -30);
    brine.step();
    expect(brine.get(6, y)).toBe(El.Saltwater);
    for (let i = 0; i < 30; i++) brine.cool(6, y);
    brine.step();
    expect(brine.get(6, y)).toBe(El.Saltwater);

    const water = sim();
    water.setCell(5, y, El.Stone);
    water.setCell(7, y, El.Stone);
    water.setCell(6, y, El.Water);
    water.setTemp(6, y, -10);
    water.step();
    expect(water.get(6, y)).toBe(El.Ice);
  });
});

describe('wood, ash, smoke, and cooler', () => {
  it('burns wood into ash with smoke, and water puts the fire out', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(6, y, El.Timber);
    world.setCell(7, y, El.Fire, { aux: 80 });
    world.step();
    expect(world.aux2[world.idx(6, y)]).toBe(TUNING.woodBurnTicks);
    let smoked = false;
    for (let i = 0; i < 40 && world.get(6, y) === El.Timber; i++) {
      world.step();
      if (world.count(El.Smoke) > 0) smoked = true;
    }
    expect(smoked).toBe(true);
    expect(world.get(6, y)).toBe(El.Timber);
    const life = TUNING.woodBurnStride * TUNING.woodBurnTicks;
    for (let i = 0; i < life + 20 && world.get(6, y) !== El.Ash; i++) world.step();
    expect(world.get(6, y)).toBe(El.Ash);

    const wet = sim();
    wet.setCell(6, y, El.Timber);
    wet.aux2[wet.idx(6, y)] = 100;
    wet.aux[wet.idx(6, y)] = 3;
    wet.setCell(7, y, El.Water);
    wet.step();
    expect(wet.get(6, y)).toBe(El.Timber);
    expect(wet.aux[wet.idx(6, y)]).toBe(0);
    expect(wet.aux2[wet.idx(6, y)]).toBe(0);

    const slow = sim(16, 16, 9);
    const fy = slow.h - 2;
    slow.setCell(6, fy, El.Timber);
    slow.setCell(7, fy, El.Timber);
    slow.setCell(6, fy - 1, El.Stone);
    slow.setCell(7, fy - 1, El.Stone);
    slow.setCell(5, fy, El.Fire, { aux: 80 });
    slow.step();
    slow.setCell(5, fy, El.Empty);
    for (let i = 0; i < 70; i++) slow.step();
    expect(slow.aux2[slow.idx(7, fy)]).toBe(0);
    expect(slow.get(6, fy)).toBe(El.Timber);
    for (let i = 0; i < 50; i++) slow.step();
    expect(slow.aux2[slow.idx(7, fy)]).toBeGreaterThan(0);
    expect(slow.get(7, fy)).toBe(El.Timber);
    expect(slow.get(6, fy)).toBe(El.Timber);

    const glass = sim();
    glass.setCell(6, y, El.Glass);
    glass.setCell(7, y, El.Fire, { aux: 80 });
    for (let i = 0; i < 40; i++) glass.step();
    expect(glass.get(6, y)).toBe(El.Glass);
  });

  it('keeps smoke in the simulation but out of the menu', () => {
    const shown = GROUPS.flatMap((group) => group.items.map((item) => item.name));
    expect(shown).not.toContain('Smoke');
    expect(shown).toContain('Wood');
    expect(shown).toContain('Ash');
    expect(shown).toContain('Hand');
  });

  it('solidifies molten metal, molten glass, and lava when cooled', () => {
    const metal = sim();
    const y = metal.h - 2;
    metal.setCell(6, y, El.Molten);
    for (let i = 0; i < 10; i++) metal.cool(6, y);
    metal.step();
    expect(metal.get(6, y)).toBe(El.Metal);

    const lava = sim();
    lava.setCell(6, y, El.Lava);
    for (let i = 0; i < 10; i++) lava.cool(6, y);
    lava.step();
    expect(lava.get(6, y)).toBe(El.Stone);

    const glass = sim();
    glass.setCell(6, y, El.MoltenGlass);
    for (let i = 0; i < 10; i++) glass.cool(6, y);
    glass.step();
    expect(glass.get(6, y)).toBe(El.Glass);
  });
});

describe('falling onto a pile', () => {
  it('drops a free column one cell in a step', () => {
    const world = sim();
    const y = world.h - 2;
    for (let x = 4; x <= 12; x++) world.setCell(x, y, El.Stone);
    for (let row = 2; row <= 6; row++) world.setCell(8, y - row, El.Water);
    world.step();
    for (let row = 2; row <= 6; row++) expect(world.get(8, y - row + 1)).toBe(El.Water);
    expect(world.get(8, y - 6)).toBe(El.Empty);
    expect(world.count(El.Water)).toBe(5);
  });

  it('does not walk a pile cell up a falling column', () => {
    const world = sim();
    const y = world.h - 2;
    for (let x = 4; x <= 16; x++) world.setCell(x, y, El.Stone);
    world.setCell(8, y - 1, El.Ash);
    for (let row = 2; row <= 9; row++) world.setCell(8, y - row, El.Water);
    world.step();
    let ashY = -1;
    for (let row = 1; row <= 12; row++) {
      for (let x = 4; x <= 16; x++) {
        if (world.get(x, y - row) === El.Ash) ashY = y - row;
      }
    }
    expect(ashY).toBe(y - 1);
    expect(world.count(El.Ash)).toBe(1);
    expect(world.count(El.Water)).toBe(8);
  });

  it('lets water sit on ash and on salt instead of drilling through', () => {
    const ash = sim(28, 28, 4);
    const y = ash.h - 2;
    for (let x = 2; x <= 24; x++) ash.setCell(x, y, El.Stone);
    for (let row = 1; row <= 12; row++) {
      ash.setCell(2, y - row, El.Stone);
      ash.setCell(24, y - row, El.Stone);
    }
    for (let row = 1; row <= 5; row++) {
      for (let x = 8; x <= 16; x++) ash.setCell(x, y - row, El.Ash);
    }
    for (let row = 7; row <= 14; row++) {
      for (let x = 11; x <= 13; x++) ash.setCell(x, y - row, El.Water);
    }
    const ashCount = ash.count(El.Ash);
    for (let i = 0; i < 24; i++) ash.step();
    expect(ash.count(El.Ash)).toBe(ashCount);
    expect(ash.count(El.Water)).toBe(24);
    let highest = y;
    let rows = 0;
    const seen = new Set<number>();
    for (let row = 1; row <= 20; row++) {
      for (let x = 3; x <= 23; x++) {
        if (ash.get(x, y - row) !== El.Ash) continue;
        if (y - row < highest) highest = y - row;
        seen.add(row);
      }
    }
    rows = seen.size;
    expect(highest).toBe(y - 5);
    expect(rows).toBeGreaterThanOrEqual(4);
    let drilled = 0;
    for (let x = 11; x <= 13; x++) if (ash.get(x, y - 1) === El.Water) drilled++;
    expect(drilled).toBe(0);

    const salt = sim(28, 28, 5);
    for (let x = 2; x <= 24; x++) salt.setCell(x, y, El.Stone);
    for (let row = 1; row <= 8; row++) {
      salt.setCell(2, y - row, El.Stone);
      salt.setCell(24, y - row, El.Stone);
    }
    for (let row = 1; row <= 4; row++) {
      for (let x = 8; x <= 16; x++) salt.setCell(x, y - row, El.Salt);
    }
    for (let row = 6; row <= 12; row++) salt.setCell(12, y - row, El.Water);
    for (let i = 0; i < 20; i++) salt.step();
    let saltTop = y;
    for (let row = 1; row <= 16; row++) {
      for (let x = 3; x <= 23; x++) {
        if (salt.get(x, y - row) === El.Salt && y - row < saltTop) saltTop = y - row;
      }
    }
    expect(saltTop).toBeGreaterThanOrEqual(y - 4);
    for (let x = 11; x <= 13; x++) expect(salt.get(x, y - 1)).toBe(El.Salt);
    expect(salt.count(El.Saltwater)).toBeGreaterThan(0);
    for (let row = 13; row <= 16; row++) {
      for (let x = 3; x <= 23; x++) expect(salt.get(x, y - row)).not.toBe(El.Saltwater);
    }
  });

  it('lets salt sink through water without throwing the water up the column', () => {
    const world = sim(28, 28, 6);
    const y = world.h - 2;
    for (let x = 4; x <= 20; x++) world.setCell(x, y, El.Stone);
    for (let row = 1; row <= 14; row++) {
      world.setCell(4, y - row, El.Stone);
      world.setCell(20, y - row, El.Stone);
    }
    for (let row = 1; row <= 6; row++) {
      for (let x = 6; x <= 18; x++) world.setCell(x, y - row, El.Saltwater);
    }
    for (let row = 8; row <= 13; row++) world.setCell(12, y - row, El.Salt);
    world.step();
    for (let row = 8; row <= 13; row++) {
      for (let x = 5; x <= 19; x++) expect(world.get(x, y - row)).not.toBe(El.Saltwater);
    }
    for (let i = 0; i < 16; i++) world.step();
    expect(world.count(El.Salt)).toBe(6);
    expect(world.count(El.Saltwater)).toBe(13 * 6);
    let saltLow = false;
    for (let x = 6; x <= 18; x++) if (world.get(x, y - 1) === El.Salt) saltLow = true;
    expect(saltLow).toBe(true);
    for (let row = 10; row <= 14; row++) {
      for (let x = 5; x <= 19; x++) expect(world.get(x, y - row)).not.toBe(El.Saltwater);
    }
  });

  it('piles ash on stone and lets it rest on water', () => {
    const stone = sim(24, 24, 7);
    const y = stone.h - 2;
    for (let x = 4; x <= 18; x++) stone.setCell(x, y, El.Stone);
    for (let row = 4; row <= 8; row++) stone.setCell(10, y - row, El.Ash);
    for (let i = 0; i < 20; i++) stone.step();
    expect(stone.count(El.Ash)).toBe(5);
    let above = 0;
    for (let row = 9; row <= 14; row++) {
      for (let x = 4; x <= 18; x++) if (stone.get(x, y - row) === El.Ash) above++;
    }
    expect(above).toBe(0);
    let onFloor = 0;
    for (let x = 4; x <= 18; x++) if (stone.get(x, y - 1) === El.Ash) onFloor++;
    expect(onFloor).toBeGreaterThan(0);

    const water = sim(24, 24, 8);
    for (let x = 4; x <= 18; x++) water.setCell(x, y, El.Stone);
    for (let row = 1; row <= 8; row++) {
      water.setCell(4, y - row, El.Stone);
      water.setCell(18, y - row, El.Stone);
    }
    for (let row = 1; row <= 4; row++) {
      for (let x = 6; x <= 16; x++) water.setCell(x, y - row, El.Water);
    }
    for (let row = 6; row <= 9; row++) water.setCell(11, y - row, El.Ash);
    for (let i = 0; i < 16; i++) water.step();
    expect(water.count(El.Ash)).toBe(4);
    expect(water.count(El.Water)).toBe(11 * 4);
    for (let row = 1; row <= 3; row++) {
      for (let x = 5; x <= 17; x++) expect(water.get(x, y - row)).not.toBe(El.Ash);
    }
    let resting = false;
    for (let row = 4; row <= 7; row++) {
      for (let x = 5; x <= 17; x++) if (water.get(x, y - row) === El.Ash) resting = true;
    }
    expect(resting).toBe(true);
    for (let row = 10; row <= 14; row++) {
      for (let x = 5; x <= 17; x++) expect(water.get(x, y - row)).not.toBe(El.Water);
    }
  });
});
