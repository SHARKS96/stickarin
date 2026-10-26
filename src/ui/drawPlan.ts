/**
 * Zeichnet einen Stichplan auf eine Zeichenfläche.
 *
 * Getrennt von der React-Komponente, weil das Vorschaubild für die
 * Galerie entsteht, wenn der Vorschau-Schirm längst ausgehängt ist — es
 * darf also nicht von einer eingehängten Zeichenfläche abhängen.
 *
 * Sprünge bleiben unsichtbar: Sie sind lose Fäden, die abgeschnitten
 * werden, und würden das Bild nur unruhig machen.
 */
import { planBounds } from '../core/types.ts';
import type { StitchPlan, ThreadColor } from '../core/types.ts';

/** Stofffarbe als Grund — so sieht man, was gestickt wird und was nicht. */
export const CLOTH = '#f4efe6';

const MARGIN_MM = 3;

export interface DrawResult {
  width: number;
  height: number;
}

/**
 * Richtet die Zeichenfläche auf den Plan aus und malt ihn.
 * `maxSize` ist die längste Kante in CSS-Pixeln.
 */
export function drawPlan(
  canvas: HTMLCanvasElement,
  plan: StitchPlan,
  maxSize: number,
  dpr = 1,
): DrawResult | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const b = planBounds(plan);
  const wMm = b.maxX - b.minX + 2 * MARGIN_MM;
  const hMm = b.maxY - b.minY + 2 * MARGIN_MM;
  const scale = maxSize / Math.max(wMm, hMm);
  const width = Math.max(1, Math.round(wMm * scale));
  const height = Math.max(1, Math.round(hMm * scale));

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = CLOTH;
  ctx.fillRect(0, 0, width, height);

  const toX = (x: number) => (x - b.minX + MARGIN_MM) * scale;
  const toY = (y: number) => (y - b.minY + MARGIN_MM) * scale;

  const fallback: ThreadColor = { r: 40, g: 40, b: 40, name: '', catalog: '' };
  let colorIndex = 0;
  let thread = plan.threads[0] ?? fallback;
  let prev: { x: number; y: number } | null = null;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(0.8, scale * 0.3);

  for (const e of plan.entries) {
    if (e.kind === 'colorChange') {
      colorIndex++;
      thread = plan.threads[colorIndex] ?? fallback;
      prev = null;
      continue;
    }
    if (e.kind === 'trim') {
      prev = null;
      continue;
    }
    if (e.kind === 'jump') {
      prev = { x: toX(e.x), y: toY(e.y) };
      continue;
    }
    const cur = { x: toX(e.x), y: toY(e.y) };
    if (prev) {
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(cur.x, cur.y);
      ctx.strokeStyle = `rgb(${thread.r},${thread.g},${thread.b})`;
      ctx.stroke();
    }
    prev = cur;
  }

  return { width, height };
}

/** Kleines PNG des Stickbilds, für die Kachel auf der Startseite. */
export function planThumbnail(plan: StitchPlan, maxSize = 320): string {
  try {
    const canvas = document.createElement('canvas');
    if (!drawPlan(canvas, plan, maxSize)) return '';
    return canvas.toDataURL('image/png');
  } catch {
    // Eine fehlende Kachel ist kein Grund, das Speichern scheitern zu lassen.
    return '';
  }
}
