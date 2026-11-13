import { El, RETIRED } from './elements';
import type { Body, BodyKind, Simulation } from './simulation';
import { AMBIENT } from './tuning';

const MAGIC = [0x50, 0x58, 0x53, 0x42]; // PXSB
const VERSION = 1;
const HEADER = 20;
const BODY_BYTES = 48;

const KINDS: BodyKind[] = ['box', 'ball', 'plank'];

/** Binary world snapshot: grid, temperatures, and rigid bodies. */
export function encodeWorld(sim: Simulation): Uint8Array {
  const n = sim.w * sim.h;
  const bytes = new Uint8Array(HEADER + n * 6 + 2 + sim.bodies.length * BODY_BYTES + 4);
  const view = new DataView(bytes.buffer);
  bytes[0] = MAGIC[0];
  bytes[1] = MAGIC[1];
  bytes[2] = MAGIC[2];
  bytes[3] = MAGIC[3];
  view.setUint16(4, VERSION, true);
  view.setUint16(6, sim.w, true);
  view.setUint16(8, sim.h, true);
  bytes[10] = sim.nextPortal;
  bytes[11] = 0;
  view.setInt32(12, sim.rng.state, true);
  view.setUint32(16, sim.frame >>> 0, true);

  let o = HEADER;
  bytes.set(sim.type, o);
  o += n;
  for (let i = 0; i < n; i++) {
    view.setInt16(o, sim.temp[i], true);
    o += 2;
  }
  bytes.set(sim.aux, o);
  o += n;
  bytes.set(sim.aux2, o);
  o += n;
  bytes.set(sim.variation, o);
  o += n;
  view.setUint16(o, sim.bodies.length, true);
  o += 2;
  for (const b of sim.bodies) {
    const kind = KINDS.indexOf(b.kind);
    bytes[o] = kind < 0 ? 0 : kind;
    bytes[o + 1] = b.asleep ? 1 : 0;
    view.setUint16(o + 2, 0, true);
    view.setFloat32(o + 4, b.x, true);
    view.setFloat32(o + 8, b.y, true);
    view.setFloat32(o + 12, b.vx, true);
    view.setFloat32(o + 16, b.vy, true);
    view.setFloat32(o + 20, b.angle, true);
    view.setFloat32(o + 24, b.av, true);
    view.setFloat32(o + 28, b.hw, true);
    view.setFloat32(o + 32, b.hh, true);
    view.setFloat32(o + 36, b.health, true);
    view.setFloat32(o + 40, b.maxHealth, true);
    view.setUint32(o + 44, b.id, true);
    o += BODY_BYTES;
  }
  let sum = 0;
  for (let i = 0; i < o; i++) sum = (sum + bytes[i]) >>> 0;
  view.setUint32(o, sum, true);
  return bytes;
}

export function decodeWorld(sim: Simulation, data: Uint8Array | ArrayBuffer): void {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < HEADER + 4) throw new Error('Save is too small.');
  if (bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1] || bytes[2] !== MAGIC[2] || bytes[3] !== MAGIC[3]) {
    throw new Error('This is not a Pixel Sandbox save.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(4, true);
  if (version !== VERSION) throw new Error('This save is from a different version.');
  const w = view.getUint16(6, true);
  const h = view.getUint16(8, true);
  if (w !== sim.w || h !== sim.h) throw new Error('This save is for a different world size.');
  const n = w * h;
  const stored = view.getUint32(bytes.length - 4, true);
  let sum = 0;
  for (let i = 0; i < bytes.length - 4; i++) sum = (sum + bytes[i]) >>> 0;
  if (stored !== sum) throw new Error('This save is damaged.');

  const expect = HEADER + n * 6 + 2;
  if (bytes.length < expect + 4) throw new Error('This save is incomplete.');
  let o = HEADER;
  sim.type.set(bytes.subarray(o, o + n));
  o += n;
  for (let i = 0; i < n; i++) {
    sim.temp[i] = view.getInt16(o, true);
    o += 2;
  }
  sim.aux.set(bytes.subarray(o, o + n));
  o += n;
  sim.aux2.set(bytes.subarray(o, o + n));
  o += n;
  sim.variation.set(bytes.subarray(o, o + n));
  o += n;
  for (let i = 0; i < n; i++) {
    const t = sim.type[i];
    if (t >= RETIRED.length || RETIRED[t]) {
      sim.type[i] = El.Empty;
      sim.temp[i] = AMBIENT;
      sim.aux[i] = 0;
      sim.aux2[i] = 0;
      sim.variation[i] = 0;
    }
  }
  const bodyCount = view.getUint16(o, true);
  o += 2;
  if (bytes.length !== expect + bodyCount * BODY_BYTES + 4) throw new Error('This save is the wrong length.');
  const bodies: Body[] = [];
  let maxId = 0;
  for (let nBody = 0; nBody < bodyCount; nBody++) {
    const kind = KINDS[bytes[o]] ?? 'box';
    const body: Body = {
      id: view.getUint32(o + 44, true),
      kind,
      x: view.getFloat32(o + 4, true),
      y: view.getFloat32(o + 8, true),
      vx: view.getFloat32(o + 12, true),
      vy: view.getFloat32(o + 16, true),
      angle: view.getFloat32(o + 20, true),
      av: view.getFloat32(o + 24, true),
      hw: view.getFloat32(o + 28, true),
      hh: view.getFloat32(o + 32, true),
      health: view.getFloat32(o + 36, true),
      maxHealth: view.getFloat32(o + 40, true),
      grounded: false,
      asleep: bytes[o + 1] === 1,
      sleep: bytes[o + 1] === 1 ? 9 : 0,
      hurt: '',
    };
    if (body.id > maxId) maxId = body.id;
    bodies.push(body);
    o += BODY_BYTES;
  }
  sim.bodies = bodies;
  sim.nextBodyId = maxId + 1;
  sim.nextPortal = bytes[10] === 2 ? 2 : 1;
  sim.rng.state = view.getInt32(12, true);
  sim.frame = view.getUint32(16, true);
  sim.charge.fill(0);
  sim.recomputeCounts();
  sim.resetScores();
  sim.wakeAll();
}
