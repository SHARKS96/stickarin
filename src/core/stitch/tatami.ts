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

  // Erst alle Teilstrecken einsammeln, dann zu Bahnen ordnen.
  const spans: Span[] = [];
  let index = 0;

  for (let y = b.minY + spacing / 2; y <= b.maxY; y += spacing, index++) {
    // Lage der Einstiche dieser Reihe im Stichraster.
    const phase = (index * stagger * stitchLength) % stitchLength;

    for (const [rawLeft, rawRight] of scanlineSpans(local, y)) {
      // Zugausgleich: die Strecke nach beiden Seiten verbreitern.
      const left = rawLeft - pullCompensation;
      const right = rawRight + pullCompensation;
      if (right - left < MIN_STITCH_MM) continue;

      // Die Einstiche sitzen auf einem **festen Raster**, nicht relativ zum
      // Anfang der Strecke. Das ist der Unterschied, der zählt: Wandert die
      // Kante je Reihe zufällig um genau das, was den Versatz auf ein volles
      // Stichraster ergänzt, lägen die Einstiche sonst exakt übereinander —
      // und die Fläche bekommt die Streifen aus TEST1.
      const xs: number[] = [left];
      const first = Math.ceil((left - phase) / stitchLength) * stitchLength + phase;
      for (let x = first; x < right; x += stitchLength) {
        if (x - (xs[xs.length - 1] as number) >= MIN_STITCH_MM) xs.push(x);
      }
      // Den letzten Einstich nicht direkt neben den vorletzten setzen.
      if (right - (xs[xs.length - 1] as number) < MIN_STITCH_MM && xs.length > 1) xs.pop();
      xs.push(right);

      spans.push({ row: index, y, left, right, xs });
    }
  }

  const rows: Point[][] = [];
  for (const lane of toLanes(spans)) {
    lane.forEach((span, i) => {
      // Innerhalb einer Bahn abwechselnd hin und her, damit der Faden
      // am Ende einer Reihe gleich die nächste beginnt.
      const run = i % 2 === 0 ? span.xs : [...span.xs].reverse();
      rows.push(run.map((x) => rotate({ x, y: span.y }, angle)));
    });
  }

  return rows;
}

/** Eine Teilstrecke einer Reihe, im gedrehten Koordinatensystem. */
interface Span {
  row: number;
  y: number;
  left: number;
  right: number;
  /** Die Einstiche von links nach rechts. */
  xs: number[];
}

/** Überlappen sich zwei Teilstrecken in x? */
function overlap(a: Span, b: Span): number {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left);
}

/**
 * Ordnet die Teilstrecken zu **Bahnen**: Folgen von Strecken, die in
 * aufeinanderfolgenden Reihen übereinanderliegen.
 *
 * Darauf kommt es an, sobald eine Fläche ein Loch oder eine Einbuchtung
 * hat. Reihe für Reihe zu sticken hieße dort, in jeder Reihe über das Loch
 * zu wechseln — und weil quer durch ein Loch nicht gestickt werden darf,
 * würde jede Reihe einen Fadenschnitt kosten. Bei einem Ring waren das
 * über hundert. Bahnweise bleibt der Faden auf seiner Seite und wechselt
 * nur einmal.
 *
 * Eine Bahn wird je Reihe höchstens einmal verlängert; passt keine, fängt
 * eine neue an. Das genügt für Ringe und U-Formen und bleibt linear.
 */
function toLanes(spans: Span[]): Span[][] {
  const lanes: Span[][] = [];
  let open: Span[][] = [];

  let i = 0;
  while (i < spans.length) {
    const row = (spans[i] as Span).row;
    const inRow: Span[] = [];
    while (i < spans.length && (spans[i] as Span).row === row) inRow.push(spans[i++] as Span);

    const stillOpen: Span[][] = [];
    const taken = new Set<Span[]>();

    for (const span of inRow) {
      // Die offene Bahn mit der größten Überlappung fortsetzen.
      let best: Span[] | null = null;
      let bestOverlap = 0;
      for (const lane of open) {
        if (taken.has(lane)) continue;
        const o = overlap(lane[lane.length - 1] as Span, span);
        if (o > bestOverlap) {
          bestOverlap = o;
          best = lane;
        }
      }

      if (best) {
        best.push(span);
        taken.add(best);
        stillOpen.push(best);
      } else {
        const lane = [span];
        lanes.push(lane);
        stillOpen.push(lane);
      }
    }

    open = stillOpen;
  }

  return lanes;
}
