import { describe, expect, it } from 'vitest';
import { El } from '../src/sim/elements';
import { Simulation } from '../src/sim/simulation';
import { challengeList, startChallenge } from '../src/sim/challenges';

function fresh(): Simulation {
  return new Simulation(36, 48, 8);
}

describe('challenges', () => {
  it('lists five goals that are not already won', () => {
    expect(challengeList()).toHaveLength(5);
    for (const info of challengeList()) {
      const world = fresh();
      const challenge = startChallenge(world, info.id);
      world.step();
      expect(challenge.won(world)).toBe(false);
    }
  });

  it('accepts water on the campfire and rejects erasing it', () => {
    const world = fresh();
    const challenge = startChallenge(world, 'put-out-fire');
    const fires: Array<[number, number]> = [];
    for (let y = 1; y < world.h - 1; y++) {
      for (let x = 1; x < world.w - 1; x++) if (world.get(x, y) === El.Fire) fires.push([x, y]);
    }
    expect(fires.length).toBeGreaterThan(0);
    for (const [x, y] of fires) world.eraseAt(x, y);
    world.step();
    expect(challenge.won(world)).toBe(false);

    const again = fresh();
    const real = startChallenge(again, 'put-out-fire');
    const spots: Array<[number, number]> = [];
    for (let y = 1; y < again.h - 1; y++) {
      for (let x = 1; x < again.w - 1; x++) if (again.get(x, y) === El.Fire || again.get(x, y) === El.Wood) {
        spots.push([x, y]);
      }
    }
    for (const [x, y] of spots) again.paintUser(x, y, El.Water);
    for (let i = 0; i < 8; i++) again.step();
    expect(real.won(again)).toBe(true);
  });

  it('grows a watered seed to the top', () => {
    const world = fresh();
    const challenge = startChallenge(world, 'grow-plant');
    for (let i = 0; i < 500; i++) {
      world.step();
      if (challenge.won(world)) break;
    }
    expect(challenge.won(world)).toBe(true);
  });

  it('makes stone when water is painted onto lava', () => {
    const world = fresh();
    const challenge = startChallenge(world, 'make-stone');
    const lava: Array<[number, number]> = [];
    for (let y = 1; y < world.h - 1; y++) {
      for (let x = 1; x < world.w - 1; x++) if (world.get(x, y) === El.Lava) lava.push([x, y]);
    }
    for (let i = 0; i < 8; i++) world.paintUser(lava[i][0], lava[i][1], El.Water);
    expect(challenge.won(world)).toBe(true);
  });

  it('powers the bulb once metal joins the gap', () => {
    const world = fresh();
    const challenge = startChallenge(world, 'power-bulb');
    let bx = 0;
    let by = 0;
    let ux = 0;
    let uy = 0;
    for (let y = 1; y < world.h - 1; y++) {
      for (let x = 1; x < world.w - 1; x++) {
        if (world.get(x, y) === El.Battery) {
          bx = x;
          by = y;
        }
        if (world.get(x, y) === El.Bulb) {
          ux = x;
          uy = y;
        }
      }
    }
    expect(uy).toBe(by);
    for (let x = bx + 1; x < ux; x++) world.paintUser(x, by, El.Metal);
    world.step();
    expect(challenge.won(world)).toBe(true);
  });

  it('clears a sand box when acid is poured in', () => {
    const world = fresh();
    const challenge = startChallenge(world, 'clear-box');
    const sand: Array<[number, number]> = [];
    for (let y = 1; y < world.h - 1; y++) {
      for (let x = 1; x < world.w - 1; x++) if (world.get(x, y) === El.Sand) sand.push([x, y]);
    }
    expect(sand.length).toBeGreaterThan(4);
    // Pour a pocket of acid into the pile and let it eat.
    for (let i = 0; i < Math.min(6, sand.length); i++) world.paintUser(sand[i][0], sand[i][1], El.Acid);
    for (let i = 0; i < 240; i++) world.step();
    expect(challenge.won(world)).toBe(true);
  });
});
