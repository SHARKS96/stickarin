/**
 * Füllstich (Tatami): parallele Reihen hin und her, die Einstiche von Reihe
 * zu Reihe versetzt. Ohne diesen Versatz liegen alle Einstiche übereinander
 * und es entstehen die Streifen aus TEST1.
 *
 * Eine Reihe kann die Fläche mehrfach schneiden — bei einem U, einem Ring
 * oder jeder Form mit Loch. Jede Teilstrecke wird einzeln bestickt; der
 * Aufrufer entscheidet, ob er dazwischen springt.
 */
import {
  FILL_SPACING_MM,
  FILL_STAGGER,
  MAX_STITCH_MM,
  MIN_STITCH_MM,
  PULL_COMPENSATION_MM,
} from '../constants.ts';
import { rotate, rotateShape, scanlineSpans, shapeBounds } from '../geometry/polygon.ts';
import type { Shape } from '../geometry/polygon.ts';
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
 * Liefert die Teilstrecken als Punktlisten, in Stickreihenfolge.
 * Die Reihen wechseln die Richtung, damit der Faden kurze Wege hat.
 */
export function tatamiRows(shape: Shape, options: TatamiOptions = {}): Point[][] {
  const {
    spacing = FILL_SPACING_MM,
    angle = 0,
    stitchLength = MAX_STITCH_MM,
    stagger = FILL_STAGGER,
    pullCompensation = PULL_COMPENSATION_MM,
  } = options;

  // In ein Koordinatensystem drehen, in dem die Reihen waagerecht liegen.
  const local = rotateShape(shape, -angle);
  const b = shapeBounds(local);
  if (!isFinite(b.minY) || b.maxY - b.minY < 1e-9) return [];

  const rows: Point[][] = [];
  let index = 0;

  for (let y = b.minY + spacing / 2; y <= b.maxY; y += spacing, index++) {
    const spans = scanlineSpans(local, y);
    if (spans.length === 0) continue;

    const offset = (index * stagger * stitchLength) % stitchLength;
    const forward = index % 2 === 0;
    // Innerhalb einer Reihe die Strecken in Laufrichtung abarbeiten.
    const ordered = forward ? spans : [...spans].reverse();

    for (const [rawLeft, rawRight] of ordered) {
      // Zugausgleich: die Strecke nach beiden Seiten verbreitern.
      const left = rawLeft - pullCompensation;
      const right = rawRight + pullCompensation;
      if (right - left < MIN_STITCH_MM) continue;

      const xs: number[] = [left];
      for (let x = left + offset; x < right; x += stitchLength) {
        if (x - (xs[xs.length - 1] as number) >= MIN_STITCH_MM) xs.push(x);
      }
      // Den letzten Einstich nicht direkt neben den vorletzten setzen.
      if (right - (xs[xs.length - 1] as number) < MIN_STITCH_MM && xs.length > 1) xs.pop();
      xs.push(right);

      const run = forward ? xs : [...xs].reverse();
      rows.push(run.map((x) => rotate({ x, y }, angle)));
    }
  }

  return rows;
}
