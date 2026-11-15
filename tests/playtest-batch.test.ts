import { describe, expect, it } from 'vitest';
import { El } from '../src/sim/elements';
import { handDrag, handMix } from '../src/sim/movement';
import { saltwaterDepth } from '../src/sim/reactions';
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
  it('pits a few pixels into metal and leaves the deep interior alone', () => {
    const world = sim(20, 16, 1);
    const y = world.h - 2;
    world.setCell(1, y, El.Stone);
    world.setCell(2, y, El.Saltwater);
    world.setCell(13, y, El.Stone);
    for (let x = 3; x <= 12; x++) world.setCell(x, y, El.Metal);
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

  it('reaches about four pixels in from the wet surface', () => {
    const world = sim(18, 24, 3);
    const top = 4;
    for (let row = 0; row <= 8; row++) {
      world.setCell(1, top + row, El.Stone);
      world.setCell(15, top + row, El.Stone);
    }
    for (let x = 2; x <= 14; x++) {
      world.setCell(x, top, El.Saltwater);
      for (let row = 1; row <= 7; row++) world.setCell(x, top + row, El.Metal);
    }
    const steps = TUNING.rustStride * TUNING.rustTicks * 5 + 40;
    for (let i = 0; i < steps; i++) world.step();
    const counts: number[] = [];
    for (let row = 1; row <= 7; row++) {
      let rust = 0;
      for (let x = 2; x <= 14; x++) if (world.get(x, top + row) === El.Rust) rust++;
      counts.push(rust);
    }
    console.log('brine', world.count(El.Saltwater), 'at', world.get(5, top), 'metal', world.get(5, top + 1), 'counts', counts.join(','));
    expect(counts[1]).toBeGreaterThan(0);
    expect(counts[1]).toBeLessThan(13);
    expect(counts[3]).toBeGreaterThan(0);
    expect(counts[6]).toBe(0);
  });

  it('branches instead of filling every pixel at the same depth', () => {
    const world = sim(16, 24, 4);
    const y0 = world.h - 2;
    for (let y = y0 - 14; y <= y0; y++) {
      world.setCell(1, y, El.Stone);
      world.setCell(2, y, El.Saltwater);
      world.setCell(3, y, El.Rust);
      world.setCell(4, y, El.Metal);
      world.setCell(5, y, El.Stone);
    }
    const hold = TUNING.rustStride * TUNING.rustTicks * 2 + 8;
    for (let i = 0; i < hold; i++) world.step();
    for (let y = y0 - 14; y <= y0; y++) expect(world.get(4, y)).toBe(El.Metal);
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
    expect(world.aux[world.idx(6, y)]).toBeGreaterThan(0);
    let smoked = false;
    for (let i = 0; i < 40 && world.get(6, y) === El.Timber; i++) {
      world.step();
      if (world.count(El.Smoke) > 0) smoked = true;
    }
    expect(smoked).toBe(true);
    for (let i = 0; i < TUNING.woodBurn + 20 && world.get(6, y) !== El.Ash; i++) world.step();
    expect(world.get(6, y)).toBe(El.Ash);

    const wet = sim();
    wet.setCell(6, y, El.Timber);
    wet.aux[wet.idx(6, y)] = 100;
    wet.setCell(7, y, El.Water);
    wet.step();
    expect(wet.get(6, y)).toBe(El.Timber);
    expect(wet.aux[wet.idx(6, y)]).toBe(0);

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
