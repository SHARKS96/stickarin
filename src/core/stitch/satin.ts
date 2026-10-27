/**
 * Satinstich: dichtes Zickzack quer über eine schmale Säule.
 * Aufbau wie in TEST2: Mittellauf, Zickzack-Unterlage, dann die Deckschicht.
 *
 * Der Satinstich braucht eine Richtung: Die Sprossen müssen über die
 * **schmale** Seite laufen, sonst wird aus dem Glanzstich ein Gitter aus
 * langen Fäden. Früher kam diese Richtung aus dem umschließenden Rechteck,
 * und die Sprossen liefen quer über dessen ganze Breite — bei einer
 * Strichform wie einer „7“ lagen damit über zwei Drittel der Stiche
 * außerhalb der Fläche, der längste maß 52 mm.
 *
 * Darum hier: Die Form wird in Reihen geschnitten wie beim Füllstich, und
 * jede Teilstrecke wird eine Sprosse. Was außerhalb liegt, gibt es nicht
 * mehr. Die Richtung wird gesucht statt geraten — genommen wird die, in
 * der die Sprossen im Mittel am kürzesten sind.
 */
import {
  MAX_STITCH_MM,
  MIN_STITCH_MM,
  PULL_COMPENSATION_MM,
  SATIN_MAX_WIDTH_MM,
  SATIN_SPACING_MM,
} from '../constants.ts';
import { normalizeShape, rotate } from '../geometry/polygon.ts';
import type { Shape } from '../geometry/polygon.ts';
import { spanLanes } from './tatami.ts';
import type { Span } from './tatami.ts';
import { coveredArea, staysInside } from './travel.ts';
import type { StitchBuilder } from './builder.ts';
import type { Point } from '../types.ts';

export interface SatinOptions {
  /** Abstand Spitze zu Spitze. */
  spacing?: number;
  /** Richtung der Sprossen im Bogenmaß; fehlt sie, wird sie gesucht. */
  angle?: number;
  /** Zugausgleich je Seite. */
  pullCompensation?: number;
}

/** Richtungen, unter denen die Form vermessen wird. */
const ANGLE_STEPS = 12;

/**
 * Richtung und Breite der Säule.
 *
 * Gesucht ist die Richtung, in der die Form am schmalsten ist: Läuft der
 * Schnitt quer zur Säule, sind die Teilstrecken kurz; längs dazu werden sie
 * so lang wie die Säule. `width` ist die mittlere Länge in dieser Richtung
 * — also die Breite, die eine Sprosse zu überbrücken hat.
 *
 * Das umschließende Rechteck taugt dafür nicht: Bei einer „7“ ist es
 * vierzig Millimeter in beide Richtungen, der Strich selbst aber acht.
 */
export function satinMetrics(shape: Shape): { angle: number; width: number } {
  let angle = 0;
  let width = Infinity;
  for (let i = 0; i < ANGLE_STEPS; i++) {
    const candidate = (i * Math.PI) / ANGLE_STEPS;
    // Grob abtasten — gesucht ist die Richtung, nicht ihr genauer Wert.
    const mean = meanSpan(shape, candidate);
    if (mean !== null && mean < width) {
      width = mean;
      angle = candidate;
    }
  }
  return { angle, width: isFinite(width) ? width : 0 };
}

function meanSpan(shape: Shape, angle: number): number | null {
  let sum = 0;
  let n = 0;
  for (const lane of spanLanes(shape, { spacing: 1, angle, pullCompensation: 0 })) {
    for (const span of lane) {
      sum += span.right - span.left;
      n++;
    }
  }
  return n === 0 ? null : sum / n;
}

/**
 * Stickt die Fläche als Satin in den Builder: Mittellauf, Zickzack-Unterlage,
 * Deckschicht — je Bahn, damit der Faden nicht über Löcher läuft.
 */
export function satinArea(builder: StitchBuilder, raw: Shape, options: SatinOptions = {}): void {
  const { spacing = SATIN_SPACING_MM, pullCompensation = PULL_COMPENSATION_MM } = options;
  const shape = normalizeShape(raw);
  const angle = options.angle ?? satinMetrics(shape).angle;
  const covered = coveredArea(shape);

  const lanes = spanLanes(shape, { spacing, angle, pullCompensation });
  const back = (x: number, y: number) => rotate({ x, y }, angle);

  for (const lane of lanes) {
    if (lane.length === 0) continue;

    // 1. Mittellauf: hält den Stoff und bringt die Nadel an den Anfang.
    go(
      builder,
      covered,
      sample(lane, MAX_STITCH_MM).map((s) => back((s.left + s.right) / 2, s.y)),
      MAX_STITCH_MM,
    );

    // 2. Zickzack-Unterlage, etwas innerhalb der Kante.
    const coarse = sample(lane, Math.max(spacing * 4, 1.5));
    go(
      builder,
      covered,
      coarse.map((s, i) => {
        const mid = (s.left + s.right) / 2;
        const d = ((s.right - s.left) / 2) * 0.7;
        return back(i % 2 === 0 ? mid - d : mid + d, s.y);
      }),
      SATIN_MAX_WIDTH_MM,
    );

    // 3. Deckschicht: jede Reihe eine Sprosse von Kante zu Kante.
    const top: Point[] = [];
    lane.forEach((span, i) => {
      const ends = i % 2 === 0 ? [span.left, span.right] : [span.right, span.left];
      for (const x of splitRung(ends[0] as number, ends[1] as number)) top.push(back(x, span.y));
    });
    // Eine Sprosse ist **ein** Stich von Kante zu Kante — das ist der
    // Satinstich. Mit der üblichen Höchstlänge von 3 mm zerfiele sie in
    // Einstiche mitten in der Säule, und der Glanz wäre weg.
    go(builder, covered, top, SATIN_MAX_WIDTH_MM);
  }
}

/**
 * Eine Sprosse in Einstiche zerlegen.
 *
 * Normalerweise ist das ein einziger Stich von Kante zu Kante — das ist der
 * Satinstich. Ist die Stelle breiter, als ein Satinstich tragen kann, wird
 * unterteilt: Ein 30-mm-Faden läge lose auf dem Stoff und bliebe an allem
 * hängen. Die Maschine kann ohnehin nur 12,7 mm je Datensatz.
 */
function splitRung(from: number, to: number): number[] {
  const len = Math.abs(to - from);
  if (len <= SATIN_MAX_WIDTH_MM) return [from, to];
  const parts = Math.ceil(len / MAX_STITCH_MM);
  const out: number[] = [];
  for (let i = 0; i <= parts; i++) out.push(from + ((to - from) * i) / parts);
  return out;
}

/** Jede n-te Reihe einer Bahn, sodass der Abstand etwa `step` beträgt. */
function sample(lane: Span[], step: number): Span[] {
  const first = lane[0] as Span;
  const last = lane[lane.length - 1] as Span;
  const spacing = lane.length > 1 ? Math.abs(last.y - first.y) / (lane.length - 1) : step;
  const every = Math.max(1, Math.round(step / Math.max(spacing, 1e-6)));
  const out = lane.filter((_, i) => i % every === 0);
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** Einen Pfad sticken; der Weg dorthin nur, wenn er im Material bleibt. */
function go(builder: StitchBuilder, covered: Shape, path: Point[], maxLength: number): void {
  const first = path[0];
  if (!first) return;
  const here = builder.current;
  if (here && !staysInside(covered, here, first)) builder.moveTo(first);
  else builder.travelTo(first);

  let prev = first;
  for (const p of path) {
    // Zwei Einstiche dicht beieinander bringen nichts und kosten Zeit.
    if (p !== first && Math.hypot(p.x - prev.x, p.y - prev.y) < MIN_STITCH_MM) continue;
    builder.stitchTo(p, maxLength);
    prev = p;
  }
}
