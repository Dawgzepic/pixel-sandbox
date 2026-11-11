/** Shared knobs. Tests read these so timing tweaks do not become brittle. */
export const TUNING = {
  seedTicks: 24,
  /** Plant cells one seed can become, including the sprout itself. */
  seedBudget: 8,
  plantGrowTicks: 8,
  plantSpreadEvery: 4,
  /** Connected oil cells that ignite together as a whoosh. */
  oilBurst: 6,
  bugEatTicks: 10,
  bugCrawlTicks: 8,
  fireLife: 100,
  heatK: 0.08,
  fireInject: 14,
  lavaInject: 5,
  iceChill: 2,
  explodeRadius: 6,
  maxExplosions: 24,
  maxBodies: 36,
} as const;

export const AMBIENT = 20;
export const GRID_W = 100;
export const GRID_H = 168;
export const CHUNK = 8;
