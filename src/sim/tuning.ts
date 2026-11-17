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
  /** Heat added to a cell each time the fire brush is held on it. */
  fireBrush: 110,
  /** Fire and Warmer warm a glass dish. They never melt it. */
  glassHeat: 4,
  /**
   * Lava against glass advances the melt counter once every this many steps.
   * With glassLavaTicks, contact lasts much longer than ice in a flame.
   */
  glassLavaStride: 2,
  /** Melt steps of lava contact before glass becomes molten. Fits in a byte. */
  glassLavaTicks: 255,
  /** Points of moisture before solid rust crumbles. Fits in a byte. */
  crumbleTicks: 255,
  /** Sub-steps before wet rust gains crumble points. A little slower than the rust itself. */
  crumbleStride: 24,
  /** Salt units in one solid grain. Three saturated cells boil back into one grain. */
  saltGrain: 12,
  /** Salt units one water cell can hold. A grain fills three cells. */
  saltCap: 4,
  /** Steps between a salty cell sharing one unit with a fresher neighbor. */
  saltMixStride: 8,
  /**
   * Sub-steps before wet metal gains rust points. A fully salty neighbor
   * adds saltCap points, so one pixel takes about twenty seconds at 1x.
   */
  rustStride: 20,
  /** Extra sub-steps plain water must wait. It rusts much more slowly than brine. */
  rustWaterSlow: 4,
  /** Rust points before wet metal becomes solid rust. Fits in a byte. */
  rustTicks: 255,
  /**
   * A burning piece loses one tick of life every this many steps.
   * Life itself is woodBurnTicks, so one piece lasts several times longer than a short flame.
   */
  woodBurnStride: 6,
  /** Ticks of life in one piece of wood. Fits in a byte. With the stride, about six times a 240-step burn. */
  woodBurnTicks: 240,
  /** Life ticks between a burning piece lighting a neighboring piece. */
  woodSpreadTicks: 16,
  /** Warmer or a hot neighbor lights wood once it passes this temperature. */
  woodIgnite: 280,
  /** Cooler drop applied to lava and molten material so a hold can solidify it. */
  coolerMolten: 90,
  /** Warmer brush. Boils water after a short hold, not in one tap. */
  warmer: 16,
  /** Cooler brush. Freezes water only after the temperature is held down. */
  cooler: 2,
  lavaInject: 5,
  iceChill: 2,
  explodeRadius: 6,
  maxExplosions: 24,
  maxBodies: 36,
} as const;

/** Salt units stored on a saltwater cell. Older saves used 0 for a full mix. */
export function saltUnits(aux: number): number {
  if (aux <= 0 || aux > TUNING.saltCap) return TUNING.saltCap;
  return aux;
}

export const AMBIENT = 20;
export const GRID_W = 100;
export const GRID_H = 168;
export const CHUNK = 8;
