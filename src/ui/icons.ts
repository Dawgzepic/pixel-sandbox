import { DEFS, El, elementByName, elementLabel } from '../sim/elements';

export type ToolName =
  | 'Eraser'
  | 'Warmer'
  | 'Cooler'
  | 'Water'
  | 'Glass'
  | 'Molten glass'
  | 'Fire'
  | 'Smoke'
  | 'Metal'
  | 'Molten metal'
  | 'Ice'
  | 'Steam'
  | 'Lava'
  | 'Stone';

const cache = new Map<string, HTMLCanvasElement>();

export function iconCanvas(name: string): HTMLCanvasElement {
  const hit = cache.get(name);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#1a1022';
  ctx.fillRect(0, 0, 16, 16);
  if (name === 'Eraser') drawEraser(ctx);
  else if (name === 'Warmer') drawWarmer(ctx);
  else if (name === 'Cooler') drawCooler(ctx);
  else drawElement(ctx, name);
  cache.set(name, canvas);
  return canvas;
}

function drawElement(ctx: CanvasRenderingContext2D, name: string): void {
  const def = elementByName(name) ?? DEFS[El.Water];
  const [r, g, b] = def.color;
  const fill = `rgb(${r}, ${g}, ${b})`;
  const dark = `rgb(${Math.max(0, r - 50)}, ${Math.max(0, g - 50)}, ${Math.max(0, b - 40)})`;
  ctx.fillStyle = fill;
  if (def.state === 'liquid' || def.state === 'gas' || def.state === 'foam' || name === 'Lava' || name === 'Molten metal') {
    ctx.fillRect(3, 8, 10, 4);
    ctx.fillRect(4, 6, 8, 2);
    ctx.fillStyle = dark;
    ctx.fillRect(3, 11, 10, 1);
  } else if (def.state === 'powder') {
    for (const [x, y] of [[4, 9], [6, 8], [8, 9], [10, 8], [5, 11], [7, 10], [9, 11], [11, 10]]) {
      ctx.fillRect(x, y, 2, 2);
    }
  } else if (name === 'Smoke') {
    ctx.fillStyle = '#8a8694';
    ctx.fillRect(5, 7, 3, 3);
    ctx.fillRect(8, 5, 4, 3);
    ctx.fillStyle = '#c8c4ce';
    ctx.fillRect(6, 4, 3, 2);
  } else if (name === 'Glass') {
    ctx.fillStyle = '#7eb8cc';
    ctx.fillRect(4, 4, 8, 8);
    ctx.fillStyle = '#e7fbff';
    ctx.fillRect(5, 5, 2, 6);
    ctx.fillStyle = '#16303a';
    ctx.fillRect(8, 6, 1, 4);
  } else if (name === 'Fire') {
    ctx.fillRect(7, 3, 2, 3);
    ctx.fillRect(5, 6, 6, 3);
    ctx.fillRect(6, 9, 4, 3);
    ctx.fillStyle = '#ffe38a';
    ctx.fillRect(7, 7, 2, 2);
  } else {
    ctx.fillRect(4, 4, 8, 8);
    ctx.fillStyle = dark;
    ctx.fillRect(4, 10, 8, 2);
    ctx.fillRect(4, 4, 2, 8);
  }
}

function drawEraser(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = '#ff8aa8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4, 4);
  ctx.lineTo(12, 12);
  ctx.moveTo(12, 4);
  ctx.lineTo(4, 12);
  ctx.stroke();
}

function drawWarmer(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#ff8a3c';
  ctx.fillRect(7, 3, 2, 4);
  ctx.fillRect(5, 6, 6, 3);
  ctx.fillRect(6, 9, 4, 3);
  ctx.fillStyle = '#ffe38a';
  ctx.fillRect(7, 7, 2, 2);
}

function drawCooler(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#9ad7ff';
  ctx.fillRect(7, 3, 2, 2);
  ctx.fillRect(5, 6, 6, 2);
  ctx.fillRect(6, 9, 4, 2);
  ctx.fillRect(7, 12, 2, 2);
  ctx.fillStyle = '#e7fbff';
  ctx.fillRect(7, 6, 2, 2);
}

export interface PaletteItem {
  name: ToolName;
  label: string;
  blurb: string;
}

export const GROUPS: Array<{ label: string; items: PaletteItem[] }> = [
  {
    label: 'Liquids',
    items: [item('Water')],
  },
  { label: 'Solids', items: [item('Stone'), item('Glass'), item('Metal'), item('Ice')] },
  { label: 'Heat', items: [item('Fire'), item('Lava'), item('Molten metal'), item('Molten glass'), item('Steam'), item('Smoke')] },
  {
    label: 'Tools',
    items: [
      { name: 'Warmer', label: 'Warmer', blurb: 'Heats whatever is already there. Hold it to boil water. It does not melt glass.' },
      { name: 'Cooler', label: 'Cooler', blurb: 'Cools whatever is already there. Hold it to freeze water into ice.' },
      { name: 'Eraser', label: 'Eraser', blurb: 'Removes elements. The outline shows the brush.' },
    ],
  },
];

export const OUTLINE_TOOLS: ReadonlySet<ToolName> = new Set(['Eraser', 'Warmer', 'Cooler']);

export const QUICK: ToolName[] = [
  'Water',
  'Glass',
  'Fire',
  'Stone',
  'Metal',
  'Eraser',
];

function item(name: ToolName): PaletteItem {
  const def = elementByName(name);
  return { name, label: def ? elementLabel(def) : name, blurb: def?.blurb ?? name };
}

export function findItem(name: string): PaletteItem | undefined {
  for (const group of GROUPS) {
    const hit = group.items.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (hit) return hit;
  }
  return undefined;
}
