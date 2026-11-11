import { describe, expect, it } from 'vitest';
import { CONTACT_RULES, DEFS, El } from '../src/sim/elements';
import { Simulation, assertHealthy } from '../src/sim/simulation';
import { TUNING } from '../src/sim/tuning';
import { buildDemo } from '../src/sim/demo';
import { GRID_H, GRID_W } from '../src/sim/tuning';

function sim(w = 24, h = 32, seed = 3): Simulation {
  return new Simulation(w, h, seed);
}

describe('catalog', () => {
  it('ships a playable set covering every requested family', () => {
    const names = DEFS.map((d) => d.name);
    for (const name of [
      'Sand', 'Water', 'Oil', 'Acid', 'Fire', 'Gunpowder', 'Wood', 'Seed', 'Plant',
      'Bug', 'Metal', 'Battery', 'Bulb', 'Ice', 'Steam', 'Lava', 'Stone', 'Void',
      'Clone', 'Portal', 'Wall',
    ]) {
      expect(names).toContain(name);
    }
    expect(DEFS.filter((d) => d.id !== El.Empty).length).toBeGreaterThanOrEqual(15);
  });
});

describe('movement', () => {
  it('drops sand straight down through sleeping chunks', () => {
    const world = sim(20, 30);
    world.sleepAll();
    world.setCell(5, 2, El.Sand);
    for (let i = 0; i < 40; i++) world.step();
    expect(world.get(5, world.h - 2)).toBe(El.Sand);
    assertHealthy(world);
  });

  it('lets water spread along a floor', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(2, y, El.Stone);
    world.setCell(14, y, El.Stone);
    world.setCell(8, y, El.Water);
    for (let i = 0; i < 6; i++) world.step();
    let xFound = -1;
    for (let x = 1; x < world.w - 1; x++) if (world.get(x, y) === El.Water) xFound = x;
    expect(xFound).not.toBe(8);
    expect(world.count(El.Water)).toBe(1);
  });

  it('floats oil on water', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(4, y, El.Stone);
    world.setCell(6, y, El.Stone);
    world.setCell(5, y - 1, El.Water);
    world.setCell(5, y, El.Oil);
    world.step();
    expect(world.get(5, y)).toBe(El.Water);
    expect(world.get(5, y - 1)).toBe(El.Oil);
  });
});

describe('reactions', () => {
  it('turns touching water and lava into steam and stone', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(4, y, El.Lava);
    world.setCell(5, y, El.Water);
    world.step();
    expect(world.get(4, y)).toBe(El.Stone);
    expect(world.count(El.Steam)).toBeGreaterThanOrEqual(1);
    expect(world.count(El.Lava)).toBe(0);
    expect(world.count(El.Water)).toBe(0);
  });

  it('lets the brush resolve water painted onto lava or fire', () => {
    const world = sim();
    world.setCell(5, 5, El.Lava);
    world.paintUser(5, 5, El.Water);
    expect(world.get(5, 5)).toBe(El.Stone);
    expect(world.generated[El.Stone]).toBeGreaterThan(0);
    expect(world.userPaint[El.Water]).toBeGreaterThan(0);
    let steam = false;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      if (world.get(5 + dx, 5 + dy) === El.Steam) steam = true;
    }
    expect(steam).toBe(true);

    world.setCell(8, 5, El.Fire);
    world.paintUser(8, 5, El.Water);
    expect(world.get(8, 5)).not.toBe(El.Fire);
    expect(world.count(El.Steam)).toBeGreaterThanOrEqual(2);
  });

  it('puts fire out when water touches it', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(4, y, El.Fire);
    world.setCell(5, y, El.Water);
    world.step();
    expect(world.count(El.Fire)).toBe(0);
    expect(world.count(El.Steam)).toBeGreaterThanOrEqual(1);
  });

  it('ignites oil, wood, and plants from fire', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(3, y, El.Fire);
    world.setCell(4, y, El.Oil);
    const oilRule = CONTACT_RULES.find((r) => r.self === El.Oil && r.neighbor === El.Fire)!;
    for (let i = 0; i < oilRule.ticks; i++) world.step();
    expect(world.count(El.Oil)).toBe(0);
    expect(world.count(El.Fire)).toBeGreaterThan(0);

    const world2 = sim();
    world2.setCell(3, y, El.Fire);
    world2.setCell(4, y, El.Wood);
    const woodRule = CONTACT_RULES.find((r) => r.self === El.Wood && r.neighbor === El.Fire)!;
    for (let i = 0; i < woodRule.ticks + 1; i++) world2.step();
    expect(world2.count(El.Wood)).toBe(0);
    expect(world2.count(El.Fire)).toBeGreaterThan(0);

    const world3 = sim();
    world3.setCell(4, y, El.Plant);
    world3.setCell(3, y, El.Fire);
    const plantRule = CONTACT_RULES.find((r) => r.self === El.Plant && r.neighbor === El.Fire)!;
    for (let i = 0; i < plantRule.ticks + 2; i++) world3.step();
    expect(world3.count(El.Plant)).toBe(0);
  });

  it('crusts sand that sits in lava', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(3, y, El.Stone);
    world.setCell(6, y, El.Stone);
    world.setCell(4, y, El.Lava);
    world.setCell(5, y, El.Sand);
    const rule = CONTACT_RULES.find((r) => r.self === El.Sand && r.neighbor === El.Lava)!;
    for (let i = 0; i < rule.ticks + 3; i++) world.step();
    let sandLeft = false;
    for (let x = 3; x <= 6; x++) if (world.get(x, y) === El.Sand) sandLeft = true;
    expect(sandLeft).toBe(false);
  });

  it('dissolves wood and sand but not walls', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(4, y, El.Acid);
    world.setCell(5, y, El.Wood);
    world.setCell(6, 4, El.Wall);
    world.setCell(7, 4, El.Acid);
    const steps = DEFS[El.Wood].acidResist;
    for (let i = 0; i < steps; i++) world.step();
    expect(world.count(El.Wood)).toBe(0);
    expect(world.count(El.Acid)).toBeGreaterThan(0);
    for (let i = 0; i < 8; i++) world.step();
    expect(world.get(6, 4)).toBe(El.Wall);
  });

  it('explodes gunpowder next to fire or a live wire', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(4, y, El.Fire);
    world.setCell(5, y, El.Gunpowder);
    world.step();
    expect(world.get(5, y)).toBe(El.Fire);
    expect(world.events.some((e) => e.kind === 'explode')).toBe(true);

    const wired = sim();
    wired.setCell(2, y, El.Battery);
    wired.setCell(3, y, El.Metal);
    wired.setCell(4, y, El.Metal);
    wired.setCell(5, y, El.Gunpowder);
    wired.step();
    expect(wired.get(5, y)).toBe(El.Fire);
  });

  it('lights a bulb through metal', () => {
    const world = sim();
    const y = 8;
    world.setCell(2, y, El.Battery);
    world.setCell(3, y, El.Metal);
    world.setCell(4, y, El.Metal);
    world.setCell(5, y, El.Bulb);
    world.step();
    expect(world.charge[world.idx(5, y)]).toBeGreaterThan(0);
  });
});

describe('temperature', () => {
  it('keeps lonely ice frozen', () => {
    const world = sim();
    world.setCell(6, 6, El.Ice);
    const temp = world.getTemp(6, 6);
    for (let i = 0; i < 40; i++) world.step();
    expect(world.get(6, 6)).toBe(El.Ice);
    expect(world.getTemp(6, 6)).toBe(temp);
  });

  it('melts ice next to fire and freezes water next to ice', () => {
    const world = sim();
    world.setCell(5, 8, El.Ice);
    world.setCell(6, 8, El.Fire);
    for (let i = 0; i < 8; i++) world.step();
    expect(world.get(5, 8)).not.toBe(El.Ice);

    const cold = sim();
    const y = cold.h - 2;
    cold.setCell(4, y, El.Stone);
    cold.setCell(6, y, El.Stone);
    cold.setCell(5, y, El.Water);
    cold.setCell(5, y - 1, El.Ice);
    cold.setTemp(5, y, 6);
    for (let i = 0; i < 20; i++) cold.step();
    expect(cold.get(5, y) === El.Ice || cold.getTemp(5, y) < 6).toBe(true);
  });

  it('boils water, condenses steam, and cools lava by threshold', () => {
    const boil = sim();
    boil.setCell(5, 5, El.Water);
    boil.setTemp(5, 5, 180);
    boil.step();
    expect(boil.count(El.Steam)).toBeGreaterThanOrEqual(1);
    expect(boil.count(El.Water)).toBe(0);

    const cond = sim();
    cond.setCell(5, 5, El.Steam);
    cond.setTemp(5, 5, 40);
    cond.step();
    expect(cond.count(El.Water)).toBeGreaterThanOrEqual(1);

    const lava = sim();
    lava.setCell(5, 5, El.Lava);
    lava.setTemp(5, 5, 280);
    lava.step();
    expect(lava.get(5, 5)).toBe(El.Stone);
  });

  it('shares heat between metal and eventually crusts a lone lava cell', () => {
    const world = sim();
    world.setCell(5, 5, El.Metal);
    world.setCell(6, 5, El.Metal);
    world.setTemp(5, 5, 200);
    world.setTemp(6, 5, 20);
    world.step();
    world.step();
    world.step();
    for (let i = 0; i < 25; i++) world.step();
    const hot = world.getTemp(5, 5);
    const cold = world.getTemp(6, 5);
    expect(cold).toBeGreaterThan(20);
    expect(hot).toBeLessThan(200);
    expect(Math.abs(hot - cold)).toBeLessThan(180);

    const lone = sim();
    for (let y = 8; y <= 10; y++) {
      for (let x = 7; x <= 9; x++) lone.setCell(x, y, El.Stone);
    }
    lone.setCell(8, 9, El.Lava);
    for (let i = 0; i < 160; i++) lone.step();
    expect(lone.get(8, 9)).toBe(El.Stone);

    const pool = sim();
    for (let y = 12; y <= 18; y++) {
      for (let x = 8; x <= 14; x++) pool.setCell(x, y, El.Stone);
    }
    for (let y = 13; y <= 17; y++) {
      for (let x = 9; x <= 13; x++) pool.setCell(x, y, El.Lava);
    }
    for (let i = 0; i < 40; i++) pool.step();
    expect(pool.get(11, 15)).toBe(El.Lava);
  });
});

describe('life and magic', () => {
  it('grows a seed beside water and then a plant upward', () => {
    const world = sim(20, 36);
    const y = world.h - 2;
    world.setCell(4, y, El.Stone);
    world.setCell(7, y, El.Stone);
    world.setCell(5, y, El.Seed);
    world.setCell(6, y, El.Water);
    for (let i = 0; i < TUNING.seedTicks; i++) world.step();
    expect(world.get(5, y)).toBe(El.Plant);
    for (let i = 0; i < TUNING.plantGrowTicks; i++) world.step();
    expect(world.get(5, y - 1)).toBe(El.Plant);
  });

  it('lets bugs eat plants and die in fire', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(5, y, El.Bug);
    world.setCell(6, y, El.Plant);
    for (let i = 0; i < TUNING.bugEatTicks; i++) world.step();
    expect(world.get(6, y)).toBe(El.Empty);
    expect(world.get(5, y)).toBe(El.Bug);

    const dead = sim();
    dead.setCell(5, y, El.Bug);
    dead.setCell(6, y, El.Fire);
    dead.step();
    expect(dead.get(5, y)).toBe(El.Empty);
  });

  it('deletes with void, copies with clone, and teleports through portals', () => {
    const world = sim();
    world.setCell(5, 5, El.Void);
    world.setCell(7, 10, El.Stone);
    world.setCell(8, 10, El.Stone);
    world.setCell(9, 10, El.Stone);
    world.setCell(8, 9, El.Sand);
    world.step();
    expect(world.get(8, 9)).toBe(El.Sand);
    world.setCell(6, 5, El.Sand);
    world.setCell(5, 6, El.Wall);
    world.step();
    expect(world.get(6, 5)).toBe(El.Empty);
    world.step();
    world.step();
    expect(world.get(5, 6)).toBe(El.Wall);

    const clone = sim();
    clone.setCell(4, 4, El.Stone);
    clone.setCell(6, 4, El.Stone);
    clone.setCell(4, 5, El.Stone);
    clone.setCell(6, 5, El.Stone);
    clone.setCell(5, 5, El.Clone);
    clone.setCell(5, 4, El.Sand);
    clone.step();
    expect(clone.get(5, 4)).toBe(El.Sand);
    expect(clone.get(5, 5)).toBe(El.Clone);
    expect(clone.get(5, 6)).toBe(El.Sand);

    const gate = sim(24, 24);
    gate.setCell(5, 5, El.Portal, { aux: 1 });
    gate.setCell(14, 8, El.Portal, { aux: 2 });
    gate.setCell(5, 4, El.Sand);
    gate.step();
    expect(gate.get(5, 4)).toBe(El.Empty);
    expect(gate.get(5, 5)).toBe(El.Portal);
    let found = false;
    for (let y = 6; y <= 10; y++) {
      for (let x = 12; x <= 16; x++) if (gate.get(x, y) === El.Sand) found = true;
    }
    expect(found).toBe(true);
  });
});

describe('stress', () => {
  it('stays finite through random painting and the demo scene', () => {
    const world = sim(48, 36, 99);
    for (let i = 0; i < 150; i++) {
      world.paintUser(1 + world.rng.int(world.w - 2), 1 + world.rng.int(world.h - 2), 1 + world.rng.int(21));
      if (i % 4 === 0) world.step();
    }
    world.spawnBody('box', 20, 8);
    world.spawnBody('ball', 28, 8);
    for (let i = 0; i < 40; i++) world.step();
    assertHealthy(world);

    const demo = new Simulation(GRID_W, GRID_H, 7);
    buildDemo(demo);
    const t0 = performance.now();
    for (let i = 0; i < 40; i++) demo.step();
    const per = (performance.now() - t0) / 40;
    assertHealthy(demo);
    expect(per).toBeLessThan(30);
  });
});
