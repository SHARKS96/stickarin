/**
 * Satinstich: dichtes Zickzack quer über eine schmale Säule.
 * Aufbau wie in TEST2: Mittellauf, Zickzack-Unterlage, dann die Deckschicht.
 */
import { MAX_STITCH_MM, PULL_COMPENSATION_MM, SATIN_SPACING_MM } from '../constants.ts';
import type { Point } from '../types.ts';

export interface SatinOptions {
  /** Abstand Spitze zu Spitze. */
  spacing?: number;
  /** Zugausgleich je Seite; die Säule wird vorab verbreitert. */
  pullCompensation?: number;
}

/** Punkte entlang einer Mittellinie, in gleichen Abständen abgetastet. */
function resample(path: Point[], step: number): Point[] {
  if (path.length < 2) return [...path];
  const out: Point[] = [path[0] as Point];
  let carry = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Point;
    const b = path[i] as Point;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    let t = carry;
    while (t + step <= len) {
      t += step;
      out.push({ x: a.x + ((b.x - a.x) * t) / len, y: a.y + ((b.y - a.y) * t) / len });
    }
    carry = t - len;
  }
  const last = path[path.length - 1] as Point;
  const tail = out[out.length - 1] as Point;
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > 1e-6) out.push(last);
  return out;
}

/** Normale an der Stelle i der Mittellinie. */
function normalAt(pts: Point[], i: number): Point {
  const a = pts[Math.max(0, i - 1)] as Point;
  const b = pts[Math.min(pts.length - 1, i + 1)] as Point;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

/**
 * Baut die drei Lagen einer Satinsäule entlang `center` mit Breite `width`.
 * Rückgabe sind fertige Stichpfade in Stickreihenfolge.
 */
export function satinLayers(
  center: Point[],
  width: number,
  options: SatinOptions = {},
): { centerRun: Point[]; underlay: Point[]; top: Point[] } {
  const { spacing = SATIN_SPACING_MM, pullCompensation = PULL_COMPENSATION_MM } = options;
  const half = width / 2 + pullCompensation;

  const centerRun = resample(center, MAX_STITCH_MM);

  // Zickzack-Unterlage: breiter abgetastet, etwas innerhalb der Kante.
  const coarse = resample(center, Math.max(spacing * 4, 1.5));
  const underlay: Point[] = [];
  coarse.forEach((p, i) => {
    const n = normalAt(coarse, i);
    const s = i % 2 === 0 ? 1 : -1;
    const d = half * 0.7;
    underlay.push({ x: p.x + n.x * d * s, y: p.y + n.y * d * s });
  });

  // Deckschicht: Spitze zu Spitze im Abstand `spacing`.
  const fine = resample(center, spacing);
  const top: Point[] = [];
  fine.forEach((p, i) => {
    const n = normalAt(fine, i);
    const s = i % 2 === 0 ? 1 : -1;
    top.push({ x: p.x + n.x * half * s, y: p.y + n.y * half * s });
  });

  return { centerRun, underlay, top };
}
