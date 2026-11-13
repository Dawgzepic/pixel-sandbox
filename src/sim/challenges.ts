import { El } from './elements';
import type { Simulation } from './simulation';

export interface ChallengeRuntime {
  id: string;
  name: string;
  goal: string;
  /** Observation lines. They describe what is happening, not which materials to use. */
  steps: readonly string[];
  /** Latched checkpoint flags, index-aligned with `steps`. */
  sample: (sim: Simulation) => { steps: boolean[]; won: boolean };
  won: (sim: Simulation) => boolean;
}

interface ChallengeSpec {
  id: string;
  name: string;
  goal: string;
  steps: readonly string[];
  setup: (sim: Simulation) => ChallengeRuntime['sample'];
}

const STEPS = [
  'A gas is coming off a liquid.',
  'That release is happening fast.',
  'The gas is trapped and rising as foam.',
] as const;

const CHALLENGES: ChallengeSpec[] = [
  {
    id: 'giant-foam',
    name: 'Giant Foam',
    goal: 'Make a tall column of foam climb out of the dish.',
    steps: STEPS,
    setup: setupFoam,
  },
];

export function challengeList(): Array<{ id: string; name: string; goal: string; steps: readonly string[] }> {
  return CHALLENGES.map(({ id, name, goal, steps }) => ({ id, name, goal, steps }));
}

export function startChallenge(sim: Simulation, id: string): ChallengeRuntime {
  const spec = CHALLENGES.find((c) => c.id === id);
  if (!spec) throw new Error(`Unknown challenge ${id}`);
  const sample = spec.setup(sim);
  return {
    id: spec.id,
    name: spec.name,
    goal: spec.goal,
    steps: spec.steps,
    sample,
    won: (world) => sample(world).won,
  };
}

/** How far the foam cloud stretches upward. A flat skin stays short. */
export function foamReach(sim: Simulation): number {
  let top = sim.h;
  let bottom = -1;
  for (let y = 1; y < sim.h - 1; y++) {
    for (let x = 1; x < sim.w - 1; x++) {
      if (sim.get(x, y) !== El.Foam) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (bottom < 0) return 0;
  return bottom - top + 1;
}

function setupFoam(sim: Simulation): ChallengeRuntime['sample'] {
  sim.clearAll();
  const floor = sim.h - 2;
  const left = Math.max(2, Math.floor(sim.w / 2) - 6);
  const right = Math.min(sim.w - 3, left + 12);
  const rim = Math.max(2, floor - 16);
  for (let x = left; x <= right; x++) sim.setCell(x, floor, El.Stone);
  for (let y = rim; y <= floor; y++) {
    sim.setCell(left, y, El.Stone);
    sim.setCell(right, y, El.Stone);
  }
  sim.resetScores();

  let seenGas = false;
  let seenFast = false;
  let won = false;
  let lastFast = 0;
  const window: number[] = [];
  let cachedFrame = -1;
  let cached = { steps: [false, false, false], won: false };

  return (world) => {
    if (world.frame === cachedFrame) return cached;
    cachedFrame = world.frame;
    const delta = world.gasFast - lastFast;
    lastFast = world.gasFast;
    window.push(Math.max(0, delta));
    if (window.length > 12) window.shift();
    const rate = window.reduce((sum, value) => sum + value, 0);
    if (world.gasSlow + world.gasFast >= 3) seenGas = true;
    if (seenGas && rate >= 6) seenFast = true;
    if (foamReach(world) >= 14 && world.count(El.Foam) >= 24) won = true;
    cached = { steps: [seenGas, seenFast, won], won };
    return cached;
  };
}
