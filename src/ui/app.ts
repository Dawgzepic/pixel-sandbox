import { brushCells, bresenham, sprayCells, type BrushShape } from '../brush';
import { Sfx } from '../audio/sfx';
import { elementByName } from '../sim/elements';
import { buildDemo } from '../sim/demo';
import { challengeList, startChallenge, type ChallengeRuntime } from '../sim/challenges';
import { stepElectricity } from '../sim/electricity';
import { decodeWorld, encodeWorld } from '../sim/serialize';
import { Simulation } from '../sim/simulation';
import { GRID_H, GRID_W } from '../sim/tuning';
import { cellFromLocal, layoutView, panForZoom, type View } from '../render/camera';
import { Renderer, worldToCss } from '../render/renderer';
import { applySlot, deleteSlot, listSlots, loadSlot, saveSlot, SLOT_COUNT, type SlotRecord } from '../storage/saves';
import { readStars, writeStar } from '../storage/stars';
import { findItem, GROUPS, iconCanvas, QUICK, type ToolName } from './icons';

const SIZES = [1, 3, 5, 9, 15];
const SPEEDS = [0.25, 0.5, 1, 2];

interface PointerPoint {
  x: number;
  y: number;
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
  setTempView: (on: boolean) => void;
  openChallenges: () => void;
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
    tempView: false,
    shape: 'circle' as BrushShape,
    size: 3,
    tool: 'Sand' as ToolName,
    portalColor: 1,
    challenge: null as ChallengeRuntime | null,
    snapshot: null as Uint8Array | null,
    celebrated: false,
    clearArmed: false,
    sheet: '' as '' | 'picker' | 'goals' | 'menu',
    pointers: new Map<number, PointerPoint>(),
    painting: false,
    lineAnchor: null as { x: number; y: number } | null,
    portalStroked: false,
    lastCell: null as { x: number; y: number } | null,
    pinch: null as { dist: number; zoom: number; panX: number; panY: number } | null,
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
  selectTool(state, 'Sand');
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
    if (event.target instanceof HTMLInputElement) return;
    if (event.code === 'Space') {
      event.preventDefault();
      togglePause(state);
    } else if (event.key === '.') {
      stepOnce(state);
    }
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
    checkWin(state);
    const preview = previewCells(state);
    renderer.present(screen, state.view, state.dpr, preview, previewColor(state));
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
      const index = SIZES.indexOf(size);
      if (index >= 0) state.size = SIZES[index];
      if (shape) state.shape = shape;
      syncBrush(state);
    },
    clear: () => clearWorld(state),
    resetDemo: () => {
      buildDemo(sim);
      renderer.invalidate();
      state.challenge = null;
      state.snapshot = null;
      state.paused = false;
      syncPause(state);
      ui.banner.hidden = true;
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
    setTempView: (on) => {
      state.tempView = on;
      renderer.setTemperature(on);
      ui.heat.setAttribute('aria-pressed', on ? 'true' : 'false');
    },
    openChallenges: () => openSheet(state, 'goals'),
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
  heat: HTMLButtonElement;
  sound: HTMLButtonElement;
  goals: HTMLButtonElement;
  menu: HTMLButtonElement;
  size: HTMLButtonElement;
  shape: HTMLButtonElement;
  all: HTMLButtonElement;
  quick: HTMLElement;
  sheet: HTMLElement;
  banner: HTMLElement;
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
  const heat = button('HEAT', 'heat');
  const sound = button('MUTE', 'sound');
  const goals = button('GOALS', 'goals');
  const menu = button('MENU', 'menu');
  heat.setAttribute('aria-pressed', 'false');
  sound.setAttribute('aria-pressed', 'false');
  controls.append(play, step, speed, heat, sound, goals, menu);
  const stage = el('div', 'stage');
  stage.append(canvas);
  const status = el('div', 'status');
  const banner = el('div', 'banner');
  banner.hidden = true;
  main.append(header, controls, stage, status, banner);
  const dock = el('div', 'dock');
  const brushRow = el('div', 'brushrow');
  const size = button('SIZE 3', 'brush-size');
  const shape = button('CIRCLE', 'brush-shape');
  const all = button('ALL', 'all-elements');
  brushRow.append(size, shape, all);
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
  return { fps, status, play, step, speed, heat, sound, goals, menu, size, shape, all, quick, sheet, banner, install, toast };
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
  ui.heat.addEventListener('click', () => {
    state.sfx.resume();
    state.sfx.play('ui');
    state.tempView = !state.tempView;
    state.renderer.setTemperature(state.tempView);
    ui.heat.setAttribute('aria-pressed', state.tempView ? 'true' : 'false');
  });
  ui.sound.addEventListener('click', () => {
    state.sfx.resume();
    const muted = state.sfx.toggle();
    ui.sound.textContent = muted ? 'SOUND' : 'MUTE';
    ui.sound.setAttribute('aria-pressed', muted ? 'true' : 'false');
    if (!muted) state.sfx.play('ui');
  });
  ui.goals.addEventListener('click', () => openSheet(state, state.sheet === 'goals' ? '' : 'goals'));
  ui.menu.addEventListener('click', () => openSheet(state, state.sheet === 'menu' ? '' : 'menu'));
  ui.all.addEventListener('click', () => openSheet(state, 'picker'));
  ui.size.addEventListener('click', () => {
    state.sfx.play('ui');
    const index = SIZES.indexOf(state.size);
    state.size = SIZES[(index + 1) % SIZES.length];
    syncBrush(state);
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
  tempView: boolean;
  shape: BrushShape;
  size: number;
  tool: ToolName;
  portalColor: number;
  challenge: ChallengeRuntime | null;
  snapshot: Uint8Array | null;
  celebrated: boolean;
  clearArmed: boolean;
  sheet: '' | 'picker' | 'goals' | 'menu';
  pointers: Map<number, PointerPoint>;
  painting: boolean;
  lineAnchor: { x: number; y: number } | null;
  portalStroked: boolean;
  lastCell: { x: number; y: number } | null;
  pinch: { dist: number; zoom: number; panX: number; panY: number } | null;
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
  if (item.name === 'Portal') {
    state.ui.status.textContent = `Portal ${state.portalColor === 1 ? 'A' : 'B'} — ${item.blurb}`;
  } else {
    state.ui.status.textContent = `${item.name} — ${item.blurb}`;
  }
  for (const button of state.ui.quick.querySelectorAll('button')) {
    button.classList.toggle('selected', button.dataset.tool === item.name);
  }
}

function syncBrush(state: GameState): void {
  state.ui.size.textContent = `SIZE ${state.size}`;
  state.ui.shape.textContent = state.shape.toUpperCase();
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
  const fx = (localX - state.view.ox) / state.view.dw;
  const fy = (localY - state.view.oy) / state.view.dh;
  const rectSize = state.canvas.getBoundingClientRect();
  const next = layoutView(rectSize.width, rectSize.height, state.sim.w, state.sim.h, nextZoom, 0, 0);
  const pan = panForZoom(
    state.view.camX,
    state.view.camY,
    state.view.viewW,
    state.view.viewH,
    clamp(fx, 0, 1),
    clamp(fy, 0, 1),
    next.viewW,
    next.viewH,
    state.sim.w,
    state.sim.h,
  );
  state.zoom = nextZoom;
  state.panX = pan.x;
  state.panY = pan.y;
  applyCamera(state);
}

function onPointerDown(state: GameState, event: PointerEvent): void {
  event.preventDefault();
  state.sfx.resume();
  state.canvas.setPointerCapture(event.pointerId);
  state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (state.pointers.size >= 2) {
    const [a, b] = [...state.pointers.values()];
    state.pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
    };
    state.painting = false;
    return;
  }
  state.painting = true;
  state.lastCell = null;
  const cell = cellFromClient(state, event.clientX, event.clientY);
  if (!cell) return;
  if (state.shape === 'line' && isElementTool(state.tool)) {
    state.lineAnchor = cell;
    return;
  }
  if (state.tool === 'Box' || state.tool === 'Ball' || state.tool === 'Plank') {
    const body = state.sim.spawnBody(state.tool.toLowerCase() as 'box' | 'ball' | 'plank', cell.x + 0.5, cell.y + 0.5);
    if (!body) toast(state, 'No room for that object.');
    else state.sfx.play('sand');
    state.painting = false;
    return;
  }
  stamp(state, cell.x, cell.y);
  state.lastCell = cell;
}

function onPointerMove(state: GameState, event: PointerEvent): void {
  if (!state.pointers.has(event.pointerId)) return;
  event.preventDefault();
  state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (state.pointers.size >= 2 && state.pinch) {
    const [a, b] = [...state.pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const nextZoom = clamp(state.pinch.zoom * (dist / state.pinch.dist), 1, 4);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    state.zoom = state.pinch.zoom;
    state.panX = state.pinch.panX;
    state.panY = state.pinch.panY;
    applyCamera(state);
    zoomAt(state, midX, midY, nextZoom);
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
  if (state.pointers.size < 2) state.pinch = null;
  if (wasLine && state.lineAnchor) {
    const cell = cellFromClient(state, event.clientX, event.clientY) ?? state.lineAnchor;
    for (const [x, y] of bresenham(state.lineAnchor.x, state.lineAnchor.y, cell.x, cell.y)) stamp(state, x, y);
  }
  state.painting = false;
  state.lineAnchor = null;
  state.lastCell = null;
  if (state.portalStroked) {
    state.portalColor = state.portalColor === 1 ? 2 : 1;
    state.portalStroked = false;
    const item = findItem('Portal');
    if (item && state.tool === 'Portal') {
      state.ui.status.textContent = `Portal ${state.portalColor === 1 ? 'A' : 'B'} — ${item.blurb}`;
    }
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
    else {
      const id = elementByName(state.tool)?.id;
      if (id === undefined) continue;
      const aux = state.tool === 'Portal' ? state.portalColor : undefined;
      state.sim.paintUser(cx, cy, id, aux === undefined ? undefined : { aux });
    }
    painted = true;
  }
  if (!painted) return;
  if (state.tool === 'Portal') state.portalStroked = true;
  const sound = state.tool === 'Water' || state.tool === 'Oil' || state.tool === 'Acid'
    ? 'water'
    : state.tool === 'Fire' || state.tool === 'Lava'
      ? 'fire'
      : state.tool === 'Battery' || state.tool === 'Bulb' || state.tool === 'Metal'
        ? 'zap'
        : state.tool === 'Seed' || state.tool === 'Plant'
          ? 'plant'
          : state.tool === 'Eraser'
            ? 'break'
            : 'sand';
  state.sfx.play(sound);
  const temp = state.sim.getTemp(x, y);
  const item = findItem(state.tool);
  if (item) state.ui.status.textContent = `${item.name} ${temp}° — ${item.blurb}`;
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

function checkWin(state: GameState): void {
  if (!state.challenge || state.celebrated) return;
  if (!state.challenge.won(state.sim)) return;
  state.celebrated = true;
  writeStar(localStorage, state.challenge.id);
  state.sfx.play('win');
  toast(state, `${state.challenge.name} complete`);
  renderBanner(state);
}

function openSheet(state: GameState, name: '' | 'picker' | 'goals' | 'menu'): void {
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
  title.textContent = name === 'picker' ? 'ELEMENTS' : name === 'goals' ? 'CHALLENGES' : 'MENU';
  const close = button('CLOSE', 'close-sheet');
  close.addEventListener('click', () => openSheet(state, ''));
  head.append(title, close);
  sheet.append(head);
  if (name === 'picker') renderPicker(state, sheet);
  else if (name === 'goals') renderGoals(state, sheet);
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

function renderGoals(state: GameState, sheet: HTMLElement): void {
  const stars = new Set(readStars(localStorage));
  const note = el('p', 'note');
  note.textContent = 'Optional puzzles. Stars stay on this phone.';
  sheet.append(note);
  for (const info of challengeList()) {
    const row = el('div', 'goal');
    const copy = el('div', 'goalcopy');
    const name = el('div', 'goalname');
    name.textContent = `${stars.has(info.id) ? '* ' : ''}${info.name}`;
    const goal = el('div', 'goaltext');
    goal.textContent = info.goal;
    copy.append(name, goal);
    const play = button('PLAY', `play-${info.id}`);
    play.addEventListener('click', () => beginChallenge(state, info.id));
    row.append(copy, play);
    sheet.append(row);
  }
}

function beginChallenge(state: GameState, id: string): void {
  if (!state.challenge) state.snapshot = encodeWorld(state.sim);
  state.challenge = startChallenge(state.sim, id);
  state.celebrated = false;
  state.paused = true;
  state.acc = 0;
  state.renderer.invalidate();
  syncPause(state);
  renderBanner(state);
  openSheet(state, '');
  toast(state, state.challenge.goal);
}

function renderBanner(state: GameState): void {
  const banner = state.ui.banner;
  banner.replaceChildren();
  if (!state.challenge) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  const text = el('div', 'bannertext');
  text.textContent = state.celebrated ? `${state.challenge.name} complete` : state.challenge.goal;
  const restart = button('RESTART', 'restart-challenge');
  const exit = button('EXIT', 'exit-challenge');
  restart.addEventListener('click', () => beginChallenge(state, state.challenge!.id));
  exit.addEventListener('click', () => exitChallenge(state));
  banner.append(text, restart, exit);
}

function exitChallenge(state: GameState): void {
  if (state.snapshot) decodeWorld(state.sim, state.snapshot);
  state.snapshot = null;
  state.challenge = null;
  state.celebrated = false;
  state.paused = false;
  state.renderer.invalidate();
  syncPause(state);
  state.ui.banner.hidden = true;
}

function renderMenu(state: GameState, sheet: HTMLElement): void {
  const about = el('p', 'note');
  about.textContent = 'Paint with one finger. Pinch to look closer. Water on lava makes stone and steam. Crates burn, dissolve, and push liquids aside.';
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
        state.challenge = null;
        state.snapshot = null;
        state.ui.banner.hidden = true;
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
  choice.setAttribute('aria-label', name);
  const img = iconCanvas(name);
  choice.append(img);
  const label = el('span', 'toolname');
  label.textContent = name;
  choice.append(label);
  return choice;
}

function isElementTool(name: ToolName): boolean {
  return name !== 'Box' && name !== 'Ball' && name !== 'Plank';
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
