const KEY = 'pixel-sandbox-stars';

export function readStars(storage: Pick<Storage, 'getItem'>): string[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export function writeStar(storage: Pick<Storage, 'getItem' | 'setItem'>, id: string): string[] {
  const next = new Set(readStars(storage));
  next.add(id);
  const list = [...next];
  storage.setItem(KEY, JSON.stringify(list));
  return list;
}
