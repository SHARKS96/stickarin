/**
 * Masken zu Flächen: je Farbe die zusammenhängenden Gebiete suchen,
 * Krümel wegwerfen und den Rest zu Polygonen machen.
 *
 * Vereinfachung wie in TEST2: ein Gebiet wird durch seine **konvexe Hülle**
 * dargestellt. Das trägt einfache Motive und hält die Stichgenerierung
 * überschaubar; ein echter Potrace-Schritt kommt später.
 */
import { convexHull, polygonArea } from '../core/geometry/polygon.ts';
import type { Polygon } from '../core/geometry/polygon.ts';
import type { QuantizeResult } from './quantize.ts';
import type { Point } from '../core/types.ts';

export interface TraceOptions {
  /** Millimeter je Pixel — ergibt sich aus der Zielgröße. */
  mmPerPixel: number;
  /** Gebiete unter dieser Fläche fliegen raus, sonst gibt es hunderte Sprünge. */
  minAreaMm2?: number;
}

export interface TracedArea {
  colorIndex: number;
  polygon: Polygon;
  areaMm2: number;
}

export function traceAreas(q: QuantizeResult, options: TraceOptions): TracedArea[] {
  const { mmPerPixel, minAreaMm2 = 4 } = options;
  const { indices, width, height } = q;
  const seen = new Uint8Array(width * height);
  const areas: TracedArea[] = [];

  const stack: number[] = [];
  for (let start = 0; start < indices.length; start++) {
    const colorIndex = indices[start] as number;
    if (colorIndex < 0 || seen[start]) continue;

    // Flutfüllung über 4er-Nachbarschaft.
    const boundary: Point[] = [];
    let pixels = 0;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;

    while (stack.length > 0) {
      const p = stack.pop() as number;
      const x = p % width;
      const y = (p - x) / width;
      pixels++;

      let isEdge = false;
      const neighbours: [number, number][] = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nx, ny] of neighbours) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          isEdge = true;
          continue;
        }
        const n = ny * width + nx;
        if (indices[n] !== colorIndex) {
          isEdge = true;
          continue;
        }
        if (!seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
      if (isEdge) boundary.push({ x: x * mmPerPixel, y: y * mmPerPixel });
    }

    const areaMm2 = pixels * mmPerPixel * mmPerPixel;
    if (areaMm2 < minAreaMm2 || boundary.length < 3) continue;

    const polygon = convexHull(boundary);
    if (polygon.length < 3) continue;
    const hullArea = polygonArea(polygon);
    if (hullArea < minAreaMm2) continue;

    areas.push({ colorIndex, polygon, areaMm2: hullArea });
  }

  return areas;
}

/** Grobe Breite einer Fläche — entscheidet zwischen Satin und Füllstich. */
export function approximateWidth(poly: Polygon): number {
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
  return Math.min(maxX - minX, maxY - minY);
}
