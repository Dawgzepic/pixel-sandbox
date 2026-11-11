import { El } from './elements';
import type { Simulation } from './simulation';

/** A small diorama so the first screen is already alive. */
export function buildDemo(sim: Simulation): void {
  sim.clearAll();
  const { w, h } = sim;
  if (w < 40 || h < 50) {
    sim.setCell(4, h - 2, El.Sand);
    sim.setCell(8, h - 4, El.Water);
    return;
  }
  const ground = h - 8;
  for (let y = ground; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) sim.setCell(x, y, El.Stone);
  }

  // The opening camera looks at this band, so the diorama sits in one neighborhood.
  const left = 28;
  for (let x = left; x < left + 12; x++) {
    const crest = ground - Math.floor(6 * Math.sin(((x - left) / 12) * Math.PI));
    for (let y = crest; y < ground; y++) sim.setCell(x, y, El.Sand);
  }
  sim.setCell(left + 2, ground - 1, El.Bug);
  sim.setCell(left + 4, ground - 1, El.Plant);
  for (let y = ground - 3; y < ground; y++) {
    sim.setCell(left - 2, y, El.Ice);
    sim.setCell(left - 1, y, El.Ice);
  }
  for (let x = left + 8; x <= left + 10; x++) {
    for (let y = ground - 2; y < ground; y++) sim.setCell(x, y, El.Gunpowder);
  }

  const pond = left + 14;
  for (let x = pond; x < pond + 12; x++) {
    for (let y = ground - 5; y < ground; y++) sim.setCell(x, y, El.Water);
  }
  for (let x = pond + 1; x < pond + 8; x++) sim.setCell(x, ground - 6, El.Oil);

  const tx = pond + 14;
  for (let y = ground - 16; y < ground; y++) sim.setCell(tx, y, El.Plant);
  sim.setCell(tx - 1, ground - 1, El.Water);
  sim.setCell(tx + 1, ground - 1, El.Water);

  const fx = tx + 6;
  for (let dy = 1; dy <= 4; dy++) {
    for (let dx = -1; dx <= 1; dx++) sim.setCell(fx + dx, ground - dy, El.Wood);
  }
  for (let dx = -1; dx <= 1; dx++) sim.setCell(fx + dx, ground - 5, El.Fire);
  sim.setCell(fx, ground - 3, El.Oil);

  const basin = fx + 8;
  for (let x = basin; x <= basin + 10; x++) sim.setCell(x, ground - 7, El.Stone);
  for (let y = ground - 7; y < ground; y++) {
    sim.setCell(basin, y, El.Stone);
    sim.setCell(basin + 10, y, El.Stone);
  }
  for (let x = basin + 1; x <= basin + 9; x++) {
    for (let y = ground - 6; y < ground; y++) sim.setCell(x, y, El.Lava);
  }
  sim.setCell(basin + 5, ground - 9, El.Steam);

  for (let x = left - 6; x <= left; x++) sim.setCell(x, ground - 10, El.Stone);
  sim.setCell(left - 6, ground - 9, El.Stone);
  sim.setCell(left - 6, ground - 8, El.Stone);
  sim.setCell(left, ground - 9, El.Stone);
  sim.setCell(left, ground - 8, El.Stone);
  for (let x = left - 5; x < left; x++) {
    sim.setCell(x, ground - 9, El.Acid);
    sim.setCell(x, ground - 8, El.Acid);
  }

  sim.setCell(pond, ground - 14, El.Battery);
  for (let x = pond + 1; x <= pond + 8; x++) sim.setCell(x, ground - 14, El.Metal);
  sim.setCell(pond + 9, ground - 14, El.Bulb);

  sim.setCell(left + 4, ground - 28, El.Portal, { aux: 1 });
  sim.setCell(basin + 4, ground - 22, El.Portal, { aux: 2 });

  const cx = pond + 4;
  const cy = ground - 32;
  for (let x = cx - 3; x <= cx + 3; x++) {
    for (let y = cy - 3; y <= cy + 3; y++) sim.setCell(x, y, El.Wall);
  }
  for (let x = cx - 2; x <= cx + 2; x++) {
    for (let y = cy - 2; y <= cy + 2; y++) sim.setCell(x, y, El.Empty);
  }
  sim.setCell(cx, cy, El.Clone);
  sim.setCell(cx, cy - 1, El.Sand);

  const vx = fx;
  const vy = ground - 26;
  for (let x = vx - 2; x <= vx + 2; x++) {
    for (let y = vy - 2; y <= vy + 2; y++) sim.setCell(x, y, El.Wall);
  }
  sim.setCell(vx, vy, El.Void);

  const top = ground;
  sim.spawnBody('box', left + 6, top - 2.5);
  sim.spawnBody('box', left + 6, top - 7.5);
  sim.spawnBody('ball', pond + 6, top - 2.15);
  sim.spawnBody('plank', left + 6, top - 10.75);
  for (const b of sim.bodies) {
    b.asleep = true;
    b.vx = 0;
    b.vy = 0;
    b.av = 0;
  }
  sim.resetScores();
}
