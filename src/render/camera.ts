export interface View {
  ox: number;
  oy: number;
  dw: number;
  dh: number;
  camX: number;
  camY: number;
  viewW: number;
  viewH: number;
  scale: number;
}

export function layoutView(
  cssW: number,
  cssH: number,
  gridW: number,
  gridH: number,
  zoom: number,
  panX: number,
  panY: number,
): View {
  const z = Math.min(5, Math.max(1, zoom));
  const fit = Math.min(cssW / gridW, cssH / gridH);
  const scale = fit * z;
  let viewW = cssW / scale;
  let viewH = cssH / scale;
  if (viewW > gridW) viewW = gridW;
  if (viewH > gridH) viewH = gridH;
  const dw = viewW * scale;
  const dh = viewH * scale;
  const ox = (cssW - dw) / 2;
  const oy = (cssH - dh) / 2;
  const maxX = Math.max(0, gridW - viewW);
  const maxY = Math.max(0, gridH - viewH);
  const camX = Math.min(maxX, Math.max(0, panX));
  const camY = Math.min(maxY, Math.max(0, panY));
  return { ox, oy, dw, dh, camX, camY, viewW, viewH, scale };
}

export function cellFromLocal(
  localX: number,
  localY: number,
  view: View,
  gridW: number,
  gridH: number,
): { x: number; y: number } | null {
  if (localX < view.ox || localY < view.oy || localX >= view.ox + view.dw || localY >= view.oy + view.dh) {
    return null;
  }
  const fx = (localX - view.ox) / view.dw;
  const fy = (localY - view.oy) / view.dh;
  const x = Math.floor(view.camX + fx * view.viewW);
  const y = Math.floor(view.camY + fy * view.viewH);
  if (x < 0 || y < 0 || x >= gridW || y >= gridH) return null;
  return { x, y };
}

/** Move the camera with a finger. Positive dx/dy follow the finger. Clamped to the world. */
export function panBy(
  camX: number,
  camY: number,
  dxPx: number,
  dyPx: number,
  scale: number,
  gridW: number,
  gridH: number,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  const safe = scale > 0.0001 ? scale : 1;
  let x = camX - dxPx / safe;
  let y = camY - dyPx / safe;
  const maxX = Math.max(0, gridW - viewW);
  const maxY = Math.max(0, gridH - viewH);
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x > maxX) x = maxX;
  if (y > maxY) y = maxY;
  return { x, y };
}

/** Keep the cell under a pinch focal point (0–1 across the view) stable. */
export function panForZoom(
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  fx: number,
  fy: number,
  newViewW: number,
  newViewH: number,
  gridW: number,
  gridH: number,
): { x: number; y: number } {
  const cellX = camX + fx * viewW;
  const cellY = camY + fy * viewH;
  let x = cellX - fx * newViewW;
  let y = cellY - fy * newViewH;
  x = Math.min(Math.max(0, gridW - newViewW), Math.max(0, x));
  y = Math.min(Math.max(0, gridH - newViewH), Math.max(0, y));
  return { x, y };
}
