import { DEFS, El, GLOW } from '../sim/elements';
import type { Simulation } from '../sim/simulation';
import type { Body } from '../sim/physics';
import type { View } from './camera';

const LUT = buildLut();

function buildLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(DEFS.length * 16 * 3);
  for (const def of DEFS) {
    for (let v = 0; v < 16; v++) {
      const delta = ((v - 8) / 8) * def.variance;
      const o = (def.id * 16 + v) * 3;
      lut[o] = clamp8(def.color[0] + delta);
      lut[o + 1] = clamp8(def.color[1] + delta * 0.85);
      lut[o + 2] = clamp8(def.color[2] + delta * 0.65);
    }
  }
  return lut;
}

/** Dull red, then orange, then yellow-white as metal approaches melting. */
function metalHot(heat: number): [number, number, number] {
  if (heat < 0.45) {
    const u = heat / 0.45;
    return [120 + 100 * u, 28 + 80 * u, 32 * (1 - u)];
  }
  const u = (heat - 0.45) / 0.55;
  return [220 + 35 * u, 108 + 140 * u, 20 + 220 * u];
}

function clamp8(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n | 0;
}

function tempRgb(temp: number): [number, number, number] {
  const stops: Array<[number, [number, number, number]]> = [
    [-30, [30, 60, 170]],
    [0, [70, 140, 230]],
    [25, [40, 180, 170]],
    [80, [80, 190, 60]],
    [140, [230, 190, 40]],
    [280, [240, 90, 24]],
    [700, [255, 240, 210]],
  ];
  if (temp <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    const [t0, c0] = stops[i - 1];
    if (temp <= t1) {
      const u = (temp - t0) / (t1 - t0);
      return [
        c0[0] + (c1[0] - c0[0]) * u,
        c0[1] + (c1[1] - c0[1]) * u,
        c0[2] + (c1[2] - c0[2]) * u,
      ];
    }
  }
  return stops[stops.length - 1][1];
}

/** Draws the grid into a 1:1 pixel buffer, dirty chunk by dirty chunk. */
export class Renderer {
  readonly buffer: HTMLCanvasElement;
  private readonly bctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private tempMode = false;

  constructor(private readonly sim: Simulation) {
    this.buffer = document.createElement('canvas');
    this.buffer.width = sim.w;
    this.buffer.height = sim.h;
    const ctx = this.buffer.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas is not available.');
    this.bctx = ctx;
    this.image = ctx.createImageData(sim.w, sim.h);
    sim.visualDirty.fill(1);
  }

  invalidate(): void {
    this.sim.visualDirty.fill(1);
  }

  setTemperature(on: boolean): void {
    if (on === this.tempMode) return;
    this.tempMode = on;
    this.invalidate();
  }

  /** Update dirty chunks, then paint the visible window and rigid bodies. */
  present(
    screen: CanvasRenderingContext2D,
    view: View,
    dpr: number,
    preview: Array<[number, number]> | null,
    previewRgb: [number, number, number],
  ): void {
    this.syncChunks();
    const cssW = screen.canvas.width / dpr;
    const cssH = screen.canvas.height / dpr;
    screen.setTransform(dpr, 0, 0, dpr, 0, 0);
    screen.imageSmoothingEnabled = false;
    screen.fillStyle = '#100814';
    screen.fillRect(0, 0, cssW, cssH);
    screen.drawImage(
      this.buffer,
      view.camX,
      view.camY,
      view.viewW,
      view.viewH,
      view.ox,
      view.oy,
      view.dw,
      view.dh,
    );
    this.drawBodies(screen, view);
    if (preview) this.drawPreview(screen, view, preview, previewRgb);
    if (this.sim.flash > 0) {
      screen.fillStyle = `rgba(255, 236, 190, ${Math.min(0.55, this.sim.flash / 8)})`;
      screen.fillRect(view.ox, view.oy, view.dw, view.dh);
    }
  }

  private syncChunks(): void {
    const { sim } = this;
    const dirty: number[] = [];
    for (let i = 0; i < sim.visualDirty.length; i++) {
      if (sim.visualDirty[i] === 0) continue;
      dirty.push(i);
      sim.visualDirty[i] = 0;
    }
    if (dirty.length === 0) return;
    const data = this.image.data;
    let minX = sim.w;
    let minY = sim.h;
    let maxX = 0;
    let maxY = 0;
    for (const id of dirty) {
      const cx = id % sim.chunkCols;
      const cy = (id / sim.chunkCols) | 0;
      const x0 = cx * 8;
      const y0 = cy * 8;
      const x1 = Math.min(sim.w, x0 + 8);
      const y1 = Math.min(sim.h, y0 + 8);
      if (x0 < minX) minX = x0;
      if (y0 < minY) minY = y0;
      if (x1 > maxX) maxX = x1;
      if (y1 > maxY) maxY = y1;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) this.writePixel(data, x, y);
      }
    }
    for (const id of dirty) this.writeGlow(data, id);
    minX = Math.max(0, minX - 1);
    minY = Math.max(0, minY - 1);
    maxX = Math.min(sim.w, maxX + 1);
    maxY = Math.min(sim.h, maxY + 1);
    const dw = Math.max(1, maxX - minX);
    const dh = Math.max(1, maxY - minY);
    if (dw * dh > sim.w * sim.h * 0.65) {
      this.bctx.putImageData(this.image, 0, 0);
    } else {
      this.bctx.putImageData(this.image, 0, 0, minX, minY, dw, dh);
    }
  }

  private writePixel(data: Uint8ClampedArray, x: number, y: number): void {
    const { sim } = this;
    const i = sim.idx(x, y);
    const t = sim.type[i];
    const p = i * 4;
    let r: number;
    let g: number;
    let b: number;
    if (this.tempMode) {
      const empty = t === El.Empty;
      const calm = empty && Math.abs(sim.temp[i] - 20) < 8;
      if (calm) {
        r = 14;
        g = 18;
        b = 28;
      } else {
        const [tr, tg, tb] = tempRgb(sim.temp[i]);
        const shade = empty ? 0.55 : 1;
        r = tr * shade;
        g = tg * shade;
        b = tb * shade;
      }
    } else if (t === El.Fire) {
      const flick = (sim.frame * 3 + x * 5 + y * 2) & 7;
      r = 255;
      g = 70 + flick * 22;
      b = 16 + (flick & 3) * 14;
    } else if (t === El.Smoke) {
      const puff = 90 + (sim.aux[i] % 28) + ((x + y + sim.frame) & 3) * 6;
      r = puff;
      g = puff - 4;
      b = puff + 6;
    } else if (t === El.Stone) {
      const heat = Math.max(0, Math.min(1, (sim.temp[i] - 40) / 460));
      r = 118 + (255 - 118) * heat;
      g = 118 + (64 - 118) * heat;
      b = 132 + (28 - 132) * heat;
    } else if (t === El.Metal) {
      const heat = Math.max(0, Math.min(1, (sim.temp[i] - 70) / 980));
      if (heat > 0.04) {
        const hot = metalHot(heat);
        r = hot[0];
        g = hot[1];
        b = hot[2];
      } else if (sim.charge[i] > 0) {
        r = 150;
        g = 214;
        b = 255;
      } else {
        const o = (t * 16 + sim.variation[i]) * 3;
        r = LUT[o];
        g = LUT[o + 1];
        b = LUT[o + 2];
      }
    } else if (t === El.Molten) {
      const heat = Math.max(0, Math.min(1, (sim.temp[i] - 700) / 500));
      r = 255;
      g = 110 + heat * 130;
      b = 28 + heat * 90;
    } else if (t === El.Empty) {
      r = 16;
      g = 8;
      b = 22;
    } else if (t === El.Glass) {
      const heat = Math.max(0, Math.min(1, (sim.temp[i] - 40) / 500));
      const pane = ((x + y + sim.variation[i]) & 3) === 0;
      r = (pane ? 214 : 96) + (255 - (pane ? 214 : 96)) * heat;
      g = (pane ? 236 : 150) + (150 - (pane ? 236 : 150)) * heat;
      b = (pane ? 244 : 176) + (48 - (pane ? 244 : 176)) * heat;
    } else if (t === El.MoltenGlass) {
      const heat = Math.max(0, Math.min(1, (sim.temp[i] - 700) / 500));
      r = 255;
      g = 170 + heat * 70;
      b = 70 + heat * 80;
    } else {
      const o = (t * 16 + sim.variation[i]) * 3;
      r = LUT[o];
      g = LUT[o + 1];
      b = LUT[o + 2];
    }
    data[p] = clamp8(r);
    data[p + 1] = clamp8(g);
    data[p + 2] = clamp8(b);
    data[p + 3] = 255;
  }

  private writeGlow(data: Uint8ClampedArray, chunkId: number): void {
    if (this.tempMode) return;
    const { sim } = this;
    const cx = chunkId % sim.chunkCols;
    const cy = (chunkId / sim.chunkCols) | 0;
    const x0 = cx * 8;
    const y0 = cy * 8;
    const x1 = Math.min(sim.w, x0 + 8);
    const y1 = Math.min(sim.h, y0 + 8);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = sim.idx(x, y);
        const t = sim.type[i];
        let glow = GLOW[t];
        let power = 0.28;
        if (t === El.Stone) {
          const heat = Math.max(0, Math.min(1, (sim.temp[i] - 50) / 420));
          if (heat > 0.08) {
            glow = 1;
            power = heat * 0.55;
          }
        }
        if (t === El.Metal || t === El.Glass) {
          const heat = Math.max(0, Math.min(1, (sim.temp[i] - 70) / 980));
          if (heat > 0.08) {
            glow = 1;
            power = 0.22 + heat * 0.5;
          }
        }
        if (!glow) continue;
        const hot = glow === 1;
        const magic = glow === 3;
        const cr = hot ? 255 : magic ? 210 : 120;
        const cg = hot ? 120 : magic ? 80 : 190;
        const cb = hot ? 30 : magic ? 255 : 255;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const nx = x + ox;
            const ny = y + oy;
            if (!sim.inBounds(nx, ny)) continue;
            const q = sim.idx(nx, ny) * 4;
            const fall = ox === 0 && oy === 0 ? 1 : 0.45;
            data[q] = clamp8(data[q] + cr * power * fall);
            data[q + 1] = clamp8(data[q + 1] + cg * power * fall);
            data[q + 2] = clamp8(data[q + 2] + cb * power * fall);
          }
        }
      }
    }
  }

  private drawBodies(screen: CanvasRenderingContext2D, view: View): void {
    for (const body of this.sim.bodies) this.drawBody(screen, view, body);
  }

  private drawBody(screen: CanvasRenderingContext2D, view: View, body: Body): void {
    const center = worldToCss(body.x, body.y, view);
    screen.save();
    screen.translate(center.x, center.y);
    screen.rotate(body.angle);
    const cracked = body.health < body.maxHealth * 0.45;
    screen.fillStyle = cracked ? '#6a3a22' : '#a86b3c';
    screen.strokeStyle = '#3a2414';
    screen.lineWidth = Math.max(1, view.scale * 0.15);
    if (body.kind === 'ball') {
      const r = body.hw * view.scale;
      screen.beginPath();
      screen.arc(0, 0, r, 0, Math.PI * 2);
      screen.fill();
      screen.stroke();
      screen.fillStyle = '#e6c39a';
      screen.beginPath();
      screen.arc(-r * 0.3, -r * 0.3, r * 0.28, 0, Math.PI * 2);
      screen.fill();
    } else {
      const w = body.hw * 2 * view.scale;
      const h = body.hh * 2 * view.scale;
      screen.fillRect(-w / 2, -h / 2, w, h);
      screen.strokeRect(-w / 2, -h / 2, w, h);
      screen.strokeStyle = '#e6c39a';
      screen.beginPath();
      screen.moveTo(-w / 2 + 2, 0);
      screen.lineTo(w / 2 - 2, 0);
      screen.stroke();
    }
    screen.restore();
  }

  private drawPreview(
    screen: CanvasRenderingContext2D,
    view: View,
    cells: Array<[number, number]>,
    rgb: [number, number, number],
  ): void {
    screen.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.65)`;
    const s = view.scale;
    for (const [x, y] of cells) {
      const p = worldToCss(x, y, view);
      screen.fillRect(p.x, p.y, s, s);
    }
  }
}

export function worldToCss(wx: number, wy: number, view: View): { x: number; y: number } {
  const fx = (wx - view.camX) / view.viewW;
  const fy = (wy - view.camY) / view.viewH;
  return { x: view.ox + fx * view.dw, y: view.oy + fy * view.dh };
}
