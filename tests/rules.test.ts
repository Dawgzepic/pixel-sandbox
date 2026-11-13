import { describe, expect, it } from 'vitest';
import { DEFS, El, elementByName, elementLabel, RETIRED } from '../src/sim/elements';
import { GROUPS } from '../src/ui/icons';
import { Simulation, assertHealthy } from '../src/sim/simulation';
import { buildDemo } from '../src/sim/demo';
import { GRID_H, GRID_W } from '../src/sim/tuning';

function sim(w = 24, h = 32, seed = 3): Simulation {
  return new Simulation(w, h, seed);
}

const LIVE = [
  El.Water, El.Acid, El.Base, El.Glass, El.MoltenGlass,
  El.Fire, El.Stone, El.Metal, El.Ice, El.Steam, El.Lava, El.Molten, El.Smoke, El.Wall,
];

describe('catalog', () => {
  it('keeps stable ids and shows formulas on the chemistry set', () => {
    expect(DEFS).toHaveLength(34);
    for (let i = 0; i < DEFS.length; i++) expect(DEFS[i].id).toBe(i);
    expect(elementLabel(elementByName('Water')!)).toBe('Water (H2O)');
    expect(elementLabel(elementByName('Hydrochloric acid')!)).toBe('Hydrochloric acid (HCl)');
    expect(elementLabel(elementByName('Sodium hydroxide')!)).toBe('Sodium hydroxide (NaOH)');
    expect(elementLabel(elementByName('Glass')!)).toBe('Glass (SiO2)');
    expect(elementLabel(elementByName('Ice')!)).toBe('Ice (H2O)');
    expect(elementLabel(elementByName('Steam')!)).toBe('Steam (H2O)');
    expect(elementLabel(elementByName('Stone')!)).toBe('Stone');
    expect(elementLabel(elementByName('Metal')!)).toBe('Metal');
    expect(elementLabel(elementByName('Lava')!)).toBe('Lava');
    expect(elementLabel(elementByName('Molten metal')!)).toBe('Molten metal');
    expect(elementLabel(elementByName('Molten glass')!)).toBe('Molten glass');
    const shown = GROUPS.flatMap((group) => group.items.map((item) => item.name));
    for (const gone of ['Sand', 'Seed', 'Plant', 'Bug', 'Void', 'Clone', 'Portal', 'Oil', 'Gunpowder', 'Wood', 'Battery', 'Bulb', 'Hydrogen peroxide', 'Potassium iodide', 'Soap']) {
      expect(shown).not.toContain(gone);
    }
    expect(RETIRED[El.Plant]).toBe(1);
    expect(RETIRED[El.Peroxide]).toBe(1);
    expect(RETIRED[El.Foam]).toBe(1);
    expect(RETIRED[El.Water]).toBe(0);
  });
});

describe('movement', () => {
  it('drops salt straight down through sleeping chunks', () => {
    const world = sim(20, 30);
    world.sleepAll();
    world.setCell(5, 2, El.Salt);
    for (let i = 0; i < 40; i++) world.step();
    expect(world.get(5, world.h - 2)).toBe(El.Salt);
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

  it('keeps water inside a glass dish', () => {
    const world = sim();
    const y = world.h - 2;
    for (let x = 4; x <= 10; x++) world.setCell(x, y, El.Glass);
    world.setCell(4, y - 1, El.Glass);
    world.setCell(10, y - 1, El.Glass);
    world.setCell(4, y - 2, El.Glass);
    world.setCell(10, y - 2, El.Glass);
    for (let x = 5; x <= 9; x++) world.setCell(x, y - 1, El.Water);
    for (let i = 0; i < 30; i++) world.step();
    for (let x = 5; x <= 9; x++) expect(world.get(x, y)).toBe(El.Glass);
    expect(world.count(El.Water)).toBe(5);
    let escaped = false;
    for (let x = 1; x < world.w - 1; x++) {
      if (world.get(x, y - 3) === El.Water || world.get(x, y) === El.Water) escaped = true;
    }
    expect(escaped).toBe(false);
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

  it('heats stone with the fire brush instead of replacing it', () => {
    const world = sim();
    world.setCell(8, 8, El.Stone);
    world.paintUser(8, 8, El.Fire);
    expect(world.get(8, 8)).toBe(El.Stone);
    expect(world.getTemp(8, 8)).toBeGreaterThan(20);

    world.paintUser(10, 8, El.Fire);
    expect(world.get(10, 8)).toBe(El.Fire);

    world.setCell(12, 8, El.Metal);
    world.paintUser(12, 8, El.Lava);
    expect(world.get(12, 8)).toBe(El.Lava);
  });

  it('melts stone into lava when the fire brush is held on it', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(7, y, El.Wall);
    world.setCell(9, y, El.Wall);
    world.setCell(8, y, El.Stone);
    for (let i = 0; i < 80 && world.get(8, y) === El.Stone; i++) {
      world.paintUser(8, y, El.Fire);
      world.step();
    }
    expect(world.get(8, y)).toBe(El.Lava);
    expect(world.getTemp(8, y)).toBeGreaterThan(400);
  });

  it('melts metal into molten metal when the fire brush is held on it', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(7, y, El.Wall);
    world.setCell(9, y, El.Wall);
    world.setCell(8, y, El.Metal);
    let sawGlow = false;
    for (let i = 0; i < 80 && world.get(8, y) === El.Metal; i++) {
      world.paintUser(8, y, El.Fire);
      if (world.getTemp(8, y) > 200) sawGlow = true;
      world.step();
    }
    expect(sawGlow).toBe(true);
    expect(world.get(8, y)).toBe(El.Molten);

    const cooled = sim();
    cooled.setCell(8, 8, El.Metal);
    cooled.setTemp(8, 8, 420);
    for (let i = 0; i < 80; i++) cooled.step();
    expect(cooled.get(8, 8)).toBe(El.Metal);
    expect(cooled.getTemp(8, 8)).toBeLessThan(120);
  });

  it('hardens molten metal in water and turns flowing lava into stone', () => {
    const poured = sim();
    poured.setCell(5, 5, El.Molten);
    poured.paintUser(5, 5, El.Water);
    expect(poured.get(5, 5)).toBe(El.Metal);
    expect(poured.getTemp(5, 5)).toBeGreaterThan(80);
    let steam = false;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      if (poured.get(5 + dx, 5 + dy) === El.Steam) steam = true;
    }
    expect(steam).toBe(true);

    const touch = sim();
    const y = touch.h - 2;
    touch.setCell(4, y, El.Molten);
    touch.setCell(5, y, El.Water);
    touch.step();
    expect(touch.get(4, y)).toBe(El.Metal);
    expect(touch.count(El.Steam)).toBeGreaterThanOrEqual(1);
    expect(touch.count(El.Molten)).toBe(0);

    const falls = sim();
    const floor = falls.h - 2;
    for (let x = 6; x <= 10; x++) falls.setCell(x, floor, El.Water);
    falls.setCell(8, floor - 5, El.Lava);
    for (let i = 0; i < 20; i++) falls.step();
    expect(falls.count(El.Lava)).toBe(0);
    expect(falls.count(El.Stone)).toBeGreaterThan(0);
    expect(falls.count(El.Steam)).toBeGreaterThan(0);

    const metalFalls = sim();
    for (let x = 6; x <= 10; x++) metalFalls.setCell(x, floor, El.Water);
    metalFalls.setCell(8, floor - 5, El.Molten);
    for (let i = 0; i < 20; i++) metalFalls.step();
    expect(metalFalls.count(El.Molten)).toBe(0);
    expect(metalFalls.count(El.Metal)).toBeGreaterThan(0);
    expect(metalFalls.count(El.Steam)).toBeGreaterThan(0);
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

  it('neutralizes acid and base into warm salt and water', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(5, y, El.Acid);
    world.setCell(6, y, El.Base);
    world.step();
    expect(world.count(El.Acid)).toBe(0);
    expect(world.count(El.Base)).toBe(0);
    expect(world.count(El.Salt)).toBe(1);
    expect(world.count(El.Water)).toBe(1);
    let warm = false;
    for (let x = 4; x <= 7; x++) {
      const t = world.get(x, y);
      if ((t === El.Salt || t === El.Water) && world.getTemp(x, y) > 50) warm = true;
    }
    expect(warm).toBe(true);
  });

  it('corrodes metal into hydrogen and leaves stone alone', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(4, y, El.Stone);
    world.setCell(5, y, El.Metal);
    world.setCell(6, y, El.Acid);
    world.setCell(8, 4, El.Wall);
    const steps = DEFS[El.Metal].acidResist + 2;
    for (let i = 0; i < steps; i++) world.step();
    expect(world.count(El.Hydrogen)).toBeGreaterThan(0);
    expect(world.count(El.Metal)).toBe(0);
    expect(world.count(El.Acid)).toBeGreaterThan(0);
    expect(world.get(4, y)).toBe(El.Stone);
    expect(world.get(8, 4)).toBe(El.Wall);
  });

  it('leaves glass intact while acid eats the metal beside it', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(4, y, El.Glass);
    world.setCell(5, y, El.Glass);
    world.setCell(6, y, El.Acid);
    world.setCell(7, y, El.Metal);
    world.setCell(8, y, El.Acid);
    const steps = DEFS[El.Metal].acidResist + 4;
    for (let i = 0; i < steps; i++) world.step();
    expect(world.get(4, y)).toBe(El.Glass);
    expect(world.get(5, y)).toBe(El.Glass);
    expect(world.count(El.Glass)).toBe(2);
    expect(world.count(El.Hydrogen)).toBeGreaterThan(0);
    expect(world.count(El.Metal)).toBe(0);
  });

  it('melts glass under a held fire brush and hardens it in water', () => {
    const world = sim();
    const y = world.h - 2;
    world.setCell(7, y, El.Wall);
    world.setCell(9, y, El.Wall);
    world.setCell(8, y, El.Glass);
    let sawGlow = false;
    for (let i = 0; i < 40 && world.get(8, y) === El.Glass; i++) {
      world.paintUser(8, y, El.Fire);
      if (world.getTemp(8, y) > 200) sawGlow = true;
      world.step();
    }
    expect(sawGlow).toBe(true);
    expect(world.get(8, y)).toBe(El.MoltenGlass);

    const quenched = sim();
    quenched.setCell(5, 8, El.MoltenGlass);
    quenched.paintUser(5, 8, El.Water);
    expect(quenched.get(5, 8)).toBe(El.Glass);
    let steam = false;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      if (quenched.get(5 + dx, 8 + dy) === El.Steam) steam = true;
    }
    expect(steam).toBe(true);
  });

  it('boils water through a glass dish when fire is outside', () => {
    const world = sim(20, 24, 2);
    const y = world.h - 2;
    for (let x = 6; x <= 12; x++) world.setCell(x, y - 1, El.Glass);
    world.setCell(6, y, El.Glass);
    world.setCell(12, y, El.Glass);
    for (let row = 2; row <= 3; row++) {
      world.setCell(6, y - row, El.Glass);
      world.setCell(12, y - row, El.Glass);
    }
    for (let x = 7; x <= 11; x++) world.setCell(x, y - 2, El.Water);
    for (let x = 7; x <= 11; x++) world.setCell(x, y, El.Fire, { aux: 240 });
    expect(world.count(El.Water)).toBe(5);
    let boiled = false;
    for (let i = 0; i < 40 && !boiled; i++) {
      world.step();
      if (world.count(El.Steam) > 0) boiled = true;
    }
    expect(boiled).toBe(true);
    expect(world.count(El.Steam)).toBeGreaterThan(0);
    for (let x = 7; x <= 11; x++) expect(world.get(x, y - 1)).toBe(El.Glass);
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

  it('cools hot stone, faster when water is touching it', () => {
    const dry = sim();
    dry.setCell(8, 8, El.Stone);
    dry.setTemp(8, 8, 420);
    const wet = sim();
    wet.setCell(8, 8, El.Stone);
    wet.setTemp(8, 8, 420);
    wet.setCell(9, 8, El.Water);
    wet.setCell(10, 8, El.Stone);
    wet.setCell(9, 7, El.Stone);
    wet.setCell(9, 9, El.Stone);
    for (let i = 0; i < 12; i++) {
      dry.step();
      wet.step();
    }
    expect(dry.get(8, 8)).toBe(El.Stone);
    expect(dry.getTemp(8, 8)).toBeLessThan(420);
    expect(wet.getTemp(8, 8)).toBeLessThan(dry.getTemp(8, 8));
    for (let i = 0; i < 160; i++) dry.step();
    expect(dry.getTemp(8, 8)).toBeLessThan(80);
  });
});

describe('stress', () => {
  it('stays finite through random painting and the demo scene', () => {
    const world = sim(48, 36, 99);
    for (let i = 0; i < 150; i++) {
      const el = LIVE[world.rng.int(LIVE.length)];
      world.paintUser(1 + world.rng.int(world.w - 2), 1 + world.rng.int(world.h - 2), el);
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
