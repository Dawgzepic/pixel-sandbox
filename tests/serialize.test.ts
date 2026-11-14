import { describe, expect, it } from 'vitest';
import { El } from '../src/sim/elements';
import { Simulation } from '../src/sim/simulation';
import { decodeWorld, encodeWorld } from '../src/sim/serialize';

describe('save bytes', () => {
  it('round-trips the grid and temperatures', () => {
    const world = new Simulation(30, 22, 11);
    world.setCell(3, 4, El.Ice);
    world.setTemp(3, 4, -15);
    world.setCell(8, 8, El.Glass, { aux: 2 });
    world.setCell(9, 8, El.Metal);
    world.paintUser(4, 6, El.Water);
    const bytes = encodeWorld(world);
    const copy = new Simulation(30, 22, 1);
    decodeWorld(copy, bytes);
    expect(copy.get(3, 4)).toBe(El.Ice);
    expect(copy.getTemp(3, 4)).toBe(-15);
    expect(copy.get(8, 8)).toBe(El.Glass);
    expect(copy.aux[copy.idx(8, 8)]).toBe(2);
    expect(copy.get(9, 8)).toBe(El.Metal);
    expect(copy.nextPortal).toBe(world.nextPortal);
    expect(copy.frame).toBe(world.frame);
  });

  it('turns removed chemistry into empty space', () => {
    const world = new Simulation(12, 12, 4);
    const removed = [El.Acid, El.Base, El.Salt, El.Saltwater, El.Hydrogen];
    removed.forEach((id, n) => {
      world.type[world.idx(2, 2 + n)] = id;
    });
    const copy = new Simulation(12, 12, 1);
    decodeWorld(copy, encodeWorld(world));
    for (let n = 0; n < removed.length; n++) expect(copy.get(2, 2 + n)).toBe(El.Empty);
    expect(copy.count(El.Acid)).toBe(0);
    expect(copy.count(El.Saltwater)).toBe(0);
  });

  it('rejects a damaged save and a save for another size', () => {
    const world = new Simulation(18, 16, 2);
    world.setCell(3, 3, El.Stone);
    const bytes = encodeWorld(world);
    const bad = bytes.slice();
    bad[24] ^= 0xff;
    const other = new Simulation(18, 16, 2);
    expect(() => decodeWorld(other, bad)).toThrow(/damaged/);
    const small = new Simulation(10, 10, 2);
    expect(() => decodeWorld(small, bytes)).toThrow(/size/);
  });
});
