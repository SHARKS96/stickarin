/**
 * Die gelesene Zeichnung als SVG zum Anschauen.
 *
 * Warum nicht einfach die Originaldatei zeigen? Weil die etwas anderes
 * zeigt als das, was gestickt wird: Verläufe, Schrift, Transparenz,
 * Beschnitt. Diese Vorschau entsteht aus genau den Flächen und Strichen, die
 * in den Stichplan gehen — was hier fehlt, fehlt nachher auch.
 */
import type { Point } from '../core/types.ts';
import { toHex } from '../image/color.ts';
import type { VectorDocument } from './types.ts';

/** Zwei Nachkommastellen reichen; die Datei soll in eine URL passen. */
function n(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

function ringPath(ring: Point[]): string {
  if (ring.length === 0) return '';
  const first = ring[0] as Point;
  const rest = ring.slice(1).map((p) => `L${n(p.x)},${n(p.y)}`);
  return `M${n(first.x)},${n(first.y)}${rest.join('')}Z`;
}

export function toPreviewSvg(doc: VectorDocument): string {
  const parts: string[] = [];
  for (const element of doc.elements) {
    if (element.kind === 'area') {
      const d = [element.shape.outer, ...element.shape.holes].map(ringPath).join('');
      // Even-Odd, damit die Löcher Löcher bleiben, egal wie die Ringe laufen.
      parts.push(`<path d="${d}" fill="${toHex(element.color)}" fill-rule="evenodd"/>`);
      continue;
    }
    const first = element.path[0] as Point;
    const d =
      `M${n(first.x)},${n(first.y)}` +
      element.path
        .slice(1)
        .map((p) => `L${n(p.x)},${n(p.y)}`)
        .join('') +
      (element.closed ? 'Z' : '');
    parts.push(
      `<path d="${d}" fill="none" stroke="${toHex(element.color)}" stroke-width="${n(
        element.width,
      )}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(doc.width)} ${n(doc.height)}">` +
    parts.join('') +
    '</svg>'
  );
}

/** Dieselbe Vorschau als Datenadresse — direkt für ein `<img src>`. */
export function toPreviewUrl(doc: VectorDocument): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toPreviewSvg(doc))}`;
}
