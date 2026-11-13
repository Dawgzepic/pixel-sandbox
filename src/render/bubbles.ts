/** Water at or above this temperature draws rising bubbles, then becomes steam past 100. */
export const BUBBLE_TEMP = 88;

/**
 * A boiling cell shows a bubble on some frames. Increasing the frame moves the
 * lit cells toward smaller y, which is upward on the canvas.
 */
export function showsBubble(x: number, y: number, frame: number, temp: number): boolean {
  if (temp < BUBBLE_TEMP) return false;
  const rise = Math.floor(frame / 3);
  const band = (y + rise) % 5;
  const lane = (x * 2 + Math.floor(rise / 5)) % 3;
  return band === 0 && lane !== 1;
}
