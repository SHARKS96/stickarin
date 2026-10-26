/**
 * Polygon-Hilfen für die Stichgenerierung.
 *
 * Eine Fläche ist ein `Shape`: ein äußerer Ring plus beliebig viele Löcher.
 * Ringe sind einfache, geschlossene Polygonzüge — der letzte Punkt wird
 * nicht wiederholt. Damit ein einziger Versatz-Formelsatz für beide Fälle
 * reicht, sind äußere Ringe im Uhrzeigersinn und Löcher gegen den
 * Uhrzeigersinn orientiert (Y zeigt nach unten).
 */
import type { Bounds, Point } from '../types.ts';

export type Ring = Point[];

/** Eine Fläche mit Löchern. */
export interface Shape {
  outer: Ring;
  holes: Ring[];
}

/** Doppelte vorzeichenbehaftete Fläche; positiv im Uhrzeigersinn (Y nach unten). */
export function signedArea2(ring: Ring): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i] as Point;
    const q = ring[(i + 1) % ring.length] as Point;
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}

export function ringArea(ring: Ring): number {
  return Math.abs(signedArea2(ring)) / 2;
}

/** Nettofläche: äußerer Ring abzüglich der Löcher. */
export function shapeArea(shape: Shape): number {
  return shape.holes.reduce((a, h) => a - ringArea(h), ringArea(shape.outer));
}

export function toClockwise(ring: Ring): Ring {
  return signedArea2(ring) >= 0 ? ring : [...ring].reverse();
}

export function toCounterClockwise(ring: Ring): Ring {
  return signedArea2(ring) < 0 ? ring : [...ring].reverse();
}

/**
 * Bringt eine Fläche in die erwartete Orientierung: außen im Uhrzeigersinn,
 * Löcher dagegen. Danach zeigt `(-ey, ex)` für **jeden** Ring ins Material.
 */
export function normalizeShape(shape: Shape): Shape {
  return {
    outer: toClockwise(shape.outer),
    holes: shape.holes.map(toCounterClockwise),
  };
}

export function ringBounds(ring: Ring): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function shapeBounds(shape: Shape): Bounds {
  return ringBounds(shape.outer);
}

/** Punkt-in-Ring nach der Even-Odd-Regel; trägt auch konkave Ringe. */
export function pointInRing(ring: Ring, p: Point): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i] as Point;
    const b = ring[j] as Point;
    // Halboffener Vergleich, damit ein Punkt auf Höhe eines Eckpunkts
    // nicht doppelt zählt.
    if (a.y > p.y !== b.y > p.y) {
      const x = a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (p.x < x) inside = !inside;
    }
  }
  return inside;
}

/** Im äußeren Ring und in keinem Loch. */
export function pointInShape(shape: Shape, p: Point): boolean {
  if (!pointInRing(shape.outer, p)) return false;
  return !shape.holes.some((h) => pointInRing(h, p));
}

export function rotate(p: Point, angleRad: number): Point {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export function rotateShape(shape: Shape, angleRad: number): Shape {
  return {
    outer: shape.outer.map((p) => rotate(p, angleRad)),
    holes: shape.holes.map((h) => h.map((p) => rotate(p, angleRad))),
  };
}

/**
 * Schnittstrecken einer waagerechten Linie mit der Fläche.
 *
 * Alle Ringe liefern ihre Kreuzungen in einen Topf; nach dem Sortieren
 * ergeben je zwei aufeinanderfolgende Werte eine Strecke im Material
 * (Even-Odd). So fallen Löcher von selbst heraus, und eine konkave Form
 * liefert mehrere Strecken je Reihe — genau das, was der konvexen Hülle
 * vorher gefehlt hat.
 */
export function scanlineSpans(shape: Shape, y: number): [number, number][] {
  const xs: number[] = [];
  const collect = (ring: Ring) => {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i] as Point;
      const b = ring[j] as Point;
      if (a.y > y !== b.y > y) {
        xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
  };
  collect(shape.outer);
  for (const h of shape.holes) collect(h);

  xs.sort((p, q) => p - q);
  const spans: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) {
    spans.push([xs[i] as number, xs[i + 1] as number]);
  }
  return spans;
}

/** Wie weit ein Gehrungsversatz höchstens über die Ecke hinausschießen darf. */
const MITER_LIMIT = 2.5;

/**
 * Versetzt einen Ring um `d` ins Material.
 *
 * Für jeden Eckpunkt wird die Winkelhalbierende der beiden angrenzenden
 * Kantennormalen genommen und die Strecke um `1/cos` verlängert, damit die
 * versetzten Kanten parallel bleiben. Spitze Ecken werden begrenzt, sonst
 * schießt der Versatz ins Unendliche.
 *
 * Der Ring muss die Orientierung aus `normalizeShape` haben.
 */
export function offsetRingInward(ring: Ring, d: number): Ring {
  if (d === 0) return [...ring];
  const n = ring.length;
  if (n < 3) return [];

  const out: Ring = [];
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n] as Point;
    const cur = ring[i] as Point;
    const next = ring[(i + 1) % n] as Point;

    const n1 = edgeNormal(prev, cur);
    const n2 = edgeNormal(cur, next);
    if (!n1 || !n2) continue;

    let bx = n1.x + n2.x;
    let by = n1.y + n2.y;
    const len = Math.hypot(bx, by);
    if (len < 1e-9) continue; // 180°-Kehre: kein sinnvoller Versatz
    bx /= len;
    by /= len;

    // cos(halber Außenwinkel) = Projektion der Halbierenden auf eine Normale.
    const cos = bx * n1.x + by * n1.y;
    const scale = Math.min(MITER_LIMIT, 1 / Math.max(cos, 1e-6));
    out.push({ x: cur.x + bx * d * scale, y: cur.y + by * d * scale });
  }
  return out;
}

/** Normale einer Kante, die bei normalisierter Orientierung ins Material zeigt. */
function edgeNormal(a: Point, b: Point): Point | null {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const len = Math.hypot(ex, ey);
  if (len < 1e-9) return null;
  return { x: -ey / len, y: ex / len };
}

/**
 * Versetzt die ganze Fläche um `d` ins Material und wirft dabei weg, was
 * sich beim Versetzen umgestülpt hat. Gibt `null` zurück, wenn nichts
 * übrig bleibt — dann war die Form schmaler als der doppelte Versatz.
 */
export function insetShape(shape: Shape, d: number): Shape | null {
  const norm = normalizeShape(shape);
  if (d <= 0) return norm;

  const outer = cleanOffset(norm.outer, d, norm);
  if (!outer || outer.length < 3) return null;

  const holes: Ring[] = [];
  for (const hole of norm.holes) {
    const moved = cleanOffset(hole, d, norm);
    if (moved && moved.length >= 3) holes.push(toCounterClockwise(moved));
  }

  const result = { outer: toClockwise(outer), holes };
  if (shapeArea(result) < 1e-6) return null;
  return result;
}

/**
 * Versatz plus Notbremse: Punkte, die dabei aus der ursprünglichen Fläche
 * gewandert sind, stammen aus einer umgestülpten Ecke und fliegen raus.
 * Das ersetzt keine echte Selbstschnitt-Auflösung, hält aber die Fläche
 * bei mäßig konkaven Formen zusammen.
 */
function cleanOffset(ring: Ring, d: number, original: Shape): Ring | null {
  const moved = offsetRingInward(ring, d);
  if (moved.length < 3) return null;
  const kept = moved.filter((p) => pointInShape(original, p));
  return kept.length >= 3 ? kept : null;
}

/**
 * Douglas-Peucker: wirft Punkte weg, die weniger als `epsilon` von der
 * Verbindungslinie abweichen. Aus der Pixel-Treppe einer Kontur wird so
 * ein glatter Zug.
 */
export function simplifyRing(ring: Ring, epsilon: number): Ring {
  if (ring.length < 4 || epsilon <= 0) return [...ring];

  // Ein geschlossener Ring hat keinen natürlichen Anfang. Wir schneiden ihn
  // an den beiden am weitesten auseinander liegenden Punkten auf und
  // vereinfachen beide Hälften einzeln.
  let a = 0;
  let b = 0;
  let best = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = sqDist(ring[0] as Point, ring[i] as Point);
    if (d > best) {
      best = d;
      b = i;
    }
  }
  best = -1;
  for (let i = 0; i < ring.length; i++) {
    const d = sqDist(ring[b] as Point, ring[i] as Point);
    if (d > best) {
      best = d;
      a = i;
    }
  }
  if (a === b) return [...ring];

  const first = sliceCyclic(ring, a, b);
  const second = sliceCyclic(ring, b, a);
  const simplified = [
    ...douglasPeucker(first, epsilon).slice(0, -1),
    ...douglasPeucker(second, epsilon).slice(0, -1),
  ];
  return simplified.length >= 3 ? simplified : [...ring];
}

function sliceCyclic(ring: Ring, from: number, to: number): Ring {
  const out: Ring = [];
  let i = from;
  for (;;) {
    out.push(ring[i] as Point);
    if (i === to) break;
    i = (i + 1) % ring.length;
  }
  return out;
}

function douglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return [...points];
  const first = points[0] as Point;
  const last = points[points.length - 1] as Point;

  let index = 0;
  let maxDist = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDistance(points[i] as Point, first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist <= epsilon) return [first, last];
  const left = douglasPeucker(points.slice(0, index + 1), epsilon);
  const right = douglasPeucker(points.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}

function pointLineDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

function sqDist(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

/** Kürzeste Breite einer Fläche, grob über die Bounding-Box. */
export function approximateWidth(shape: Shape): number {
  const b = shapeBounds(shape);
  return Math.min(b.maxX - b.minX, b.maxY - b.minY);
}
