import { El } from './elements';
import type { Simulation } from './simulation';

/** A small lab bench so the first screen is already full of materials, kept apart. */
export function buildDemo(sim: Simulation): void {
  sim.clearAll();
  const { w, h } = sim;
  if (w < 40 || h < 50) {
    sim.setCell(4, h - 2, El.Stone);
    sim.setCell(8, h - 4, El.Water);
    return;
  }
  const ground = h - 8;
  for (let y = ground; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) sim.setCell(x, y, El.Stone);
  }

  const left = 28;
  for (let y = ground - 4; y < ground; y++) {
    sim.setCell(left, y, El.Ice);
    sim.setCell(left + 1, y, El.Ice);
  }

  const pond = left + 6;
  for (let x = pond; x < pond + 10; x++) {
    for (let y = ground - 4; y < ground; y++) sim.setCell(x, y, El.Water);
  }

  for (let x = pond + 14; x < pond + 20; x++) {
    for (let y = ground - 3; y < ground; y++) sim.setCell(x, y, El.Metal);
  }

  const fx = pond + 24;
  for (let y = ground - 3; y < ground; y++) {
    for (let x = fx; x < fx + 3; x++) sim.setCell(x, y, El.Stone);
  }
  sim.setCell(fx + 1, ground - 4, El.Fire, { aux: 80 });

  cup(sim, 8, ground, 6, 5, El.Acid);
  cup(sim, 80, ground, 6, 5, El.Base);
  cup(sim, pond + 2, ground - 10, 7, 4, El.Peroxide);
  for (let x = pond + 12; x < pond + 16; x++) {
    sim.setCell(x, ground - 11, El.Stone);
    sim.setCell(x, ground - 12, El.Iodide);
  }
  cup(sim, pond + 18, ground - 10, 6, 3, El.Soap);

  const basin = fx + 8;
  for (let x = basin; x <= basin + 8; x++) sim.setCell(x, ground - 6, El.Stone);
  for (let y = ground - 6; y < ground; y++) {
    sim.setCell(basin, y, El.Stone);
    sim.setCell(basin + 8, y, El.Stone);
  }
  for (let x = basin + 1; x <= basin + 7; x++) {
    for (let y = ground - 5; y < ground; y++) sim.setCell(x, y, El.Lava);
  }

  const top = ground;
  sim.spawnBody('box', left + 6, top - 2.5);
  sim.spawnBody('ball', pond + 6, top - 2.15);
  for (const b of sim.bodies) {
    b.asleep = true;
    b.vx = 0;
    b.vy = 0;
    b.av = 0;
  }
  sim.resetScores();
}

function cup(sim: Simulation, x: number, floor: number, width: number, depth: number, fill: number): void {
  const right = x + width;
  const rim = floor - depth - 1;
  for (let xx = x; xx <= right; xx++) sim.setCell(xx, floor, El.Stone);
  for (let y = rim; y <= floor; y++) {
    sim.setCell(x, y, El.Stone);
    sim.setCell(right, y, El.Stone);
  }
  for (let xx = x + 1; xx < right; xx++) {
    for (let y = floor - depth; y < floor; y++) sim.setCell(xx, y, fill);
  }
}
