import { describe, expect, it } from 'vitest';
import { El } from '../src/sim/elements';
import { Simulation } from '../src/sim/simulation';
import { aabbOf } from '../src/sim/physics';

describe('rigid bodies', () => {
  it('lands a crate on the floor without sinking', () => {
    const world = new Simulation(30, 40, 2);
    const box = world.spawnBody('box', 15, 8);
    expect(box).not.toBeNull();
    for (let i = 0; i < 180; i++) world.step();
    expect(world.bodies).toHaveLength(1);
    const body = world.bodies[0];
    expect(body.y).toBeGreaterThan(20);
    expect(body.y + body.hh).toBeLessThanOrEqual(world.h - 1 + 0.2);
    expect(Math.abs(body.vy)).toBeLessThan(0.2);
    const yAfter = body.y;
    for (let i = 0; i < 30; i++) world.step();
    expect(Math.abs(world.bodies[0].y - yAfter)).toBeLessThan(0.2);
  });

  it('stacks a second crate on the first', () => {
    const world = new Simulation(30, 40, 4);
    const lower = world.spawnBody('box', 15, 18);
    const upper = world.spawnBody('box', 15, 8);
    expect(lower && upper).toBeTruthy();
    for (let i = 0; i < 220; i++) world.step();
    expect(world.bodies).toHaveLength(2);
    const [a, b] = world.bodies;
    const bottom = a.y > b.y ? a : b;
    const top = a.y > b.y ? b : a;
    expect(bottom.y + bottom.hh).toBeLessThanOrEqual(world.h - 1 + 0.25);
    expect(top.y + top.hh).toBeLessThanOrEqual(bottom.y - bottom.hh + 0.45);
    expect(top.y).toBeLessThan(bottom.y);
  });

  it('rolls a ball and tumbles a plank onto the floor', () => {
    const world = new Simulation(36, 40, 5);
    const ball = world.spawnBody('ball', 10, 6);
    const plank = world.spawnBody('plank', 24, 7);
    expect(ball && plank).toBeTruthy();
    for (let i = 0; i < 200; i++) world.step();
    const foundBall = world.bodies.find((b) => b.kind === 'ball');
    const foundPlank = world.bodies.find((b) => b.kind === 'plank');
    expect(foundBall).toBeTruthy();
    expect(foundPlank).toBeTruthy();
    expect(foundBall!.y).toBeGreaterThan(20);
    expect(foundBall!.y + foundBall!.hh).toBeLessThanOrEqual(world.h - 1 + 0.3);
    expect(foundPlank!.y).toBeGreaterThan(15);
    expect(foundPlank!.y).toBeLessThan(world.h);
    expect(Number.isFinite(foundPlank!.angle)).toBe(true);
  });

  it('pushes water aside and is destroyed by acid or fire', () => {
    const world = new Simulation(30, 36, 6);
    for (let y = 18; y <= 28; y++) {
      for (let x = 8; x <= 18; x++) world.setCell(x, y, El.Water);
    }
    const before = world.count(El.Water);
    const box = world.spawnBody('box', 13, 8);
    expect(box).not.toBeNull();
    for (let i = 0; i < 160; i++) world.step();
    expect(world.count(El.Water)).toBe(before);
    const body = world.bodies[0];
    expect(body.y).toBeGreaterThan(16);
    let inside = 0;
    const rect = aabbOf(body);
    for (let y = Math.floor(rect.t); y <= Math.floor(rect.b); y++) {
      for (let x = Math.floor(rect.l); x <= Math.floor(rect.r); x++) {
        if (world.inBounds(x, y) && world.get(x, y) === El.Water) inside++;
      }
    }
    expect(inside).toBeLessThan(12);

    const acid = new Simulation(24, 28, 1);
    const rest = acid.h - 1 - 2.5;
    const victim = acid.spawnBody('box', 12, rest);
    expect(victim).not.toBeNull();
    for (let y = acid.h - 8; y < acid.h - 1; y++) {
      for (let x = 8; x <= 16; x++) acid.setCell(x, y, El.Acid);
    }
    for (let i = 0; i < 50; i++) acid.step();
    expect(acid.bodies).toHaveLength(0);

    const burn = new Simulation(24, 28, 1);
    const wood = burn.spawnBody('box', 12, burn.h - 1 - 2.5);
    expect(wood).not.toBeNull();
    for (let y = burn.h - 8; y < burn.h - 1; y++) {
      for (let x = 8; x <= 16; x++) burn.setCell(x, y, El.Lava);
    }
    for (let i = 0; i < 60; i++) burn.step();
    expect(burn.bodies).toHaveLength(0);
  });
});
