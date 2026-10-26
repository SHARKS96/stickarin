/** Zeigt den Stichplan so, wie er gestickt wird. */
import { useEffect, useRef } from 'react';
import { planBounds } from '../core/types.ts';
import type { StitchPlan } from '../core/types.ts';
import { drawPlan } from './drawPlan.ts';

interface Props {
  plan: StitchPlan;
  /** Längste Kante der Zeichenfläche in CSS-Pixeln. */
  maxSize?: number;
}

export function StitchPreview({ plan, maxSize = 420 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = drawPlan(canvas, plan, maxSize, dpr);
    if (!size) return;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
  }, [plan, maxSize]);

  const b = planBounds(plan);
  const label = `Vorschau des Stickbilds, ${(b.maxX - b.minX).toFixed(0)} mal ${(
    b.maxY - b.minY
  ).toFixed(0)} Millimeter`;

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      style={{ maxWidth: '100%', height: 'auto', borderRadius: 12 }}
    />
  );
}
