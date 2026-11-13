import { describe, expect, it } from 'vitest';
import { El } from '../src/sim/elements';
import { Simulation } from '../src/sim/simulation';
import { decodeWorld, encodeWorld } from '../src/sim/serialize';

describe('save bytes', () => {
  it('round-trips the grid, temperatures, and bodies', () => {
    const world = new Simulation(30, 22, 11);
    world.setCell(3, 4, El.Ice);
    world.setTemp(3, 4, -15);
    world.setCell(8, 8, El.Glass, { aux: 2 });
    world.setCell(9, 8, El.Salt);
    world.paintUser(4, 6, El.Water);
    const body = world.spawnBody('ball', 12, 6);
    expect(body).not.toBeNull();
    body!.vx = 0.25;
    body!.health = 40;
    const bytes = encodeWorld(world);
    const copy = new Simulation(30, 22, 1);
    decodeWorld(copy, bytes);
    expect(copy.get(3, 4)).toBe(El.Ice);
    expect(copy.getTemp(3, 4)).toBe(-15);
    expect(copy.get(8, 8)).toBe(El.Glass);
    expect(copy.aux[copy.idx(8, 8)]).toBe(2);
    expect(copy.get(9, 8)).toBe(El.Salt);
    expect(copy.bodies).toHaveLength(1);
    expect(copy.bodies[0].kind).toBe('ball');
    expect(copy.bodies[0].x).toBeCloseTo(12);
    expect(copy.bodies[0].vx).toBeCloseTo(0.25);
    expect(copy.bodies[0].health).toBeCloseTo(40);
    expect(copy.nextPortal).toBe(world.nextPortal);
    expect(copy.frame).toBe(world.frame);
  });

  it('rejects a damaged save and a save for another size', () => {
    const world = new Simulation(18, 16, 2);
    world.setCell(3, 3, El.Salt);
    const bytes = encodeWorld(world);
    const bad = bytes.slice();
    bad[24] ^= 0xff;
    const other = new Simulation(18, 16, 2);
    expect(() => decodeWorld(other, bad)).toThrow(/damaged/);
    const small = new Simulation(10, 10, 2);
    expect(() => decodeWorld(small, bytes)).toThrow(/size/);
  });
});
