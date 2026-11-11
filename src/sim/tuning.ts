/** Shared knobs. Tests read these so timing tweaks do not become brittle. */
export const TUNING = {
  seedTicks: 24,
  plantGrowTicks: 8,
  plantSpreadEvery: 4,
  bugEatTicks: 10,
  bugCrawlTicks: 8,
  fireLife: 100,
  heatK: 0.08,
  fireInject: 14,
  lavaInject: 5,
  iceChill: 2,
  explodeRadius: 4,
  maxExplosions: 24,
  maxBodies: 36,
} as const;

export const AMBIENT = 20;
export const GRID_W = 100;
export const GRID_H = 168;
export const CHUNK = 8;
