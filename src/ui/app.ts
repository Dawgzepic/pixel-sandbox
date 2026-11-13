import { brushCells, bresenham, sprayCells, type BrushShape } from '../brush';
import { Sfx } from '../audio/sfx';
import { El, elementByName } from '../sim/elements';
import { buildDemo } from '../sim/demo';
import { stepElectricity } from '../sim/electricity';
import { Simulation } from '../sim/simulation';
import { GRID_H, GRID_W } from '../sim/tuning';
import { cellFromLocal, layoutView, panBy, type View } from '../render/camera';
import { Renderer, worldToCss } from '../render/renderer';
import { applySlot, deleteSlot, listSlots, loadSlot, saveSlot, SLOT_COUNT, type SlotRecord } from '../storage/saves';
import { findItem, GROUPS, iconCanvas, OUTLINE_TOOLS, QUICK, type ToolName } from './icons';

const BRUSH_CHOICES = [
  { label: 'Tiny', px: 1 },
  { label: 'Small', px: 3 },
  { label: 'Medium', px: 5 },
  { label: 'Large', px: 9 },
  { label: 'Huge', px: 15 },
] as const;
const SPEEDS = [0.25, 0.5, 1, 2];

interface PointerPoint {
  x: number;
  y: number;
  pan: boolean;
}

interface Gesture {
  dist: number;
  zoom: number;
  cellX: number;
  cellY: number;
}

export interface SandboxApi {
  sim: Simulation;
  getFps: () => number;
  cellFromClient: (x: number, y: number) => { x: number; y: number } | null;
  clientFromCell: (x: number, y: number) => { x: number; y: number };
  select: (name: string) => void;
  setBrush: (size: number, shape?: BrushShape) => void;
  clear: () => void;
  resetDemo: () => void;
  step: (n?: number) => void;
  setPaused: (paused: boolean) => void;
  openPicker: () => void;
  closeSheet: () => void;
  aim: () => { x: number; y: number; clientX: number; clientY: number };
}

export function mountGame(root: HTMLElement): SandboxApi {
  const sim = new Simulation(GRID_W, GRID_H, (Math.random() * 1e9) | 0 || 1);
  buildDemo(sim);
  const renderer = new Renderer(sim);
  const sfx = new Sfx();
  const canvas = document.createElement('canvas');
  canvas.id = 'world';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Sandbox world');
  const screen = canvas.getContext('2d');
  if (!screen) throw new Error('Canvas is not available.');

  const ui = buildShell(root, canvas);
  const state = {
    sim,
    renderer,
    sfx,
    canvas,
    screen,
    ui,
    paused: false,
    speedIndex: 2,
    shape: 'circle' as BrushShape,
    size: 3,
    tool: 'Water' as ToolName,
    clearArmed: false,
    sheet: '' as '' | 'picker' | 'menu',
    pointers: new Map<number, PointerPoint>(),
    painting: false,
    lineAnchor: null as { x: number; y: number } | null,
    lastCell: null as { x: number; y: number } | null,
    cursor: null as { x: number; y: number } | null,
    hand: false,
    spaceDown: false,
    gesture: null as Gesture | null,
    zoom: 2.15,
    panX: 24,
    panY: 10_000,
    view: layoutView(300, 300, sim.w, sim.h, 1, 0, 0),
    dpr: 1,
    fps: 60,
    frameTimes: [] as number[],
    acc: 0,
    deferredPrompt: null as BeforeInstallPromptEvent | null,
  };

  wireControls(state);
  selectTool(state, 'Water');
  window.addEventListener('resize', () => resize(state));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) state.acc = 0;
  });
  canvas.addEventListener('pointerdown', (event) => onPointerDown(state, event));
  canvas.addEventListener('pointermove', (event) => onPointerMove(state, event));
  canvas.addEventListener('pointerup', (event) => onPointerUp(state, event));
  canvas.addEventListener('pointercancel', (event) => onPointerUp(state, event));
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('wheel', (event) => onWheel(state, event), { passive: false });
  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.code === 'Space') {
      event.preventDefault();
      state.spaceDown = true;
    } else if (event.key === '.') {
      stepOnce(state);
    }
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') state.spaceDown = false;
  });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredPrompt = event as BeforeInstallPromptEvent;
    ui.install.hidden = false;
  });

  resize(state);
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(48, now - last);
    last = now;
    state.frameTimes.push(dt);
    if (state.frameTimes.length > 40) state.frameTimes.shift();
    const avg = state.frameTimes.reduce((sum, value) => sum + value, 0) / state.frameTimes.length;
    state.fps = 1000 / avg;
    ui.fps.textContent = String(Math.round(state.fps));
    try {
      if (!state.paused && document.visibilityState === 'visible') {
        state.acc += SPEEDS[state.speedIndex];
        let steps = 0;
        while (state.acc >= 1 && steps < 4) {
          holdBrush(state);
          sim.step();
          playEvents(state);
          state.acc -= 1;
          steps++;
        }
      } else {
        stepElectricity(sim);
      }
    } catch (error) {
      state.paused = true;
      syncPause(state);
      toast(state, error instanceof Error ? error.message : 'The simulation hit an error.');
    }
    const preview = previewCells(state);
    renderer.present(screen, state.view, state.dpr, preview, previewColor(state), outlineCells(state));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const api: SandboxApi = {
    sim,
    getFps: () => state.fps,
    cellFromClient: (x, y) => cellFromClient(state, x, y),
    clientFromCell: (x, y) => clientFromCell(state, x, y),
    select: (name) => selectTool(state, name),
    setBrush: (size, shape) => {
      if (BRUSH_CHOICES.some((choice) => choice.px === size)) state.size = size;
      if (shape) state.shape = shape;
      syncBrush(state);
    },
    clear: () => clearWorld(state),
    resetDemo: () => {
      buildDemo(sim);
      renderer.invalidate();
      state.paused = false;
      syncPause(state);
    },
    step: (n = 1) => {
      for (let i = 0; i < n; i++) {
        sim.step();
        playEvents(state);
      }
    },
    setPaused: (paused) => {
      state.paused = paused;
      state.acc = 0;
      syncPause(state);
    },
    openPicker: () => openSheet(state, 'picker'),
    closeSheet: () => openSheet(state, ''),
    aim: () => {
      const rect = canvas.getBoundingClientRect();
      const cell = cellFromClient(state, rect.left + rect.width / 2, rect.top + rect.height / 2)
        ?? { x: Math.floor(sim.w / 2), y: Math.floor(sim.h / 2) };
      const client = clientFromCell(state, cell.x, cell.y);
      return { x: cell.x, y: cell.y, clientX: client.x, clientY: client.y };
    },
  };
  window.__PIXEL_SANDBOX__ = api;
  return api;
}

interface Shell {
  fps: HTMLElement;
  status: HTMLElement;
  play: HTMLButtonElement;
  step: HTMLButtonElement;
  speed: HTMLButtonElement;
  sound: HTMLButtonElement;
  menu: HTMLButtonElement;
  size: HTMLButtonElement;
  sizeMenu: HTMLElement;
  hand: HTMLButtonElement;
  shape: HTMLButtonElement;
  all: HTMLButtonElement;
  quick: HTMLElement;
  sheet: HTMLElement;
  install: HTMLButtonElement;
  toast: HTMLElement;
}

function buildShell(root: HTMLElement, canvas: HTMLCanvasElement): Shell {
  root.innerHTML = '';
  const app = el('div', 'app');
  const main = el('div', 'maincol');
  const header = el('header', 'top');
  const title = el('div', 'title');
  title.textContent = 'PIXEL SANDBOX';
  const fps = el('div', 'fps');
  fps.textContent = '60';
  header.append(title, fps);
  const controls = el('div', 'controls');
  const play = button('PAUSE', 'pause');
  const step = button('STEP', 'step');
  const speed = button('1X', 'speed');
  const sound = button('MUTE', 'sound');
  const menu = button('MENU', 'menu');
  sound.setAttribute('aria-pressed', 'false');
  controls.append(play, step, speed, sound, menu);
  const stage = el('div', 'stage');
  stage.append(canvas);
  const status = el('div', 'status');
  main.append(header, controls, stage, status);
  const dock = el('div', 'dock');
  const brushRow = el('div', 'brushrow');
  const sizeWrap = el('div', 'sizemenu');
  const size = button('Small 3', 'brush-size');
  size.setAttribute('aria-haspopup', 'listbox');
  size.setAttribute('aria-expanded', 'false');
  const sizeMenu = el('div', 'sizelist');
  sizeMenu.hidden = true;
  sizeMenu.setAttribute('role', 'listbox');
  for (const choice of BRUSH_CHOICES) {
    const option = button(`${choice.label} ${choice.px}`, `size-${choice.px}`);
    option.dataset.size = String(choice.px);
    sizeMenu.append(option);
  }
  sizeWrap.append(size, sizeMenu);
  const hand = button('HAND', 'hand');
  hand.setAttribute('aria-pressed', 'false');
  const shape = button('CIRCLE', 'brush-shape');
  const all = button('ALL', 'all-elements');
  brushRow.append(sizeWrap, hand, shape, all);
  const quick = el('div', 'quick');
  dock.append(brushRow, quick);
  const sheet = el('div', 'sheet');
  sheet.hidden = true;
  const toast = el('div', 'toast');
  toast.hidden = true;
  const install = button('INSTALL', 'install');
  install.hidden = true;
  app.append(main, dock, sheet, toast);
  root.append(app);
  return { fps, status, play, step, speed, sound, menu, size, sizeMenu, hand, shape, all, quick, sheet, install, toast };
}

function wireControls(state: GameState): void {
  const { ui } = state;
  ui.play.addEventListener('click', () => {
    state.sfx.resume();
    togglePause(state);
  });
  ui.step.addEventListener('click', () => {
    state.sfx.resume();
    stepOnce(state);
  });
  ui.speed.addEventListener('click', () => {
    state.sfx.resume();
    state.sfx.play('ui');
    state.speedIndex = (state.speedIndex + 1) % SPEEDS.length;
    const label = SPEEDS[state.speedIndex] === 0.25 ? '1/4X' : SPEEDS[state.speedIndex] === 0.5 ? '1/2X' : `${SPEEDS[state.speedIndex]}X`;
    ui.speed.textContent = label;
  });
  ui.sound.addEventListener('click', () => {
    state.sfx.resume();
    const muted = state.sfx.toggle();
    ui.sound.textContent = muted ? 'SOUND' : 'MUTE';
    ui.sound.setAttribute('aria-pressed', muted ? 'true' : 'false');
    if (!muted) state.sfx.play('ui');
  });
  ui.menu.addEventListener('click', () => openSheet(state, state.sheet === 'menu' ? '' : 'menu'));
  ui.all.addEventListener('click', () => openSheet(state, 'picker'));
  ui.size.addEventListener('click', (event) => {
    event.stopPropagation();
    state.sfx.play('ui');
    const open = ui.sizeMenu.hidden;
    ui.sizeMenu.hidden = !open;
    ui.size.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  ui.sizeMenu.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const px = Number(target.dataset.size);
    if (!BRUSH_CHOICES.some((choice) => choice.px === px)) return;
    state.size = px;
    ui.sizeMenu.hidden = true;
    ui.size.setAttribute('aria-expanded', 'false');
    syncBrush(state);
    state.sfx.play('ui');
  });
  document.addEventListener('pointerdown', (event) => {
    const wrap = ui.size.parentElement;
    if (wrap && event.target instanceof Node && !wrap.contains(event.target)) {
      ui.sizeMenu.hidden = true;
      ui.size.setAttribute('aria-expanded', 'false');
    }
  });
  ui.hand.addEventListener('click', () => {
    state.hand = !state.hand;
    ui.hand.setAttribute('aria-pressed', state.hand ? 'true' : 'false');
    state.sfx.play('ui');
  });
  ui.shape.addEventListener('click', () => {
    state.sfx.play('ui');
    const order: BrushShape[] = ['circle', 'square', 'line', 'spray'];
    state.shape = order[(order.indexOf(state.shape) + 1) % order.length];
    syncBrush(state);
  });
  ui.install.addEventListener('click', async () => {
    const prompt = state.deferredPrompt;
    if (!prompt) return;
    await prompt.prompt();
    state.deferredPrompt = null;
    ui.install.hidden = true;
  });
  for (const name of QUICK) {
    const cell = toolButton(name);
    cell.addEventListener('click', () => {
      state.sfx.resume();
      state.sfx.play('ui');
      selectTool(state, name);
    });
    ui.quick.append(cell);
  }
  syncBrush(state);
}

type GameState = {
  sim: Simulation;
  renderer: Renderer;
  sfx: Sfx;
  canvas: HTMLCanvasElement;
  screen: CanvasRenderingContext2D;
  ui: Shell;
  paused: boolean;
  speedIndex: number;
  shape: BrushShape;
  size: number;
  hand: boolean;
  spaceDown: boolean;
  gesture: Gesture | null;
  tool: ToolName;
  clearArmed: boolean;
  sheet: '' | 'picker' | 'menu';
  pointers: Map<number, PointerPoint>;
  painting: boolean;
  lineAnchor: { x: number; y: number } | null;
  lastCell: { x: number; y: number } | null;
  cursor: { x: number; y: number } | null;
  zoom: number;
  panX: number;
  panY: number;
  view: View;
  dpr: number;
  fps: number;
  frameTimes: number[];
  acc: number;
  deferredPrompt: BeforeInstallPromptEvent | null;
};

function selectTool(state: GameState, name: string): void {
  const item = findItem(name);
  if (!item) return;
  state.tool = item.name;
  state.ui.status.textContent = `${item.label} — ${item.blurb}`;
  for (const button of state.ui.quick.querySelectorAll('button')) {
    button.classList.toggle('selected', button.dataset.tool === item.name);
  }
}

function syncBrush(state: GameState): void {
  const choice = BRUSH_CHOICES.find((item) => item.px === state.size) ?? BRUSH_CHOICES[1];
  state.ui.size.textContent = `${choice.label} ${choice.px}`;
  state.ui.shape.textContent = state.shape.toUpperCase();
  for (const option of state.ui.sizeMenu.querySelectorAll('button')) {
    option.classList.toggle('selected', Number(option.dataset.size) === state.size);
  }
}

function syncPause(state: GameState): void {
  state.ui.play.textContent = state.paused ? 'PLAY' : 'PAUSE';
  state.ui.play.setAttribute('aria-pressed', state.paused ? 'true' : 'false');
}

function togglePause(state: GameState): void {
  state.paused = !state.paused;
  state.acc = 0;
  state.sfx.play('ui');
  syncPause(state);
}

function stepOnce(state: GameState): void {
  state.paused = true;
  state.acc = 0;
  syncPause(state);
  state.sim.step();
  playEvents(state);
  state.sfx.play('ui');
}

function clearWorld(state: GameState): void {
  state.sim.clearAll();
  state.renderer.invalidate();
  state.sfx.play('break');
}

function resize(state: GameState): void {
  const rect = state.canvas.getBoundingClientRect();
  state.dpr = Math.min(2, window.devicePixelRatio || 1);
  state.canvas.width = Math.max(1, Math.round(rect.width * state.dpr));
  state.canvas.height = Math.max(1, Math.round(rect.height * state.dpr));
  applyCamera(state);
}

function applyCamera(state: GameState): void {
  const rect = state.canvas.getBoundingClientRect();
  state.view = layoutView(rect.width, rect.height, state.sim.w, state.sim.h, state.zoom, state.panX, state.panY);
  state.panX = state.view.camX;
  state.panY = state.view.camY;
}

function onWheel(state: GameState, event: WheelEvent): void {
  event.preventDefault();
  const next = clamp(state.zoom * (event.deltaY > 0 ? 0.9 : 1.1), 1, 4);
  zoomAt(state, event.clientX, event.clientY, next);
}

function zoomAt(state: GameState, clientX: number, clientY: number, nextZoom: number): void {
  const rect = state.canvas.getBoundingClientRect();
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const fx = clamp((localX - state.view.ox) / Math.max(1, state.view.dw), 0, 1);
  const fy = clamp((localY - state.view.oy) / Math.max(1, state.view.dh), 0, 1);
  const cellX = state.view.camX + fx * state.view.viewW;
  const cellY = state.view.camY + fy * state.view.viewH;
  const next = layoutView(rect.width, rect.height, state.sim.w, state.sim.h, nextZoom, 0, 0);
  state.zoom = nextZoom;
  state.panX = cellX - fx * next.viewW;
  state.panY = cellY - fy * next.viewH;
  applyCamera(state);
}

function panPixels(state: GameState, dx: number, dy: number): void {
  const moved = panBy(
    state.panX,
    state.panY,
    dx,
    dy,
    state.view.scale,
    state.sim.w,
    state.sim.h,
    state.view.viewW,
    state.view.viewH,
  );
  state.panX = moved.x;
  state.panY = moved.y;
  applyCamera(state);
}

function beginGesture(state: GameState): void {
  const pts = [...state.pointers.values()];
  if (pts.length < 2) return;
  const midX = (pts[0].x + pts[1].x) / 2;
  const midY = (pts[0].y + pts[1].y) / 2;
  const rect = state.canvas.getBoundingClientRect();
  const fx = clamp((midX - rect.left - state.view.ox) / Math.max(1, state.view.dw), 0, 1);
  const fy = clamp((midY - rect.top - state.view.oy) / Math.max(1, state.view.dh), 0, 1);
  state.gesture = {
    dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
    zoom: state.zoom,
    cellX: state.view.camX + fx * state.view.viewW,
    cellY: state.view.camY + fy * state.view.viewH,
  };
}

function applyGesture(state: GameState): void {
  const gesture = state.gesture;
  const pts = [...state.pointers.values()];
  if (!gesture || pts.length < 2) return;
  const midX = (pts[0].x + pts[1].x) / 2;
  const midY = (pts[0].y + pts[1].y) / 2;
  const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
  const nextZoom = clamp(gesture.zoom * (dist / gesture.dist), 1, 4);
  const rect = state.canvas.getBoundingClientRect();
  const next = layoutView(rect.width, rect.height, state.sim.w, state.sim.h, nextZoom, 0, 0);
  const fx = clamp((midX - rect.left - next.ox) / Math.max(1, next.dw), 0, 1);
  const fy = clamp((midY - rect.top - next.oy) / Math.max(1, next.dh), 0, 1);
  state.zoom = nextZoom;
  state.panX = gesture.cellX - fx * next.viewW;
  state.panY = gesture.cellY - fy * next.viewH;
  applyCamera(state);
}

function onPointerDown(state: GameState, event: PointerEvent): void {
  event.preventDefault();
  rememberCursor(state, event);
  state.sfx.resume();
  state.canvas.setPointerCapture(event.pointerId);
  const pan = state.hand || state.spaceDown || event.button === 1 || event.button === 2;
  state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, pan });
  if (state.pointers.size >= 2) {
    state.painting = false;
    beginGesture(state);
    return;
  }
  if (pan) return;
  state.painting = true;
  state.lastCell = null;
  const cell = cellFromClient(state, event.clientX, event.clientY);
  if (!cell) return;
  if (state.shape === 'line' && isElementTool(state.tool)) {
    state.lineAnchor = cell;
    return;
  }
  stamp(state, cell.x, cell.y);
  state.lastCell = cell;
}

function onPointerMove(state: GameState, event: PointerEvent): void {
  rememberCursor(state, event);
  const previous = state.pointers.get(event.pointerId);
  if (!previous) return;
  event.preventDefault();
  state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, pan: previous.pan });
  if (state.pointers.size >= 2 && state.gesture) {
    applyGesture(state);
    return;
  }
  if (previous.pan || state.hand || state.spaceDown) {
    panPixels(state, event.clientX - previous.x, event.clientY - previous.y);
    return;
  }
  if (!state.painting || state.shape === 'line') return;
  const cell = cellFromClient(state, event.clientX, event.clientY);
  if (!cell) return;
  const last = state.lastCell;
  if (last) {
    for (const [x, y] of bresenham(last.x, last.y, cell.x, cell.y)) stamp(state, x, y);
  } else stamp(state, cell.x, cell.y);
  state.lastCell = cell;
}

function onPointerUp(state: GameState, event: PointerEvent): void {
  const wasLine = state.shape === 'line' && state.lineAnchor && state.painting;
  state.pointers.delete(event.pointerId);
  if (state.pointers.size < 2) state.gesture = null;
  if (wasLine && state.lineAnchor) {
    const cell = cellFromClient(state, event.clientX, event.clientY) ?? state.lineAnchor;
    for (const [x, y] of bresenham(state.lineAnchor.x, state.lineAnchor.y, cell.x, cell.y)) stamp(state, x, y);
  }
  state.painting = false;
  state.lineAnchor = null;
  state.lastCell = null;
}

/** Keep applying a held fire, warmer, or cooler brush once per simulation step. */
function holdBrush(state: GameState): void {
  if (!state.painting || !state.lastCell || state.shape === 'line') return;
  if (state.tool !== 'Fire' && state.tool !== 'Warmer' && state.tool !== 'Cooler') return;
  if (state.pointers.size !== 1) return;
  const shape = state.shape === 'square' ? 'square' : 'circle';
  const cells = state.shape === 'spray'
    ? sprayCells(state.lastCell.x, state.lastCell.y, state.size, () => state.sim.rng.next())
    : brushCells(state.lastCell.x, state.lastCell.y, state.size, shape);
  for (const [cx, cy] of cells) {
    if (!state.sim.inBounds(cx, cy) || state.sim.isBorder(cx, cy)) continue;
    if (state.tool === 'Fire') state.sim.paintUser(cx, cy, El.Fire);
    else if (state.tool === 'Warmer') state.sim.warm(cx, cy);
    else state.sim.cool(cx, cy);
  }
}

function stamp(state: GameState, x: number, y: number): void {
  const shape = state.shape === 'square' ? 'square' : 'circle';
  const cells = state.shape === 'spray'
    ? sprayCells(x, y, state.size, () => state.sim.rng.next())
    : brushCells(x, y, state.size, shape);
  let painted = false;
  for (const [cx, cy] of cells) {
    if (!state.sim.inBounds(cx, cy) || state.sim.isBorder(cx, cy)) continue;
    if (state.tool === 'Eraser') state.sim.eraseAt(cx, cy);
    else if (state.tool === 'Warmer') state.sim.warm(cx, cy);
    else if (state.tool === 'Cooler') state.sim.cool(cx, cy);
    else {
      const id = elementByName(state.tool)?.id;
      if (id === undefined) continue;
      state.sim.paintUser(cx, cy, id);
    }
    painted = true;
  }
  if (!painted) return;
  const liquid = state.tool === 'Water'
    || state.tool === 'Hydrochloric acid'
    || state.tool === 'Sodium hydroxide';
  const sound = liquid
    ? 'water'
    : state.tool === 'Fire' || state.tool === 'Lava' || state.tool === 'Molten metal' || state.tool === 'Molten glass'
      ? 'fire'
      : state.tool === 'Metal'
        ? 'zap'
        : state.tool === 'Eraser'
          ? 'break'
          : 'sand';
  state.sfx.play(sound);
  const temp = state.sim.getTemp(x, y);
  const item = findItem(state.tool);
  if (item) state.ui.status.textContent = `${item.label} ${temp}° — ${item.blurb}`;
}

function previewCells(state: GameState): Array<[number, number]> | null {
  if (!state.painting || state.shape !== 'line' || !state.lineAnchor || state.pointers.size !== 1) return null;
  const point = [...state.pointers.values()][0];
  const cell = cellFromClient(state, point.x, point.y);
  if (!cell) return null;
  const line = bresenham(state.lineAnchor.x, state.lineAnchor.y, cell.x, cell.y);
  const cells: Array<[number, number]> = [];
  const shape = state.shape === 'line' ? 'circle' : 'circle';
  for (const [x, y] of line) cells.push(...brushCells(x, y, state.size, shape));
  return cells;
}

function previewColor(state: GameState): [number, number, number] {
  return elementByName(state.tool)?.color ?? [255, 230, 160];
}

function cellFromClient(state: GameState, clientX: number, clientY: number): { x: number; y: number } | null {
  const rect = state.canvas.getBoundingClientRect();
  return cellFromLocal(clientX - rect.left, clientY - rect.top, state.view, state.sim.w, state.sim.h);
}

function clientFromCell(state: GameState, x: number, y: number): { x: number; y: number } {
  const rect = state.canvas.getBoundingClientRect();
  const point = worldToCss(x + 0.5, y + 0.5, state.view);
  return { x: rect.left + point.x, y: rect.top + point.y };
}

function playEvents(state: GameState): void {
  for (const event of state.sim.events) {
    if (event.kind === 'explode') state.sfx.play('explode');
    else if (event.kind === 'break') state.sfx.play('break');
    else state.sfx.play('splash');
  }
}

function openSheet(state: GameState, name: '' | 'picker' | 'menu'): void {
  state.sheet = name;
  state.sfx.play('ui');
  const sheet = state.ui.sheet;
  sheet.replaceChildren();
  if (!name) {
    sheet.hidden = true;
    return;
  }
  sheet.hidden = false;
  const head = el('div', 'sheethead');
  const title = el('div', 'sheettitle');
  title.textContent = name === 'picker' ? 'ELEMENTS' : 'MENU';
  const close = button('CLOSE', 'close-sheet');
  close.addEventListener('click', () => openSheet(state, ''));
  head.append(title, close);
  sheet.append(head);
  if (name === 'picker') renderPicker(state, sheet);
  else renderMenu(state, sheet);
}

function renderPicker(state: GameState, sheet: HTMLElement): void {
  for (const group of GROUPS) {
    const label = el('div', 'grouplabel');
    label.textContent = group.label;
    const grid = el('div', 'grid');
    for (const item of group.items) {
      const choice = toolButton(item.name);
      choice.classList.toggle('selected', state.tool === item.name);
      choice.addEventListener('click', () => {
        selectTool(state, item.name);
        openSheet(state, '');
      });
      grid.append(choice);
    }
    sheet.append(label, grid);
  }
}

function renderMenu(state: GameState, sheet: HTMLElement): void {
  const about = el('p', 'note');
  about.textContent = 'Paint with one finger. Pinch to look closer. Glass holds a liquid and lets heat through. Warmer and Cooler change temperature without painting over. Acid and base make salt, and salt dissolves into pale saltwater.';
  sheet.append(about, state.ui.install);
  const clear = button(state.clearArmed ? 'SURE?' : 'CLEAR ALL', 'clear-all');
  clear.addEventListener('click', () => {
    if (!state.clearArmed) {
      state.clearArmed = true;
      clear.textContent = 'SURE?';
      window.setTimeout(() => {
        state.clearArmed = false;
        if (clear.isConnected) clear.textContent = 'CLEAR ALL';
      }, 1800);
      return;
    }
    state.clearArmed = false;
    clearWorld(state);
    openSheet(state, '');
  });
  sheet.append(clear);
  const saves = el('div', 'saves');
  sheet.append(saves);
  void refreshSaves(state, saves);
}

async function refreshSaves(state: GameState, host: HTMLElement): Promise<void> {
  host.replaceChildren();
  let slots: Array<SlotRecord | null> = [];
  try {
    slots = await listSlots();
  } catch {
    const err = el('p', 'note');
    err.textContent = 'Saves are unavailable in this browser.';
    host.append(err);
    return;
  }
  for (let i = 0; i < SLOT_COUNT; i++) {
    const record = slots[i];
    const row = el('div', 'slot');
    if (record?.thumbnail) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = record.thumbnail;
      row.append(img);
    } else {
      const empty = el('div', 'thumb');
      empty.textContent = 'EMPTY';
      row.append(empty);
    }
    const meta = el('div', 'slotmeta');
    const input = document.createElement('input');
    input.value = record?.name ?? `Slot ${i + 1}`;
    input.maxLength = 24;
    input.setAttribute('aria-label', `Name for save slot ${i + 1}`);
    const when = el('div', 'when');
    when.textContent = record ? new Date(record.savedAt).toLocaleString() : 'Empty slot';
    meta.append(input, when);
    const actions = el('div', 'slotactions');
    const save = button('SAVE', `save-${i}`);
    const load = button('LOAD', `load-${i}`);
    const del = button('DEL', `delete-${i}`);
    load.disabled = !record;
    del.disabled = !record;
    save.addEventListener('click', async () => {
      try {
        const thumb = thumbnail(state.renderer.buffer);
        await saveSlot(i, input.value, state.sim, thumb);
        state.sfx.play('ui');
        toast(state, 'Saved.');
        await refreshSaves(state, host);
      } catch (error) {
        toast(state, error instanceof Error ? error.message : 'Could not save.');
      }
    });
    load.addEventListener('click', async () => {
      const slot = await loadSlot(i);
      if (!slot) return;
      try {
        applySlot(state.sim, slot);
        state.renderer.invalidate();
        state.sfx.play('ui');
        openSheet(state, '');
      } catch (error) {
        toast(state, error instanceof Error ? error.message : 'Could not load.');
      }
    });
    del.addEventListener('click', async () => {
      await deleteSlot(i);
      await refreshSaves(state, host);
    });
    actions.append(save, load, del);
    row.append(meta, actions);
    host.append(row);
  }
}

function thumbnail(source: HTMLCanvasElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, 96, 64);
  return canvas.toDataURL('image/jpeg', 0.7);
}

function toast(state: GameState, message: string): void {
  state.ui.toast.hidden = false;
  state.ui.toast.textContent = message;
  window.setTimeout(() => {
    if (state.ui.toast.textContent === message) state.ui.toast.hidden = true;
  }, 2400);
}

function toolButton(name: ToolName): HTMLButtonElement {
  const choice = document.createElement('button');
  choice.type = 'button';
  choice.className = 'tool';
  choice.dataset.tool = name;
  const item = findItem(name);
  const shown = item?.label ?? name;
  choice.setAttribute('aria-label', shown);
  const img = iconCanvas(name);
  choice.append(img);
  const label = el('span', 'toolname');
  label.textContent = item?.name ?? name;
  choice.append(label);
  const formula = item?.label.includes('(') ? item.label.slice(item.label.indexOf('(') + 1, -1) : '';
  if (formula) {
    const chem = el('span', 'toolformula');
    chem.textContent = formula;
    choice.append(chem);
  }
  return choice;
}

function isElementTool(name: ToolName): boolean {
  return name !== 'Eraser' && name !== 'Warmer' && name !== 'Cooler';
}

function rememberCursor(state: GameState, event: PointerEvent): void {
  state.cursor = cellFromClient(state, event.clientX, event.clientY);
}

function outlineCells(state: GameState): Array<[number, number]> | null {
  if (!state.cursor || !OUTLINE_TOOLS.has(state.tool)) return null;
  if (state.hand || state.spaceDown) return null;
  const shape = state.shape === 'square' ? 'square' : 'circle';
  return brushCells(state.cursor.x, state.cursor.y, state.size, shape);
}

function button(text: string, testId: string): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = text;
  node.dataset.testid = testId;
  return node;
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

declare global {
  interface Window {
    __PIXEL_SANDBOX__?: SandboxApi;
  }
}
