import { describe, expect, it } from 'vitest';
import { El, elementByName } from '../src/sim/elements';
import { isSodiumFlame } from '../src/render/renderer';
import { fullSaltRustSteps } from '../src/sim/reactions';
import { Simulation } from '../src/sim/simulation';
import { TUNING } from '../src/sim/tuning';

function sim(w = 24, h = 32, seed = 3): Simulation {
  return new Simulation(w, h, seed);
}

describe('salt', () => {
  it('dissolves one salt grain into three water pixels', () => {
    const water = elementByName('Water')!;
    const brine = elementByName('Saltwater')!;
    const waterLum = water.color[0] + water.color[1] + water.color[2];
    const brineLum = brine.color[0] + brine.color[1] + brine.color[2];
    expect(brineLum).toBeGreaterThan(waterLum + 40);

    const world = sim();
    const y = world.h - 2;
    for (let x = 4; x <= 10; x++) world.setCell(x, y, El.Stone);
    world.setCell(4, y - 1, El.Stone);
    world.setCell(10, y - 1, El.Stone);
    world.setCell(5, y - 1, El.Water);
    world.setCell(6, y - 1, El.Water);
    world.setCell(7, y - 1, El.Water);
    world.setCell(8, y - 1, El.Salt);
    world.setCell(9, y - 1, El.Salt);
    for (let i = 0; i < 8; i++) world.step();
    expect(world.count(El.Saltwater)).toBe(3);
    expect(world.count(El.Salt)).toBe(1);
    expect(world.count(El.Water)).toBe(0);
    expect(world.get(9, y - 1)).toBe(El.Salt);
  });

  it('lets extra salt sink through saturated water and stay solid', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(4, y, El.Stone);
    world.setCell(8, y, El.Stone);
    for (let row = 0; row < 4; row++) world.setCell(6, y - row, El.Saltwater);
    world.setCell(6, y - 4, El.Salt);
    for (let i = 0; i < 12; i++) world.step();
    expect(world.get(6, y)).toBe(El.Salt);
    expect(world.count(El.Salt)).toBe(1);
    expect(world.count(El.Saltwater)).toBe(4);
  });

  it('leaves one salt grain when three salty cells boil', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(4, y, El.Stone);
    world.setCell(8, y, El.Stone);
    for (let x = 5; x <= 7; x++) {
      world.setCell(x, y, El.Saltwater);
      world.setTemp(x, y, 140);
    }
    world.step();
    expect(world.count(El.Salt)).toBe(1);
    expect(world.count(El.Steam)).toBeGreaterThan(0);
    expect(world.count(El.Saltwater)).toBe(0);
  });

  it('flashes fire yellow while salt touches it, then returns to normal', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(5, y, El.Fire, { aux: 200 });
    world.setCell(6, y, El.Salt);
    world.step();
    const flame = find(world, El.Fire);
    expect(flame).not.toBeNull();
    expect(isSodiumFlame(world.variation[world.idx(flame!.x, flame!.y)])).toBe(true);
    expect(world.count(El.Salt)).toBe(1);

    world.setCell(6, y, El.Empty);
    for (let i = 0; i < 40; i++) world.step();
    const later = find(world, El.Fire);
    expect(later).not.toBeNull();
    expect(isSodiumFlame(world.variation[world.idx(later!.x, later!.y)])).toBe(false);
    expect(world.count(El.Salt)).toBe(0);
  });

  it('does not leak salt through a corner-touching glass line', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(6, y, El.Glass);
    world.setCell(5, y - 1, El.Glass);
    world.setCell(6, y - 2, El.Salt);
    for (let i = 0; i < 20; i++) world.step();
    expect(world.get(5, y)).not.toBe(El.Salt);
    expect(world.count(El.Salt)).toBe(1);
  });
});

describe('rust', () => {
  it('rusts metal in saltwater about as slowly as lava melts glass, and not in fresh water', () => {
    const hold = fullSaltRustSteps(0);
    const glassHold = TUNING.glassLavaStride * TUNING.glassLavaTicks;
    expect(hold).toBeGreaterThan(glassHold / 2);

    const fresh = sim();
    const y = fresh.h - 2;
    box(fresh, 6, y);
    fresh.setCell(6, y, El.Metal);
    fresh.setCell(6, y - 1, El.Water);
    for (let i = 0; i < hold + 8; i++) fresh.step();
    expect(fresh.get(6, y)).toBe(El.Metal);

    const world = sim();
    box(world, 6, y);
    world.setCell(6, y, El.Metal);
    world.variation[world.idx(6, y)] = 0;
    world.setCell(6, y - 1, El.Saltwater);
    for (let i = 0; i < 40; i++) world.step();
    expect(world.get(6, y)).toBe(El.Metal);
    for (let i = 40; i < hold + 4 && world.get(6, y) === El.Metal; i++) world.step();
    expect(world.get(6, y)).toBe(El.Rust);
  });

  it('crumbles solid rust into powder that falls', () => {
    const hold = TUNING.crumbleStride * TUNING.crumbleTicks;
    const world = sim();
    const y = world.h - 2;
    box(world, 6, y);
    world.setCell(6, y, El.Saltwater);
    world.setCell(6, y - 1, El.Saltwater);
    world.setCell(6, y - 2, El.Rust);
    for (let i = 0; i < 12; i++) world.step();
    expect(world.get(6, y - 2)).toBe(El.Rust);
    for (let i = 12; i < hold + 8 && world.count(El.RustPowder) === 0; i++) world.step();
    expect(world.count(El.RustPowder)).toBeGreaterThan(0);
    const before = find(world, El.RustPowder);
    expect(before).not.toBeNull();
    world.step();
    const after = find(world, El.RustPowder);
    expect(after).not.toBeNull();
    expect(after!.y).toBeGreaterThan(before!.y);
  });
});

function box(world: Simulation, x: number, y: number): void {
  for (const row of [y, y - 1, y - 2, y - 3]) {
    world.setCell(x - 1, row, El.Stone);
    world.setCell(x + 1, row, El.Stone);
  }
  world.setCell(x, y + 1 > world.h - 2 ? y : y, El.Stone);
}

function find(world: Simulation, el: number): { x: number; y: number } | null {
  for (let y = 1; y < world.h - 1; y++) {
    for (let x = 1; x < world.w - 1; x++) {
      if (world.get(x, y) === el) return { x, y };
    }
  }
  return null;
}
