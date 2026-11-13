import { El, RETIRED } from './elements';
import type { Simulation } from './simulation';
import { AMBIENT } from './tuning';

const MAGIC = [0x50, 0x58, 0x53, 0x42]; // PXSB
const VERSION = 1;
const HEADER = 20;
const BODY_BYTES = 48;

/** Binary world snapshot. Older files may still carry unused rigid-body bytes. */
export function encodeWorld(sim: Simulation): Uint8Array {
  const n = sim.w * sim.h;
  const bytes = new Uint8Array(HEADER + n * 6 + 2 + 4);
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
  view.setUint16(o, 0, true);
  o += 2;
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
  o += bodyCount * BODY_BYTES;
  sim.nextPortal = bytes[10] === 2 ? 2 : 1;
  sim.rng.state = view.getInt32(12, true);
  sim.frame = view.getUint32(16, true);
  sim.charge.fill(0);
  sim.recomputeCounts();
  sim.resetScores();
  sim.wakeAll();
}
