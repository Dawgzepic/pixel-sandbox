import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { El } from '../src/sim/elements';
import { Simulation } from '../src/sim/simulation';
import { applySlot, deleteSlot, listSlots, loadSlot, saveSlot } from '../src/storage/saves';
import { readStars, writeStar } from '../src/storage/stars';

describe('indexedDB slots', () => {
  it('saves, lists, loads, and deletes named worlds', async () => {
    const world = new Simulation(20, 18, 5);
    world.setCell(4, 4, El.Lava);
    world.setCell(5, 6, El.Salt);
    const thumb = 'data:image/png;base64,aaaa';
    await saveSlot(0, 'Camp', world, thumb);
    await saveSlot(2, '   ', world, thumb);
    const slots = await listSlots();
    expect(slots[0]?.name).toBe('Camp');
    expect(slots[0]?.thumbnail).toBe(thumb);
    expect(slots[1]).toBeNull();
    expect(slots[2]?.name).toBe('World');

    const loaded = await loadSlot(0);
    expect(loaded).not.toBeNull();
    const fresh = new Simulation(20, 18, 1);
    applySlot(fresh, loaded!);
    expect(fresh.get(4, 4)).toBe(El.Lava);
    expect(fresh.get(5, 6)).toBe(El.Salt);

    await deleteSlot(0);
    expect(await loadSlot(0)).toBeNull();
  });
});

describe('challenge stars', () => {
  it('remembers completions in local storage', () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
    };
    expect(readStars(storage)).toEqual([]);
    writeStar(storage, 'giant-foam');
    writeStar(storage, 'giant-foam');
    writeStar(storage, 'make-stone');
    expect(readStars(storage).sort()).toEqual(['giant-foam', 'make-stone']);
  });
});
