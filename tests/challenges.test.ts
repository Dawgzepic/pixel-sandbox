import { describe, expect, it } from 'vitest';
import { El } from '../src/sim/elements';
import { Simulation } from '../src/sim/simulation';
import { challengeList, foamReach, startChallenge } from '../src/sim/challenges';

function fresh(): Simulation {
  return new Simulation(36, 48, 8);
}

const SPOILERS = [
  'peroxide', 'iodide', 'soap', 'h2o2', 'hcl', 'naoh', 'ki',
  'catalyst', 'hydrochloric', 'sodium', 'potassium', 'recipe',
];

describe('challenges', () => {
  it('lists one foam goal and does not name the ingredients', () => {
    const list = challengeList();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('giant-foam');
    expect(list[0].name).toBe('Giant Foam');
    expect(list[0].steps).toHaveLength(3);
    const blob = `${list[0].name} ${list[0].goal} ${list[0].steps.join(' ')}`.toLowerCase();
    for (const word of SPOILERS) expect(blob).not.toContain(word);
    const world = fresh();
    const challenge = startChallenge(world, 'giant-foam');
    world.step();
    expect(challenge.won(world)).toBe(false);
    expect(challenge.sample(world).steps).toEqual([false, false, false]);
  });

  it('latches checkpoints from the simulation, not from a click script', () => {
    const world = fresh();
    const challenge = startChallenge(world, 'giant-foam');
    const y = 20;
    for (let x = 8; x <= 16; x++) world.setCell(x, y, El.Stone);
    for (let x = 9; x <= 15; x++) {
      for (let dy = 1; dy <= 4; dy++) world.setCell(x, y - dy, El.Peroxide);
    }
    for (let i = 0; i < 30; i++) {
      world.step();
      challenge.sample(world);
    }
    expect(challenge.sample(world).steps[0]).toBe(true);
    expect(challenge.sample(world).steps[1]).toBe(false);
    expect(challenge.won(world)).toBe(false);

    const fast = fresh();
    const rush = startChallenge(fast, 'giant-foam');
    for (let x = 8; x <= 16; x++) fast.setCell(x, y, El.Stone);
    for (let x = 9; x <= 15; x++) {
      for (let dy = 1; dy <= 4; dy++) fast.setCell(x, y - dy, El.Peroxide);
    }
    fast.setCell(12, y - 2, El.Iodide);
    for (let i = 0; i < 12; i++) {
      fast.step();
      rush.sample(fast);
    }
    const mid = rush.sample(fast);
    expect(mid.steps[0]).toBe(true);
    expect(mid.steps[1]).toBe(true);
    expect(mid.won).toBe(false);
    expect(fast.count(El.Foam)).toBe(0);

    const foamy = fresh();
    const climb = startChallenge(foamy, 'giant-foam');
    for (let x = 8; x <= 16; x++) foamy.setCell(x, y, El.Stone);
    for (let x = 9; x <= 15; x++) {
      for (let dy = 1; dy <= 4; dy++) foamy.setCell(x, y - dy, El.Peroxide);
    }
    foamy.setCell(12, y - 2, El.Iodide);
    for (let x = 9; x <= 15; x++) foamy.setCell(x, y - 5, El.Soap);
    for (let i = 0; i < 20; i++) {
      foamy.step();
      climb.sample(foamy);
    }
    expect(foamReach(foamy)).toBeGreaterThanOrEqual(14);
    expect(foamy.count(El.Foam)).toBeGreaterThanOrEqual(24);
    expect(climb.won(foamy)).toBe(true);
    expect(climb.sample(foamy).steps).toEqual([true, true, true]);
  });
});
