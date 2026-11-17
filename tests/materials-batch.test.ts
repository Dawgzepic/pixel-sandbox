import { describe, expect, it } from 'vitest';
import { El } from '../src/sim/elements';
import { GROUPS } from '../src/ui/icons';
import { Simulation } from '../src/sim/simulation';
import { TUNING } from '../src/sim/tuning';

function sim(w = 24, h = 24, seed = 5): Simulation {
  return new Simulation(w, h, seed);
}

describe('molten salt', () => {
  it('melts against lava and freezes again when cooled', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(5, y, El.Stone);
    world.setCell(7, y, El.Stone);
    world.setCell(5, y - 1, El.Stone);
    world.setCell(7, y - 1, El.Stone);
    world.setCell(6, y, El.Salt);
    world.setCell(6, y - 1, El.Lava);
    for (let i = 0; i < 40 && world.count(El.MoltenSalt) === 0; i++) world.step();
    expect(world.count(El.MoltenSalt)).toBeGreaterThan(0);

    const cool = sim();
    cool.setCell(6, y, El.MoltenSalt);
    cool.cool(6, y);
    cool.step();
    expect(cool.get(6, y)).toBe(El.Salt);
  });

  it('flashes water to steam without throwing the salt', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(6, y, El.MoltenSalt);
    world.setTemp(6, y, 1000);
    world.setCell(7, y, El.Water);
    world.step();
    expect(world.count(El.Steam)).toBe(1);
    expect(world.get(6, y)).toBe(El.MoltenSalt);
    expect(world.getTemp(6, y)).toBeLessThan(1000);
    expect(world.impulseX[world.idx(6, y)]).toBe(0);
    expect(world.impulseY[world.idx(6, y)]).toBe(0);
  });
});

describe('salt and ice', () => {
  it('melts ice into saltwater and chills the neighborhood', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(5, y, El.Water);
    world.setTemp(5, y, 16);
    world.setCell(6, y, El.Ice);
    world.setTemp(6, y, -12);
    world.setCell(7, y, El.Salt);
    world.step();
    expect(world.count(El.Saltwater)).toBe(1);
    expect(world.count(El.Salt)).toBe(0);
    expect(world.getTemp(5, y)).toBeLessThan(0);
  });
});

describe('brown glass', () => {
  it('absorbs rust powder into molten glass and cools brown', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(6, y, El.MoltenGlass);
    world.setCell(7, y, El.RustPowder);
    world.step();
    expect(world.count(El.RustPowder)).toBe(0);
    expect(world.count(El.MoltenBrown)).toBe(1);
    for (let yy = 1; yy < world.h - 1; yy++) {
      for (let xx = 1; xx < world.w - 1; xx++) {
        if (world.get(xx, yy) === El.MoltenBrown) world.setTemp(xx, yy, 400);
      }
    }
    world.step();
    expect(world.count(El.BrownGlass)).toBe(1);
  });

  it('holds a liquid in a corner the way clear glass does', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(6, y, El.BrownGlass);
    world.setCell(5, y - 1, El.BrownGlass);
    world.setCell(6, y - 2, El.Water);
    for (let i = 0; i < 20; i++) world.step();
    expect(world.get(5, y)).not.toBe(El.Water);
    expect(world.count(El.Water)).toBe(1);
  });
});

describe('sand and lye', () => {
  it('melts sand into glass when lava heats it', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(5, y, El.Stone);
    world.setCell(7, y, El.Stone);
    world.setCell(5, y - 1, El.Stone);
    world.setCell(7, y - 1, El.Stone);
    world.setCell(6, y, El.Silica);
    world.setCell(6, y - 1, El.Lava);
    for (let i = 0; i < 40 && world.count(El.MoltenGlass) === 0; i++) world.step();
    expect(world.count(El.MoltenGlass)).toBeGreaterThan(0);
    for (let yy = 1; yy < world.h - 1; yy++) {
      for (let xx = 1; xx < world.w - 1; xx++) {
        if (world.get(xx, yy) === El.MoltenGlass) world.setTemp(xx, yy, 400);
      }
    }
    world.step();
    expect(world.count(El.Glass)).toBeGreaterThan(0);
  });

  it('dissolves one ash grain into three plain water cells and ignores saltwater', () => {
    const world = sim();
    const y = world.h - 2;
    for (let x = 4; x <= 12; x++) world.setCell(x, y, El.Stone);
    world.setCell(4, y - 1, El.Stone);
    world.setCell(12, y - 1, El.Stone);
    for (let x = 5; x <= 7; x++) world.setCell(x, y - 1, El.Water);
    world.setCell(8, y - 1, El.Ash);
    world.setCell(9, y - 1, El.Ash);
    for (let i = 0; i < 6; i++) world.step();
    expect(world.count(El.Lye)).toBe(3);
    expect(world.count(El.Ash)).toBe(1);
    expect(world.count(El.Water)).toBe(0);

    const brine = sim();
    brine.setCell(5, y, El.Stone);
    brine.setCell(7, y, El.Stone);
    brine.setCell(6, y, El.Saltwater);
    brine.setCell(6, y - 1, El.Ash);
    for (let i = 0; i < 8; i++) brine.step();
    expect(brine.count(El.Ash)).toBe(1);
    expect(brine.count(El.Lye)).toBe(0);
    expect(brine.count(El.Saltwater)).toBe(1);
  });

  it('puts out fire and leaves ash when three lye cells boil', () => {
    const fire = sim();
    const y = fire.h - 2;
    fire.setCell(6, y, El.Lye);
    fire.setCell(7, y, El.Fire, { aux: 40 });
    fire.step();
    expect(fire.count(El.Fire)).toBe(0);
    expect(fire.count(El.Steam)).toBeGreaterThan(0);

    const boil = sim();
    boil.setCell(4, y, El.Stone);
    boil.setCell(8, y, El.Stone);
    for (let x = 5; x <= 7; x++) {
      boil.setCell(x, y, El.Lye);
      boil.setTemp(x, y, 140);
    }
    boil.step();
    expect(boil.count(El.Ash)).toBe(1);
    expect(boil.count(El.Lye)).toBe(0);
  });
});

describe('new menu items', () => {
  it('lists sand, brown glass, lye water, and molten salt', () => {
    const names = GROUPS.flatMap((group) => group.items.map((item) => item.name));
    expect(names).toContain('Sand');
    expect(names).toContain('Brown glass');
    expect(names).toContain('Lye water');
    expect(names).toContain('Molten salt');
    expect(names).not.toContain('Glass shards');
    expect(TUNING.saltMelt).toBe(801);
  });
});
