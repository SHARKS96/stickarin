/**
 * Masken zu Flächen: je Farbe die zusammenhängenden Gebiete suchen,
 * Krümel wegwerfen und den Rest zu Polygonen mit Löchern machen.
 *
 * Die Konturen entstehen durch **Kantenauslöschung**: Jedes Pixel des
 * Gebiets steuert seine vier Ränder im Uhrzeigersinn bei; ein Rand, den
 * sich zwei Pixel des Gebiets teilen, kommt dabei zweimal gegenläufig vor
 * und hebt sich auf. Übrig bleibt genau der Rand des Gebiets — außen im
 * Uhrzeigersinn, Löcher dagegen. Das ist exakt, braucht keine
 * Sonderfälle für Diagonalen und liefert Löcher gratis mit.
 */
import {
  ringArea,
  pointInRing,
  shapeArea,
  simplifyRing,
  toClockwise,
  toCounterClockwise,
} from '../core/geometry/polygon.ts';
import type { Ring, Shape } from '../core/geometry/polygon.ts';
import type { QuantizeResult } from './quantize.ts';
import type { Point } from '../core/types.ts';

export interface TraceOptions {
  /** Millimeter je Pixel — ergibt sich aus der Zielgröße. */
  mmPerPixel: number;
  /** Gebiete unter dieser Fläche fliegen raus, sonst gibt es hunderte Sprünge. */
  minAreaMm2?: number;
  /** Löcher unter dieser Fläche werden zugestickt. */
  minHoleAreaMm2?: number;
  /**
   * Wie stark die Pixeltreppe geglättet wird, in Millimetern. Zu viel
   * frisst Ecken, zu wenig erzeugt unnötig viele Stiche.
   */
  simplifyMm?: number;
}

export interface TracedArea {
  colorIndex: number;
  shape: Shape;
  areaMm2: number;
}

export function traceAreas(q: QuantizeResult, options: TraceOptions): TracedArea[] {
  const { mmPerPixel, minAreaMm2 = 4, minHoleAreaMm2 = 2, simplifyMm = 0.35 } = options;
  const { indices, width, height } = q;

  const labels = new Int32Array(indices.length).fill(-1);
  const areas: TracedArea[] = [];
  const stack: number[] = [];
  let nextLabel = 0;

  for (let start = 0; start < indices.length; start++) {
    const colorIndex = indices[start] as number;
    if (colorIndex < 0 || (labels[start] as number) >= 0) continue;

    const label = nextLabel++;
    let pixels = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    stack.length = 0;
    stack.push(start);
    labels[start] = label;

    const push = (n: number) => {
      if ((labels[n] as number) >= 0 || indices[n] !== colorIndex) return;
      labels[n] = label;
      stack.push(n);
    };

    while (stack.length > 0) {
      const p = stack.pop() as number;
      const x = p % width;
      const y = (p - x) / width;
      pixels++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      if (x > 0) push(p - 1);
      if (x + 1 < width) push(p + 1);
      if (y > 0) push(p - width);
      if (y + 1 < height) push(p + width);
    }

    if (pixels * mmPerPixel * mmPerPixel < minAreaMm2) continue;

    const rings = traceRings(labels, width, label, minX, minY, maxX, maxY);
    const shape = toShape(rings, mmPerPixel, simplifyMm, minHoleAreaMm2);
    if (!shape) continue;

    const areaMm2 = shapeArea(shape);
    if (areaMm2 < minAreaMm2) continue;
    areas.push({ colorIndex, shape, areaMm2 });
  }

  return areas;
}

/**
 * Sammelt die Ränder aller Pixel mit diesem Label und verkettet das, was
 * nach der Auslöschung übrig bleibt, zu geschlossenen Ringen.
 * Rückgabe in Pixelkoordinaten.
 */
function traceRings(
  labels: Int32Array,
  width: number,
  label: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Ring[] {
  // Gitter der Eckpunkte ist um eins größer als das der Pixel.
  const vw = width + 1;
  const edges = new Set<number>();
  const key = (from: number, to: number) => from * (vw * (maxY + 2)) + to;

  const addEdge = (ax: number, ay: number, bx: number, by: number) => {
    const from = ay * vw + ax;
    const to = by * vw + bx;
    const reverse = key(to, from);
    // Teilen sich zwei Pixel diesen Rand, löschen die Richtungen sich aus.
    if (edges.has(reverse)) edges.delete(reverse);
    else edges.add(key(from, to));
  };

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (labels[y * width + x] !== label) continue;
      // Im Uhrzeigersinn, Y nach unten.
      addEdge(x, y, x + 1, y);
      addEdge(x + 1, y, x + 1, y + 1);
      addEdge(x + 1, y + 1, x, y + 1);
      addEdge(x, y + 1, x, y);
    }
  }

  // Aus den Schlüsseln wieder Start und Ziel machen.
  const span = vw * (maxY + 2);
  const next = new Map<number, number[]>();
  for (const k of edges) {
    const from = Math.floor(k / span);
    const to = k - from * span;
    const list = next.get(from);
    if (list) list.push(to);
    else next.set(from, [to]);
  }

  const rings: Ring[] = [];
  for (const [start] of next) {
    for (;;) {
      const first = next.get(start);
      if (!first || first.length === 0) break;

      const ring: Ring = [];
      let cur = start;
      for (;;) {
        const outgoing = next.get(cur);
        if (!outgoing || outgoing.length === 0) break;
        const to = outgoing.pop() as number;
        const vx = cur % vw;
        const vy = (cur - vx) / vw;
        ring.push({ x: vx, y: vy });
        cur = to;
        if (cur === start) break;
      }
      if (ring.length >= 4) rings.push(ring);
    }
  }

  return rings;
}

/** Ringe nach Umlaufsinn in äußeren Rand und Löcher sortieren. */
function toShape(
  rings: Ring[],
  mmPerPixel: number,
  simplifyMm: number,
  minHoleAreaMm2: number,
): Shape | null {
  if (rings.length === 0) return null;

  const scaled = rings
    .map((r) => simplifyRing(r.map(toMm(mmPerPixel)), simplifyMm))
    .filter((r) => r.length >= 3);
  if (scaled.length === 0) return null;

  // Der flächengrößte Ring ist der äußere Rand.
  let outer = scaled[0] as Ring;
  for (const r of scaled) if (ringArea(r) > ringArea(outer)) outer = r;

  const holes = scaled
    .filter((r) => r !== outer)
    .filter((r) => ringArea(r) >= minHoleAreaMm2)
    // Ein Ring, der nicht im äußeren liegt, gehört zu einem anderen Gebiet.
    .filter((r) => pointInRing(outer, r[0] as Point))
    .map(toCounterClockwise);

  return { outer: toClockwise(outer), holes };
}

const toMm =
  (mmPerPixel: number) =>
  (p: Point): Point => ({ x: p.x * mmPerPixel, y: p.y * mmPerPixel });
