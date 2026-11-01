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
import { traceSpine } from './spine.ts';
import type { Rung } from './spine.ts';
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
  const covered = coveredArea(shape);

  // Der bessere Weg zuerst: Sprossen quer zur Mittellinie, deren Winkel mit
  // der Form mitdreht. Nur wenn die Form dafür nicht taugt — verzweigt oder
  // zu klein fürs Raster — bleibt der feste Winkel.
  if (options.angle === undefined) {
    const spine = traceSpine(shape, spacing);
    if (spine) {
      alongSpine(builder, covered, spine.path, spine.rungs, spacing, pullCompensation);
      return;
    }
  }

  const angle = options.angle ?? satinMetrics(shape).angle;
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
 * Die drei Lagen entlang der Mittellinie: Mittellauf, Zickzack-Unterlage,
 * Sprossen. Derselbe Aufbau wie beim festen Winkel — nur dass jede Sprosse
 * ihre eigene Richtung hat.
 */
function alongSpine(
  builder: StitchBuilder,
  covered: Shape,
  path: Point[],
  rungs: Rung[],
  spacing: number,
  pullCompensation: number,
): void {
  // 1. Mittellauf: hält den Stoff und bringt die Nadel an den Anfang.
  const mitte = everyNth(path, Math.max(1, Math.round(MAX_STITCH_MM / spacing)));

  // 2. Zickzack-Unterlage, etwas innerhalb der Kante.
  const schritt = Math.max(1, Math.round(Math.max(spacing * 4, 1.5) / spacing));
  const unten = everyNth(rungs, schritt).map((r, i) => lerp(r, i % 2 === 0 ? 0.15 : 0.85));

  // 3. Deckschicht. Ein Satinstich setzt **einen** Einstich je Sprosse,
  //    abwechselnd links und rechts: Jeder Stich kreuzt die Säule und
  //    rückt dabei um einen Abstand vor. Zwei Einstiche je Sprosse wären
  //    die doppelte Dichte und ein Stich der Länge null dazwischen.
  //
  //    Der Zugausgleich ist ein Maß in Millimetern — auf der Sprosse also
  //    ein Anteil ihrer Länge. Zu breite Sprossen zerlegt der Builder.
  //    In einer engen Innenkurve laufen die Sprossen fächerförmig auf
  //    dieselbe Stelle zu. Alle zu sticken hieße, zwanzigmal in dasselbe
  //    Loch zu stechen — ein Garnnest. Darum je Seite einen Mindestabstand
  //    halten und dazwischenliegende Sprossen auslassen; der Fächer wird
  //    dadurch luftiger, die Außenkante bleibt dicht.
  const oben: Point[] = [];
  const zuletzt: (Point | null)[] = [null, null];
  rungs.forEach((r, i) => {
    const seite = i % 2;
    const ueber = pullCompensation / len(r);
    const p = lerp(r, seite === 0 ? -ueber : 1 + ueber);
    const vorher = zuletzt[seite];
    if (vorher && Math.hypot(p.x - vorher.x, p.y - vorher.y) < MIN_STITCH_MM) return;
    zuletzt[seite] = p;
    oben.push(p);
  });

  // Jede Lage dort beginnen, wo die vorige aufgehört hat. Sonst läuft der
  // Faden zwischen den Lagen einmal die ganze Säule zurück.
  for (const lage of [mitte, unten, oben]) {
    go(builder, covered, nearestFirst(builder.current, lage), SATIN_MAX_WIDTH_MM);
  }
}

/** Den Pfad so herum, dass sein Anfang näher an `here` liegt. */
function nearestFirst(here: Point | null, path: Point[]): Point[] {
  const first = path[0];
  const last = path[path.length - 1];
  if (!here || !first || !last) return path;
  const d = (p: Point) => Math.hypot(p.x - here.x, p.y - here.y);
  return d(last) < d(first) ? [...path].reverse() : path;
}

const len = (r: Rung) => Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y) || 1;

/** Punkt auf der Sprosse; `t` 0 = Anfang, 1 = Ende, außerhalb = verlängert. */
function lerp(r: Rung, t: number): Point {
  return { x: r.a.x + (r.b.x - r.a.x) * t, y: r.a.y + (r.b.y - r.a.y) * t };
}

function everyNth<T>(list: T[], n: number): T[] {
  const out = list.filter((_, i) => i % n === 0);
  const last = list[list.length - 1] as T;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
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
