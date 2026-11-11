import { DEFS, El, elementByName } from '../sim/elements';

export type ToolName =
  | 'Eraser'
  | 'Box'
  | 'Ball'
  | 'Plank'
  | 'Sand'
  | 'Water'
  | 'Oil'
  | 'Acid'
  | 'Fire'
  | 'Gunpowder'
  | 'Wood'
  | 'Seed'
  | 'Plant'
  | 'Bug'
  | 'Metal'
  | 'Battery'
  | 'Bulb'
  | 'Ice'
  | 'Steam'
  | 'Lava'
  | 'Stone'
  | 'Void'
  | 'Clone'
  | 'Portal'
  | 'Wall';

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
  else if (name === 'Box') drawBox(ctx);
  else if (name === 'Ball') drawBall(ctx);
  else if (name === 'Plank') drawPlank(ctx);
  else drawElement(ctx, name);
  cache.set(name, canvas);
  return canvas;
}

function drawElement(ctx: CanvasRenderingContext2D, name: string): void {
  const def = elementByName(name) ?? DEFS[El.Sand];
  const [r, g, b] = def.color;
  const fill = `rgb(${r}, ${g}, ${b})`;
  const dark = `rgb(${Math.max(0, r - 50)}, ${Math.max(0, g - 50)}, ${Math.max(0, b - 40)})`;
  ctx.fillStyle = fill;
  if (def.state === 'liquid' || def.state === 'gas' || name === 'Lava') {
    ctx.fillRect(3, 8, 10, 4);
    ctx.fillRect(4, 6, 8, 2);
    ctx.fillStyle = dark;
    ctx.fillRect(3, 11, 10, 1);
  } else if (def.state === 'powder' || name === 'Seed') {
    for (const [x, y] of [[4, 9], [6, 8], [8, 9], [10, 8], [5, 11], [7, 10], [9, 11], [11, 10]]) {
      ctx.fillRect(x, y, 2, 2);
    }
  } else if (name === 'Fire') {
    ctx.fillRect(7, 3, 2, 3);
    ctx.fillRect(5, 6, 6, 3);
    ctx.fillRect(6, 9, 4, 3);
    ctx.fillStyle = '#ffe38a';
    ctx.fillRect(7, 7, 2, 2);
  } else if (name === 'Plant') {
    ctx.fillStyle = '#6a4a28';
    ctx.fillRect(7, 8, 2, 5);
    ctx.fillStyle = fill;
    ctx.fillRect(4, 4, 3, 3);
    ctx.fillRect(9, 5, 3, 3);
    ctx.fillRect(6, 7, 4, 3);
  } else if (name === 'Bug') {
    ctx.fillRect(5, 6, 6, 4);
    ctx.fillRect(4, 7, 1, 2);
    ctx.fillRect(11, 7, 1, 2);
    ctx.fillStyle = '#1a1022';
    ctx.fillRect(6, 7, 1, 1);
    ctx.fillRect(9, 7, 1, 1);
  } else if (name === 'Battery') {
    ctx.fillStyle = '#d23a3a';
    ctx.fillRect(6, 3, 4, 2);
    ctx.fillStyle = fill;
    ctx.fillRect(4, 5, 8, 7);
    ctx.fillStyle = '#1a1022';
    ctx.fillRect(6, 7, 4, 1);
  } else if (name === 'Bulb') {
    ctx.fillRect(5, 3, 6, 6);
    ctx.fillStyle = '#6a5a3a';
    ctx.fillRect(6, 9, 4, 3);
    ctx.fillStyle = '#fff6b0';
    ctx.fillRect(7, 5, 2, 2);
  } else if (name === 'Portal') {
    ctx.fillStyle = '#2ae0d6';
    ctx.fillRect(3, 4, 4, 8);
    ctx.fillStyle = '#ff4ac4';
    ctx.fillRect(9, 4, 4, 8);
  } else if (name === 'Void') {
    ctx.fillStyle = '#08000e';
    ctx.fillRect(4, 4, 8, 8);
    ctx.strokeStyle = fill;
    ctx.strokeRect(3.5, 3.5, 9, 9);
  } else if (name === 'Clone') {
    ctx.fillRect(3, 6, 4, 4);
    ctx.globalAlpha = 0.7;
    ctx.fillRect(8, 6, 4, 4);
    ctx.globalAlpha = 1;
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

function drawBox(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#a86b3c';
  ctx.fillRect(3, 3, 10, 10);
  ctx.strokeStyle = '#3a2414';
  ctx.strokeRect(3.5, 3.5, 9, 9);
}

function drawBall(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#a86b3c';
  ctx.beginPath();
  ctx.arc(8, 8, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlank(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#a86b3c';
  ctx.fillRect(2, 6, 12, 4);
  ctx.strokeStyle = '#3a2414';
  ctx.strokeRect(2.5, 6.5, 11, 3);
}

export interface PaletteItem {
  name: ToolName;
  blurb: string;
}

export const GROUPS: Array<{ label: string; items: PaletteItem[] }> = [
  { label: 'Powders', items: [item('Sand'), item('Gunpowder')] },
  { label: 'Liquids', items: [item('Water'), item('Oil'), item('Acid')] },
  { label: 'Heat', items: [item('Fire'), item('Lava'), item('Ice'), item('Steam')] },
  { label: 'Solids', items: [item('Wood'), item('Stone'), item('Metal'), item('Wall')] },
  { label: 'Life', items: [item('Seed'), item('Plant'), item('Bug')] },
  { label: 'Power', items: [item('Battery'), item('Bulb')] },
  { label: 'Magic', items: [item('Void'), item('Clone'), item('Portal')] },
  {
    label: 'Objects',
    items: [
      { name: 'Box', blurb: 'A wooden crate. Falls, stacks, burns, and dissolves.' },
      { name: 'Ball', blurb: 'A wooden ball. Rolls, bumps, and splashes liquids aside.' },
      { name: 'Plank', blurb: 'A wooden plank. Tumbles and can lie across a gap.' },
      { name: 'Eraser', blurb: 'Removes elements and objects. Walls included.' },
    ],
  },
];

export const QUICK: ToolName[] = ['Sand', 'Water', 'Oil', 'Acid', 'Fire', 'Lava', 'Wood', 'Stone', 'Metal', 'Seed', 'Eraser'];

function item(name: ToolName): PaletteItem {
  const def = elementByName(name);
  return { name, blurb: def?.blurb ?? name };
}

export function findItem(name: string): PaletteItem | undefined {
  for (const group of GROUPS) {
    const hit = group.items.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (hit) return hit;
  }
  return undefined;
}
