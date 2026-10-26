/** Zeichnet den Stichplan so, wie er gestickt wird — Sprünge gestrichelt. */
import { useEffect, useRef } from 'react';
import { planBounds } from '../core/types.ts';
import type { StitchPlan, ThreadColor } from '../core/types.ts';

interface Props {
  plan: StitchPlan;
  /** Pixel je Millimeter. */
  scale?: number;
  showJumps?: boolean;
}

export function StitchPreview({ plan, scale = 4, showJumps = true }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const margin = 4;
    const b = planBounds(plan);
    const width = Math.max(1, Math.ceil((b.maxX - b.minX + 2 * margin) * scale));
    const height = Math.max(1, Math.ceil((b.maxY - b.minY + 2 * margin) * scale));
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const toX = (x: number) => (x - b.minX + margin) * scale;
    const toY = (y: number) => (y - b.minY + margin) * scale;

    const fallback: ThreadColor = { r: 40, g: 40, b: 40, name: '', catalog: '' };
    let colorIndex = 0;
    let thread = plan.threads[0] ?? fallback;
    let prev: { x: number; y: number } | null = null;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

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
      const cur = { x: toX(e.x), y: toY(e.y) };
      if (prev) {
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(cur.x, cur.y);
        if (e.kind === 'jump') {
          if (showJumps) {
            ctx.setLineDash([3, 4]);
            ctx.strokeStyle = 'rgba(150,150,150,0.8)';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        } else {
          ctx.setLineDash([]);
          ctx.strokeStyle = `rgb(${thread.r},${thread.g},${thread.b})`;
          ctx.lineWidth = Math.max(1, scale * 0.35);
          ctx.stroke();
        }
      }
      prev = cur;
    }
  }, [plan, scale, showJumps]);

  const b = planBounds(plan);
  const w = (b.maxX - b.minX).toFixed(1);
  const h = (b.maxY - b.minY).toFixed(1);

  return (
    <canvas ref={ref} role="img" aria-label={`Vorschau des Stickbilds, ${w} mal ${h} Millimeter`} />
  );
}
