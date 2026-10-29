/**
 * Striche sticken: entlang des Pfades, nicht in eine Fläche gefüllt.
 *
 * Eine Vektorzeichnung besteht nicht nur aus Flächen. Ein Umriss, ein
 * Schriftzug aus Linien, eine Zeichnung mit der Feder — das sind Pfade mit
 * einer Strichbreite. Als Fläche gefüllt zerfiele ein 0,3 mm dünner Strich
 * in eine Reihe Einzelstiche; entlang des Pfades gestickt wird er eine
 * Linie, so wie er gemeint war.
 *
 * Zwei Sticharten, die Breite entscheidet:
 *
 * - **Steppstich** für dünne Striche: eine Reihe Stiche auf dem Pfad.
 * - **Satin** für breitere: Zickzack quer über den Pfad, Spitze an Spitze.
 *
 * Beides braucht gleichmäßige Abstände. Die Stützpunkte des Pfades taugen
 * dafür nicht: Aus einer Bézierkurve kommen sie hundertfach dicht, aus
 * einer langen Geraden zu zweit. Darum wird jeder Pfad zuerst nach
 * Bogenlänge neu abgetastet.
 */
import {
  MAX_STITCH_MM,
  MIN_STITCH_MM,
  PULL_COMPENSATION_MM,
  RUN_STITCH_MM,
  SATIN_MAX_WIDTH_MM,
  SATIN_SPACING_MM,
} from '../constants.ts';
import type { Point } from '../types.ts';
import { StitchBuilder, dist } from './builder.ts';

export interface RunLineOptions {
  /** Stichlänge auf dem Pfad. */
  stitchLength?: number;
}

/** Steppstich entlang des Pfades. */
export function runLine(
  builder: StitchBuilder,
  path: Point[],
  closed: boolean,
  options: RunLineOptions = {},
): void {
  const step = Math.max(options.stitchLength ?? RUN_STITCH_MM, MIN_STITCH_MM);
  const points = resample(path, closed, step, false);
  if (points.length < 2) return;
  if (closed) builder.runLoop(points, step);
  else builder.runPath(points, step);
}

export interface SatinLineOptions {
  /** Breite des Strichs in mm. */
  width: number;
  /** Abstand Spitze zu Spitze. */
  spacing?: number;
  /** Zugausgleich je Seite. */
  pullCompensation?: number;
}

/**
 * Satinstich quer über den Pfad.
 *
 * Erst ein Mittellauf als Unterlage — er hält den Stoff und bringt die
 * Nadel an den Anfang —, dann der Zickzack. Die Sprossen wechseln die Seite
 * von Stützpunkt zu Stützpunkt; bei 0,4 mm Abstand steht eine Sprosse
 * damit praktisch quer.
 */
export function satinLine(
  builder: StitchBuilder,
  path: Point[],
  closed: boolean,
  options: SatinLineOptions,
): void {
  const spacing = Math.max(options.spacing ?? SATIN_SPACING_MM, 0.05);
  const pull = options.pullCompensation ?? PULL_COMPENSATION_MM;
  const half = Math.max(options.width / 2 + pull, 0.05);

  // Bei einem geschlossenen Zug muss die Zahl der Stützpunkte gerade sein,
  // sonst träfe die letzte Sprosse auf derselben Seite auf wie die erste.
  const centers = resample(path, closed, spacing, closed);
  if (centers.length < 2) return;

  const normals = normalsOf(centers, closed);

  // 1. Mittellauf. Auch beim geschlossenen Zug der Reihe nach, nicht als
  // Rundlauf: Die Deckschicht wechselt von Punkt zu Punkt die Seite, und
  // ein Rundlauf fängt dort an, wo die Nadel gerade steht — das verschöbe
  // die Sprossen gegen den Pfad.
  const underlay = thinOut(centers, MAX_STITCH_MM);
  if (closed) underlay.push(underlay[0] as Point);
  builder.runPath(underlay, MAX_STITCH_MM);

  // 2. Deckschicht: Zickzack. Eine Sprosse ist **ein** Stich von Kante zu
  // Kante — unterteilt wird erst, wenn sie breiter ist, als ein Satinstich
  // am Stück tragen kann.
  const zigzag: Point[] = centers.map((c, i) => {
    const n = normals[i] as Point;
    const side = i % 2 === 0 ? half : -half;
    return { x: c.x + n.x * side, y: c.y + n.y * side };
  });
  if (closed) zigzag.push(zigzag[0] as Point);
  builder.runPath(zigzag, SATIN_MAX_WIDTH_MM);
}

/**
 * Pfad nach Bogenlänge neu abtasten.
 *
 * `step` ist der gewünschte Abstand; der tatsächliche wird so angepasst,
 * dass der letzte Punkt genau auf dem Ende liegt — ein Reststück von
 * einem Zehntelmillimeter am Ende wäre ein Stich unter der Mindestlänge.
 */
export function resample(
  path: Point[],
  closed: boolean,
  step: number,
  evenCount: boolean,
): Point[] {
  const points = closed && path.length > 1 ? [...path, path[0] as Point] : path;
  if (points.length < 2) return [...points];

  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = dist(points[i - 1] as Point, points[i] as Point);
    lengths.push(d);
    total += d;
  }
  if (total < 1e-9) return [points[0] as Point];

  let count = Math.max(1, Math.round(total / step));
  if (evenCount && count % 2 === 1) count++;
  const exact = total / count;

  const out: Point[] = [points[0] as Point];
  let segment = 0;
  let walked = 0;
  for (let i = 1; i < count; i++) {
    const target = i * exact;
    while (segment < lengths.length - 1 && walked + (lengths[segment] as number) < target) {
      walked += lengths[segment] as number;
      segment++;
    }
    const len = lengths[segment] as number;
    const t = len < 1e-9 ? 0 : (target - walked) / len;
    const a = points[segment] as Point;
    const b = points[segment + 1] as Point;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  // Beim geschlossenen Zug ist der letzte Punkt der erste; den hält der
  // Rundlauf selbst nach.
  if (!closed) out.push(points[points.length - 1] as Point);
  return out;
}

/**
 * Einheitsnormale je Stützpunkt.
 *
 * Genommen wird die Richtung zwischen Vorgänger und Nachfolger: An einer
 * Ecke steht die Sprosse so in der Winkelhalbierenden und nicht quer zu
 * einer der beiden Kanten.
 */
function normalsOf(points: Point[], closed: boolean): Point[] {
  const n = points.length;
  return points.map((_, i) => {
    const prev = points[i === 0 ? (closed ? n - 1 : 0) : i - 1] as Point;
    const next = points[i === n - 1 ? (closed ? 0 : n - 1) : i + 1] as Point;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return { x: 0, y: 1 };
    return { x: -dy / len, y: dx / len };
  });
}

/** Jeden n-ten Punkt, sodass der Abstand etwa `step` beträgt. */
function thinOut(points: Point[], step: number): Point[] {
  if (points.length < 3) return [...points];
  const first = points[0] as Point;
  const spacing = dist(first, points[1] as Point);
  const every = Math.max(1, Math.round(step / Math.max(spacing, 1e-6)));
  const out = points.filter((_, i) => i % every === 0);
  const last = points[points.length - 1] as Point;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
