/**
 * Polygon-Hilfen für die Stichgenerierung.
 *
 * Vereinfachung wie in TEST2: Flächen werden als **konvexe** Polygone
 * behandelt. Das hält Einwärtsversatz und Scanline-Schnitt trivial und
 * reicht für die bisherigen Maschinentests. Konkave Formen und Löcher
 * kommen später dazu.
 */
import type { Bounds, Point } from '../types.ts';

export type Polygon = Point[];

export function polygonBounds(poly: Polygon): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Doppelte vorzeichenbehaftete Fläche; positiv bei Uhrzeigersinn (Y nach unten). */
export function signedArea2(poly: Polygon): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i] as Point;
    const q = poly[(i + 1) % poly.length] as Point;
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}

export function polygonArea(poly: Polygon): number {
  return Math.abs(signedArea2(poly)) / 2;
}

/** Sorgt für Uhrzeigersinn, damit die Einwärtsnormale eindeutig ist. */
export function toClockwise(poly: Polygon): Polygon {
  return signedArea2(poly) >= 0 ? poly : [...poly].reverse();
}

/** Konvexe Hülle (Andrew's monotone chain), im Uhrzeigersinn. */
export function convexHull(points: Point[]): Polygon {
  if (points.length < 3) return [...points];
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const build = (src: Point[]): Point[] => {
    const out: Point[] = [];
    for (const p of src) {
      while (
        out.length >= 2 &&
        cross(out[out.length - 2] as Point, out[out.length - 1] as Point, p) <= 0
      ) {
        out.pop();
      }
      out.push(p);
    }
    out.pop();
    return out;
  };

  const lower = build(pts);
  const upper = build([...pts].reverse());
  return toClockwise([...lower, ...upper]);
}

/**
 * Versetzt ein konvexes Polygon um `d` nach innen.
 * Gibt `null` zurück, wenn die Fläche dabei verschwindet.
 */
export function insetConvex(poly: Polygon, d: number): Polygon | null {
  if (d <= 0) return poly;
  const cw = toClockwise(poly);
  const n = cw.length;
  if (n < 3) return null;

  // Jede Kante um d nach innen schieben, dann benachbarte Geraden schneiden.
  const lines: { p: Point; dir: Point }[] = [];
  for (let i = 0; i < n; i++) {
    const a = cw[i] as Point;
    const b = cw[(i + 1) % n] as Point;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue;
    // Bei Uhrzeigersinn mit Y nach unten zeigt (-ey, ex)/len nach innen.
    const nx = -ey / len;
    const ny = ex / len;
    lines.push({ p: { x: a.x + nx * d, y: a.y + ny * d }, dir: { x: ex / len, y: ey / len } });
  }
  if (lines.length < 3) return null;

  const out: Polygon = [];
  for (let i = 0; i < lines.length; i++) {
    const l1 = lines[i] as { p: Point; dir: Point };
    const l2 = lines[(i + 1) % lines.length] as { p: Point; dir: Point };
    const det = l1.dir.x * -l2.dir.y - l1.dir.y * -l2.dir.x;
    if (Math.abs(det) < 1e-9) continue;
    const rx = l2.p.x - l1.p.x;
    const ry = l2.p.y - l1.p.y;
    const t = (rx * -l2.dir.y - ry * -l2.dir.x) / det;
    out.push({ x: l1.p.x + l1.dir.x * t, y: l1.p.y + l1.dir.y * t });
  }

  if (out.length < 3) return null;
  // Hat sich das Polygon beim Versetzen umgestülpt, ist nichts mehr übrig.
  if (signedArea2(out) <= 0) return null;
  if (polygonArea(out) < 1e-6) return null;
  return out;
}

/** Punkt in konvexem Polygon (Rand zählt als innen). */
export function containsPoint(poly: Polygon, p: Point): boolean {
  const cw = toClockwise(poly);
  for (let i = 0; i < cw.length; i++) {
    const a = cw[i] as Point;
    const b = cw[(i + 1) % cw.length] as Point;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross < -1e-9) return false;
  }
  return true;
}

export function rotate(p: Point, angleRad: number): Point {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/**
 * Schneidet eine waagerechte Linie `y` mit dem Polygon.
 * Bei konvexen Polygonen sind das höchstens zwei Punkte.
 */
export function scanlineSpan(poly: Polygon, y: number): [number, number] | null {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Point;
    const b = poly[(i + 1) % poly.length] as Point;
    if (a.y === b.y) continue;
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    if (y < lo || y >= hi) continue;
    xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
  }
  if (xs.length < 2) return null;
  return [Math.min(...xs), Math.max(...xs)];
}
