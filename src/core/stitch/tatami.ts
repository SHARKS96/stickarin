/**
 * Füllstich (Tatami): parallele Reihen hin und her, die Einstiche von Reihe
 * zu Reihe versetzt. Ohne diesen Versatz liegen alle Einstiche übereinander
 * und es entstehen die Streifen aus TEST1.
 */
import {
  FILL_SPACING_MM,
  FILL_STAGGER,
  MAX_STITCH_MM,
  MIN_STITCH_MM,
  PULL_COMPENSATION_MM,
} from '../constants.ts';
import { rotate, scanlineSpan } from '../geometry/polygon.ts';
import type { Polygon } from '../geometry/polygon.ts';
import type { Point } from '../types.ts';

export interface TatamiOptions {
  /** Reihenabstand in mm; kleiner = dichter. */
  spacing?: number;
  /** Reihenwinkel im Bogenmaß. */
  angle?: number;
  /** Stichlänge innerhalb einer Reihe. */
  stitchLength?: number;
  /** Versatz der Einstiche je Reihe, als Anteil der Stichlänge. */
  stagger?: number;
  /** Zugausgleich je Seite. */
  pullCompensation?: number;
}

/**
 * Liefert die Reihen als Punktlisten. Die Reihen wechseln die Richtung,
 * sodass der Faden ohne Sprung durchlaufen kann.
 */
export function tatamiRows(poly: Polygon, options: TatamiOptions = {}): Point[][] {
  const {
    spacing = FILL_SPACING_MM,
    angle = 0,
    stitchLength = MAX_STITCH_MM,
    stagger = FILL_STAGGER,
    pullCompensation = PULL_COMPENSATION_MM,
  } = options;

  // In ein Koordinatensystem drehen, in dem die Reihen waagerecht liegen.
  const local = poly.map((p) => rotate(p, -angle));
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of local) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!isFinite(minY) || maxY - minY < 1e-9) return [];

  const rows: Point[][] = [];
  let index = 0;
  for (let y = minY + spacing / 2; y <= maxY; y += spacing, index++) {
    const span = scanlineSpan(local, y);
    if (!span) continue;
    const [rawLeft, rawRight] = span;
    // Zugausgleich: die Reihe nach beiden Seiten verbreitern.
    const left = rawLeft - pullCompensation;
    const right = rawRight + pullCompensation;
    if (right - left < MIN_STITCH_MM) continue;

    const offset = (index * stagger * stitchLength) % stitchLength;
    const xs: number[] = [left];
    for (let x = left + offset; x < right; x += stitchLength) {
      if (x - (xs[xs.length - 1] as number) >= MIN_STITCH_MM) xs.push(x);
    }
    // Den letzten Einstich nicht direkt neben den vorletzten setzen.
    if (right - (xs[xs.length - 1] as number) < MIN_STITCH_MM && xs.length > 1) xs.pop();
    xs.push(right);

    const forward = index % 2 === 0;
    const ordered = forward ? xs : [...xs].reverse();
    rows.push(ordered.map((x) => rotate({ x, y }, angle)));
  }

  return rows;
}
