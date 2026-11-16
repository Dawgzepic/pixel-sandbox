import { describe, expect, it } from 'vitest';
import { El } from '../src/sim/elements';
import { fullSaltRustSteps } from '../src/sim/reactions';
import { Simulation } from '../src/sim/simulation';
import { saltUnits, TUNING } from '../src/sim/tuning';

function sim(w = 24, h = 28, seed = 4): Simulation {
  return new Simulation(w, h, seed);
}

describe('steam explosion', () => {
  it('bursts molten metal into steam and a hot droplet, and leaves distant metal', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(6, y, El.Molten);
    world.setCell(7, y, El.Molten);
    world.setCell(8, y, El.Water);
    world.setCell(15, y, El.Stone);
    world.setCell(17, y, El.Stone);
    world.setCell(16, y, El.Molten);
    world.step();
    expect(world.count(El.Steam)).toBeGreaterThan(0);
    expect(world.get(16, y)).toBe(El.Molten);
    expect(world.count(El.Molten) + world.count(El.Metal)).toBeGreaterThan(0);
    const glass = sim();
    glass.setCell(6, y, El.MoltenGlass);
    glass.setCell(7, y, El.Saltwater);
    glass.step();
    expect(glass.count(El.GlassShard)).toBeGreaterThan(0);
    expect(glass.count(El.Glass)).toBe(0);
    expect(glass.count(El.Steam)).toBeGreaterThan(0);
  });

  it('still turns lava and water into stone and steam', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(6, y, El.Lava);
    world.setCell(7, y, El.Water);
    world.step();
    expect(world.count(El.Stone)).toBeGreaterThan(0);
    expect(world.count(El.Steam)).toBeGreaterThan(0);
    expect(world.count(El.Lava)).toBe(0);
  });
});

describe('salt ratio and mixing', () => {
  it('keeps extra salt solid once three waters are full', () => {
    const world = sim();
    const y = world.h - 2;
    for (let x = 3; x <= 12; x++) world.setCell(x, y, El.Stone);
    world.setCell(3, y - 1, El.Stone);
    world.setCell(12, y - 1, El.Stone);
    for (let x = 4; x <= 9; x++) world.setCell(x, y - 1, El.Water);
    world.setCell(10, y - 1, El.Salt);
    world.setCell(11, y - 1, El.Salt);
    for (let i = 0; i < 6; i++) world.step();
    expect(world.count(El.Salt)).toBe(1);
    expect(world.count(El.Saltwater)).toBe(3);
    expect(world.count(El.Water)).toBe(3);
  });

  it('sinks salty water under fresh water, then shares the salt', () => {
    const world = sim();
    const y = world.h - 2;
    for (let x = 4; x <= 10; x++) world.setCell(x, y, El.Stone);
    for (let row = 1; row <= 8; row++) {
      world.setCell(4, y - row, El.Stone);
      world.setCell(10, y - row, El.Stone);
    }
    for (let row = 1; row <= 5; row++) world.setCell(7, y - row, El.Water);
    world.setCell(7, y - 6, El.Saltwater);
    for (let i = 0; i < 6; i++) world.step();
    let sunk = false;
    for (let x = 5; x <= 9; x++) {
      if (world.get(x, y - 1) !== El.Saltwater) continue;
      sunk = true;
      expect(saltUnits(world.aux[world.idx(x, y - 1)])).toBe(TUNING.saltCap);
    }
    expect(sunk).toBe(true);
    expect(world.count(El.Saltwater)).toBe(1);
    for (let i = 0; i < 80; i++) world.step();
    expect(world.count(El.Saltwater)).toBeGreaterThan(1);
    let units = 0;
    let paler = false;
    for (let row = 1; row <= 8; row++) {
      for (let x = 5; x <= 9; x++) {
        if (world.get(x, y - row) !== El.Saltwater) continue;
        const strength = saltUnits(world.aux[world.idx(x, y - row)]);
        units += strength;
        if (strength < TUNING.saltCap) paler = true;
      }
    }
    expect(units).toBe(TUNING.saltCap);
    expect(paler).toBe(true);
  });
});

describe('rust through a wall', () => {
  it('keeps going while the metal stays wet, and plain water is much slower', () => {
    const world = sim(20, 16, 2);
    const y = world.h - 3;
    for (let x = 4; x <= 14; x++) world.setCell(x, y + 1, El.Stone);
    world.setCell(4, y, El.Stone);
    world.setCell(5, y, El.Metal);
    world.setCell(6, y, El.Metal);
    world.variation[world.idx(5, y)] = 0;
    world.variation[world.idx(6, y)] = 0;
    world.setCell(7, y, El.Saltwater);
    world.setCell(8, y, El.Stone);
    const one = fullSaltRustSteps(0);
    for (let i = 0; i < one + 8; i++) world.step();
    expect(world.get(6, y)).not.toBe(El.Metal);
    expect(world.get(5, y)).toBe(El.Metal);
    for (let i = 0; i < one + 8; i++) world.step();
    expect(world.get(5, y)).not.toBe(El.Metal);

    const fresh = sim(16, 12, 3);
    const fy = fresh.h - 2;
    fresh.setCell(5, fy, El.Stone);
    fresh.setCell(7, fy, El.Stone);
    fresh.setCell(6, fy, El.Metal);
    fresh.variation[fresh.idx(6, fy)] = 0;
    fresh.setCell(6, fy - 1, El.Water);
    for (let i = 0; i < one + 8; i++) fresh.step();
    expect(fresh.get(6, fy)).toBe(El.Metal);
  });
});
