/**
 * Mittellinie einer Form und die Sprossen quer dazu.
 *
 * Bisher bekam der Satinstich **eine** Richtung für die ganze Fläche. Bei
 * einer geraden Säule geht das; bei einer gebogenen Strähne nicht. In der
 * Referenzdatei (Lady_10, 28 000 Stiche) laufen die Sprossen quer über die
 * Form, und ihr Winkel dreht mit der Krümmung mit — das ist der sichtbare
 * Unterschied zwischen „liegt Garn drauf“ und „folgt der Form“.
 *
 * Eine echte Mittelachse zu rechnen ist aufwendig und empfindlich. Hier
 * steht stattdessen ein Weg, der mit groben Rastern auskommt und gerade
 * das liefert, was der Satinstich braucht:
 *
 *   1. Die Form in ein Raster legen.
 *   2. Zweimal in die Breite suchen: vom ersten Feld zum entferntesten,
 *      von dort zum entferntesten — das sind die beiden Enden der Form.
 *      (Entfernt heißt dabei: innerhalb der Form, nicht Luftlinie. Bei
 *      einer gebogenen Strähne liegen die Enden sonst nebeneinander.)
 *   3. Der Weg zwischen den Enden ist noch nicht die Mitte: Ein kürzester
 *      Weg drückt sich innen an jede Kurve. Also ein paarmal nachrücken —
 *      jeder Punkt wandert in die Mitte zwischen seine beiden Kanten.
 *   4. Glätten, abtasten, und an jedem Punkt quer bis zur Kante — das ist
 *      die Sprosse.
 *
 * „Quer“ heißt dabei: in Richtung der **nächstgelegenen Kante**, nicht
 * senkrecht zur Laufrichtung der Linie. Die Laufrichtung aus benachbarten
 * Punkten abzuleiten ist wackelig; kippt sie in einem engen Bogen auch nur
 * ein wenig, schießt die Sprosse längs durch die Form statt quer. Die
 * nächste Kante dagegen steht immer quer zur Säule.
 */
import { shapeBounds, scanlineSpans, shapeArea } from '../geometry/polygon.ts';
import type { Ring, Shape } from '../geometry/polygon.ts';
import type { Point } from '../types.ts';

/** Eine Sprosse, von Kante zu Kante quer über die Form. */
export interface Rung {
  a: Point;
  b: Point;
  /** Der Punkt auf der Mittellinie, zu dem sie gehört. */
  mid: Point;
}

export interface Spine {
  /** Die Mittellinie von einem Ende zum anderen. */
  path: Point[];
  rungs: Rung[];
}

/** Feinheit des Rasters; feiner kostet nur Rechenzeit. */
const CELL_MM = 0.25;

/** Obergrenze für das Raster, damit eine große Fläche nicht ausufert. */
const MAX_CELLS = 400_000;

/** Fenster der Glättung in mm — nimmt die Treppen des Rasters heraus. */
const SMOOTH_MM = 1.5;

/**
 * Wie oft die Linie in die Mitte nachrückt.
 *
 * Einmal holt den Großteil, zweimal reicht auch für enge Bögen. Mehr
 * bringt nichts: Die Linie sitzt dann schon auf der Mitte.
 */
const CENTRE_PASSES = 3;

/**
 * Deckt die Summe der Sprossen zu wenig von der Fläche ab, ist die Form
 * keine Strähne, sondern verzweigt. Dann taugt eine Mittellinie nicht.
 */
const MIN_COVERAGE = 0.6;

/**
 * Mittellinie und Sprossen, oder `null`, wenn die Form dafür nicht taugt:
 * zu klein fürs Raster, oder verzweigt statt strähnenförmig.
 */
export function traceSpine(shape: Shape, spacingMm: number): Spine | null {
  const grid = rasterize(shape);
  if (!grid) return null;

  const start = grid.cells.indexOf(1);
  if (start < 0) return null;

  const endA = farthest(grid, start).at;
  const { at: endB, from } = farthest(grid, endA);
  if (endA === endB) return null;

  const raw = walkBack(grid, from, endB, endA);
  if (raw.length < 2) return null;

  const rings = [shape.outer, ...shape.holes];
  const window = Math.max(1, Math.round(SMOOTH_MM / grid.cell));

  // Der kürzeste Weg hängt innen in der Kurve. Nachrücken, bis er mittig
  // liegt — dann stimmt auch die Richtung, aus der die Sprossen folgen.
  let path = resample(smooth(raw, window), spacingMm);
  for (let i = 0; i < CENTRE_PASSES && path.length >= 2; i++) {
    path = resample(smooth(centre(path, rings), 2), spacingMm);
  }
  if (path.length < 2) return null;
  const rungs: Rung[] = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i] as Point;
    const quer = across(rings, p, directionAt(path, i));
    if (!quer) continue;
    const out = hit(rings, p, quer.n);
    const back = hit(rings, p, { x: -quer.n.x, y: -quer.n.y });
    if (out === null || back === null) continue;
    // Eine mittige Sprosse ist etwa doppelt so lang wie der Abstand zur
    // nächsten Kante. Ist sie viel länger, lief der Strahl an einer Kante
    // vorbei und durch die halbe Form — die gehört nicht in die Säule.
    if (out + back > 4 * quer.d + 1) continue;
    rungs.push({
      a: { x: p.x - quer.n.x * back, y: p.y - quer.n.y * back },
      b: { x: p.x + quer.n.x * out, y: p.y + quer.n.y * out },
      mid: p,
    });
  }
  if (rungs.length < 2) return null;

  // Was die Sprossen überstreichen, gegen die wirkliche Fläche halten.
  const swept = rungs.reduce((sum, r) => sum + dist(r.a, r.b), 0) * spacingMm;
  if (swept < shapeArea(shape) * MIN_COVERAGE) return null;

  return { path, rungs };
}

// --- Raster ---------------------------------------------------------

interface Grid {
  cells: Uint8Array;
  w: number;
  h: number;
  x0: number;
  y0: number;
  cell: number;
}

function rasterize(shape: Shape): Grid | null {
  const b = shapeBounds(shape);
  const wMm = b.maxX - b.minX;
  const hMm = b.maxY - b.minY;
  if (!isFinite(wMm) || wMm <= 0 || hMm <= 0) return null;

  // Grobes Raster, wenn die Fläche groß ist — sonst wird es unnötig teuer.
  let cell = CELL_MM;
  while ((wMm / cell) * (hMm / cell) > MAX_CELLS) cell *= 2;

  const w = Math.ceil(wMm / cell) + 1;
  const h = Math.ceil(hMm / cell) + 1;
  if (w < 3 || h < 3) return null;

  const cells = new Uint8Array(w * h);
  for (let row = 0; row < h; row++) {
    const y = b.minY + (row + 0.5) * cell;
    for (const [left, right] of scanlineSpans(shape, y)) {
      const from = Math.max(0, Math.ceil((left - b.minX) / cell - 0.5));
      const to = Math.min(w - 1, Math.floor((right - b.minX) / cell - 0.5));
      for (let col = from; col <= to; col++) cells[row * w + col] = 1;
    }
  }
  return { cells, w, h, x0: b.minX, y0: b.minY, cell };
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** Breitensuche innerhalb der Form; liefert das entfernteste Feld. */
function farthest(g: Grid, start: number): { at: number; from: Int32Array } {
  const from = new Int32Array(g.cells.length).fill(-2);
  const queue = new Int32Array(g.cells.length);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  from[start] = -1;
  let last = start;

  while (head < tail) {
    const at = queue[head++] as number;
    last = at;
    const cx = at % g.w;
    const cy = (at / g.w) | 0;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
      const next = ny * g.w + nx;
      if (g.cells[next] !== 1 || from[next] !== -2) continue;
      from[next] = at;
      queue[tail++] = next;
    }
  }
  return { at: last, from };
}

/** Den Weg vom Ziel zurück zum Ausgangsfeld ablaufen, in mm. */
function walkBack(g: Grid, from: Int32Array, end: number, start: number): Point[] {
  const out: Point[] = [];
  let at = end;
  for (let guard = 0; guard < g.cells.length; guard++) {
    out.push({
      x: g.x0 + ((at % g.w) + 0.5) * g.cell,
      y: g.y0 + (((at / g.w) | 0) + 0.5) * g.cell,
    });
    if (at === start) break;
    const prev = from[at];
    if (prev === undefined || prev < 0) break;
    at = prev;
  }
  return out;
}

// --- Mittellinie glätten und abtasten --------------------------------

function smooth(path: Point[], window: number): Point[] {
  if (path.length <= 2) return path;
  const out: Point[] = [];
  for (let i = 0; i < path.length; i++) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let k = -window; k <= window; k++) {
      const p = path[Math.min(path.length - 1, Math.max(0, i + k))] as Point;
      sx += p.x;
      sy += p.y;
      n++;
    }
    out.push({ x: sx / n, y: sy / n });
  }
  return out;
}

function resample(path: Point[], step: number): Point[] {
  const out: Point[] = [path[0] as Point];
  let carry = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Point;
    const b = path[i] as Point;
    const len = dist(a, b);
    if (len < 1e-9) continue;
    let t = carry;
    while (t + step <= len) {
      t += step;
      out.push({ x: a.x + ((b.x - a.x) * t) / len, y: a.y + ((b.y - a.y) * t) / len });
    }
    carry = t - len;
  }
  const last = path[path.length - 1] as Point;
  if (dist(last, out[out.length - 1] as Point) > step / 2) out.push(last);
  return out;
}

/** Laufrichtung der Mittellinie an der Stelle `i`, auf Länge 1. */
function directionAt(path: Point[], i: number): Point {
  const a = path[Math.max(0, i - 1)] as Point;
  const b = path[Math.min(path.length - 1, i + 1)] as Point;
  const d = dist(a, b) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
}

/**
 * Jeden Punkt in die Mitte zwischen seine beiden Kanten schieben.
 *
 * Gemessen wird senkrecht zur augenblicklichen Laufrichtung. Punkte, an
 * denen keine Kante zu finden ist — die Enden —, bleiben, wo sie sind.
 */
function centre(path: Point[], rings: Ring[]): Point[] {
  return path.map((p, i) => {
    const quer = across(rings, p, directionAt(path, i));
    if (!quer) return p;
    const vor = hit(rings, p, quer.n);
    const zurueck = hit(rings, p, { x: -quer.n.x, y: -quer.n.y });
    if (vor === null || zurueck === null) return p;
    const schub = (vor - zurueck) / 2;
    return { x: p.x + quer.n.x * schub, y: p.y + quer.n.y * schub };
  });
}

/**
 * Die Querrichtung an der Stelle `p`: zur nächstgelegenen Kante hin.
 *
 * `null` an den Enden der Säule — dort liegt die nächste Kante voraus,
 * nicht zur Seite, und eine Sprosse gibt es nicht.
 */
function across(rings: Ring[], p: Point, dir: Point): { n: Point; d: number } | null {
  let bestD = Infinity;
  let bestQ: Point | null = null;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const q = nearestOnSegment(ring[j] as Point, ring[i] as Point, p);
      const d = dist(p, q);
      if (d < bestD) {
        bestD = d;
        bestQ = q;
      }
    }
  }
  if (!bestQ || bestD < 1e-9) return null;
  const n = { x: (bestQ.x - p.x) / bestD, y: (bestQ.y - p.y) / bestD };
  // Zeigt die nächste Kante nach vorn statt zur Seite, ist hier ein Ende.
  if (Math.abs(n.x * dir.x + n.y * dir.y) > 0.85) return null;
  return { n, d: bestD };
}

function nearestOnSegment(a: Point, b: Point, p: Point): Point {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-12) return a;
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + vx * t, y: a.y + vy * t };
}

// --- Von der Mittellinie zur Kante -----------------------------------

/**
 * Abstand von `p` bis zur ersten Kante in Richtung `dir`, oder `null`.
 *
 * Geprüft werden alle Ringe, Löcher eingeschlossen: Eine Sprosse soll am
 * Lochrand enden, nicht darüber hinweglaufen.
 */
function hit(rings: Ring[], p: Point, dir: Point): number | null {
  let best: number | null = null;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j] as Point;
      const b = ring[i] as Point;
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const nenner = dir.x * ey - dir.y * ex;
      if (Math.abs(nenner) < 1e-12) continue;
      const qx = a.x - p.x;
      const qy = a.y - p.y;
      const t = (qx * ey - qy * ex) / nenner;
      const u = (qx * dir.y - qy * dir.x) / -nenner;
      if (t <= 1e-9 || u < 0 || u > 1) continue;
      if (best === null || t < best) best = t;
    }
  }
  return best;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
