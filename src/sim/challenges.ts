import { El } from './elements';
import type { Simulation } from './simulation';

export interface ChallengeRuntime {
  id: string;
  name: string;
  goal: string;
  won: (sim: Simulation) => boolean;
}

interface ChallengeSpec {
  id: string;
  name: string;
  goal: string;
  setup: (sim: Simulation) => (sim: Simulation) => boolean;
}

const CHALLENGES: ChallengeSpec[] = [
  {
    id: 'put-out-fire',
    name: 'Put out the fire',
    goal: 'Use water. The fire is out when the flames are gone.',
    setup: setupFire,
  },
  {
    id: 'grow-plant',
    name: 'Grow a watered vine',
    goal: 'Reach the line. Each seed drinks the pool, then stops.',
    setup: setupPlant,
  },
  {
    id: 'make-stone',
    name: 'Make stone',
    goal: 'Pour water onto the lava until stone forms.',
    setup: setupStone,
  },
  {
    id: 'power-bulb',
    name: 'Power the bulb',
    goal: 'Connect the battery to the bulb with metal.',
    setup: setupBulb,
  },
  {
    id: 'clear-box',
    name: 'Clear the box with acid',
    goal: 'Dissolve everything inside the stone box.',
    setup: setupAcid,
  },
];

export function challengeList(): Array<{ id: string; name: string; goal: string }> {
  return CHALLENGES.map(({ id, name, goal }) => ({ id, name, goal }));
}

export function startChallenge(sim: Simulation, id: string): ChallengeRuntime {
  const spec = CHALLENGES.find((c) => c.id === id);
  if (!spec) throw new Error(`Unknown challenge ${id}`);
  const won = spec.setup(sim);
  return { id: spec.id, name: spec.name, goal: spec.goal, won };
}

function setupFire(sim: Simulation): (sim: Simulation) => boolean {
  sim.clearAll();
  const y = sim.h - 6;
  const x = Math.floor(sim.w / 2);
  for (let yy = y; yy < sim.h - 1; yy++) {
    for (let xx = 2; xx < sim.w - 2; xx++) sim.setCell(xx, yy, El.Stone);
  }
  for (let dy = 1; dy <= 3; dy++) {
    for (let dx = -1; dx <= 1; dx++) sim.setCell(x + dx, y - dy, El.Wood);
  }
  for (let dx = -1; dx <= 1; dx++) sim.setCell(x + dx, y - 4, El.Fire);
  sim.setCell(x, y - 2, El.Oil);
  sim.resetScores();
  return (s) => s.count(El.Fire) === 0 && s.userPaint[El.Water] > 0;
}

function setupPlant(sim: Simulation): (sim: Simulation) => boolean {
  sim.clearAll();
  const y = sim.h - 2;
  const x = Math.floor(sim.w / 2);
  const goalY = y - 6;
  sim.setCell(x - 1, y, El.Stone);
  sim.setCell(x + 11, y, El.Stone);
  sim.setCell(x, y, El.Seed);
  for (let i = 1; i <= 10; i++) sim.setCell(x + i, y, El.Water);
  for (let xx = x - 4; xx <= x + 4; xx++) {
    if (xx !== x) sim.setCell(xx, goalY, El.Stone);
  }
  sim.resetScores();
  return (s) => {
    for (let xx = 1; xx < s.w - 1; xx++) {
      if (s.get(xx, goalY) === El.Plant || s.get(xx, goalY - 1) === El.Plant) return true;
    }
    return false;
  };
}

function setupStone(sim: Simulation): (sim: Simulation) => boolean {
  sim.clearAll();
  const x0 = Math.max(3, Math.floor(sim.w / 2) - 4);
  const y0 = Math.max(4, Math.floor(sim.h / 2));
  for (let x = x0; x <= x0 + 7; x++) {
    sim.setCell(x, y0, El.Stone);
    sim.setCell(x, y0 + 5, El.Stone);
  }
  for (let y = y0; y <= y0 + 5; y++) {
    sim.setCell(x0, y, El.Stone);
    sim.setCell(x0 + 7, y, El.Stone);
  }
  for (let x = x0 + 1; x <= x0 + 6; x++) {
    for (let y = y0 + 1; y <= y0 + 4; y++) sim.setCell(x, y, El.Lava);
  }
  sim.resetScores();
  return (s) => s.generated[El.Stone] >= 8 && s.userPaint[El.Water] > 0;
}

function setupBulb(sim: Simulation): (sim: Simulation) => boolean {
  sim.clearAll();
  const y = Math.floor(sim.h / 2);
  const x = Math.floor(sim.w / 2) - 4;
  sim.setCell(x, y, El.Battery);
  sim.setCell(x + 7, y, El.Bulb);
  sim.resetScores();
  return (s) => s.userPaint[El.Metal] > 0 && bulbLit(s);
}

function setupAcid(sim: Simulation): (sim: Simulation) => boolean {
  sim.clearAll();
  const x0 = Math.max(3, Math.floor(sim.w / 2) - 4);
  const y0 = Math.max(4, Math.floor(sim.h / 2) - 4);
  const x1 = x0 + 8;
  const y1 = y0 + 8;
  for (let x = x0; x <= x1; x++) {
    sim.setCell(x, y0, El.Stone);
    sim.setCell(x, y1, El.Stone);
  }
  for (let y = y0; y <= y1; y++) {
    sim.setCell(x0, y, El.Stone);
    sim.setCell(x1, y, El.Stone);
  }
  for (let x = x0 + 1; x < x1; x++) {
    for (let y = y0 + 1; y < y1; y++) sim.setCell(x, y, El.Sand);
  }
  // A mouth in the lid so acid can be poured in.
  sim.setCell(x0 + 4, y0, El.Empty);
  sim.setCell(x0 + 3, y0, El.Empty);
  sim.resetScores();
  return (s) => s.userPaint[El.Acid] > 0 && boxClear(s, x0, y0, x1, y1);
}

function bulbLit(sim: Simulation): boolean {
  for (let i = 0; i < sim.type.length; i++) {
    if (sim.type[i] === El.Bulb && sim.charge[i] > 0) return true;
  }
  return false;
}

function boxClear(sim: Simulation, x0: number, y0: number, x1: number, y1: number): boolean {
  for (let y = y0 + 1; y < y1; y++) {
    for (let x = x0 + 1; x < x1; x++) {
      const t = sim.get(x, y);
      if (t === El.Sand || t === El.Wood || t === El.Plant || t === El.Seed) return false;
    }
  }
  return true;
}
