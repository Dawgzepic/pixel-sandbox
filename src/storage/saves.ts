import type { Simulation } from '../sim/simulation';
import { decodeWorld, encodeWorld } from '../sim/serialize';

export interface SlotRecord {
  slot: number;
  name: string;
  savedAt: number;
  thumbnail: string;
  world: Uint8Array;
}

const DB_NAME = 'pixel-sandbox';
const STORE = 'slots';
export const SLOT_COUNT = 5;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function openDb(): Promise<IDBDatabase> {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'slot' });
  };
  return request(req);
}

export async function saveSlot(
  slot: number,
  name: string,
  sim: Simulation,
  thumbnail: string,
): Promise<void> {
  const db = await openDb();
  const record: SlotRecord = {
    slot,
    name: name.trim().slice(0, 24) || 'World',
    savedAt: Date.now(),
    thumbnail,
    world: encodeWorld(sim),
  };
  await request(db.transaction(STORE, 'readwrite').objectStore(STORE).put(record));
  db.close();
}

export async function loadSlot(slot: number): Promise<SlotRecord | null> {
  const db = await openDb();
  const raw = await request(db.transaction(STORE, 'readonly').objectStore(STORE).get(slot));
  db.close();
  if (!raw) return null;
  const record = raw as SlotRecord;
  record.world = toBytes(record.world);
  return record;
}

export async function listSlots(): Promise<Array<SlotRecord | null>> {
  const db = await openDb();
  const all = (await request(db.transaction(STORE, 'readonly').objectStore(STORE).getAll())) as SlotRecord[];
  db.close();
  const slots: Array<SlotRecord | null> = Array.from({ length: SLOT_COUNT }, () => null);
  for (const record of all) {
    if (record.slot < 0 || record.slot >= SLOT_COUNT) continue;
    record.world = toBytes(record.world);
    slots[record.slot] = record;
  }
  return slots;
}

export async function deleteSlot(slot: number): Promise<void> {
  const db = await openDb();
  await request(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(slot));
  db.close();
}

export function applySlot(sim: Simulation, record: SlotRecord): void {
  decodeWorld(sim, record.world);
}

function toBytes(world: Uint8Array | ArrayBuffer): Uint8Array {
  if (world instanceof Uint8Array) return world;
  return new Uint8Array(world);
}
