import { CONDUCTIVE, El } from './elements';
import type { Simulation } from './simulation';

/** Batteries push charge through metal and bulbs. Called every step and while paused. */
export function stepElectricity(sim: Simulation): void {
  const { charge, type, w, h } = sim;
  for (let i = 0; i < charge.length; i++) {
    if (charge[i] === 0) continue;
    sim.markVisual(i % w, (i / w) | 0);
    charge[i] = 0;
  }
  if (sim.count(El.Battery) === 0) return;

  const queue: number[] = [];
  for (let i = 0; i < type.length; i++) {
    if (type[i] !== El.Battery) continue;
    charge[i] = 2;
    queue.push(i);
    sim.markVisual(i % w, (i / w) | 0);
  }

  let q = 0;
  while (q < queue.length) {
    const i = queue[q++];
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) visit(i - 1);
    if (x + 1 < w) visit(i + 1);
    if (y > 0) visit(i - w);
    if (y + 1 < h) visit(i + w);
  }

  function visit(i: number): void {
    if (charge[i] !== 0) return;
    if (!CONDUCTIVE[type[i]]) return;
    charge[i] = 1;
    queue.push(i);
    sim.markVisual(i % w, (i / w) | 0);
  }
}
