/**
 * BMP-Writer: das Vorschaubild für das Maschinendisplay.
 *
 * 24 Bit, unkomprimiert, Zeilen von unten nach oben, BGR, Zeilen auf 4 Byte
 * aufgefüllt. Maßstab und Rand sind aus den Maschinentests abgeleitet:
 * 0,4 mm je Pixel und 4 mm Rand ringsum ergeben für TEST1 (30 × 30 mm)
 * genau 95 × 95 px und für TEST2 (56,9 × 12,0 mm) genau 163 × 50 px.
 */
import { BMP_MARGIN_MM, BMP_MM_PER_PIXEL } from '../constants.ts';
import { planBounds } from '../types.ts';
import type { StitchPlan, ThreadColor } from '../types.ts';

const FILE_HEADER = 14;
const INFO_HEADER = 40;

export interface BmpOptions {
  mmPerPixel?: number;
  marginMm?: number;
  /** Hintergrund, Standard Weiß. */
  background?: [number, number, number];
}

export function writeBmp(plan: StitchPlan, options: BmpOptions = {}): Uint8Array {
  const {
    mmPerPixel = BMP_MM_PER_PIXEL,
    marginMm = BMP_MARGIN_MM,
    background = [255, 255, 255],
  } = options;

  const b = planBounds(plan);
  const width = Math.max(1, Math.ceil((b.maxX - b.minX + 2 * marginMm) / mmPerPixel));
  const height = Math.max(1, Math.ceil((b.maxY - b.minY + 2 * marginMm) / mmPerPixel));

  // Pixelpuffer als RGB, erst beim Schreiben nach BGR und bottom-up gedreht.
  const px = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    px[i * 3] = background[0] as number;
    px[i * 3 + 1] = background[1] as number;
    px[i * 3 + 2] = background[2] as number;
  }

  const toPx = (x: number, y: number): [number, number] => [
    Math.round((x - b.minX + marginMm) / mmPerPixel),
    Math.round((y - b.minY + marginMm) / mmPerPixel),
  ];

  const setPx = (x: number, y: number, c: ThreadColor) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    px[i] = c.r;
    px[i + 1] = c.g;
    px[i + 2] = c.b;
  };

  const fallback: ThreadColor = { r: 0, g: 0, b: 0, name: '', catalog: '' };
  let colorIndex = 0;
  let thread = plan.threads[0] ?? fallback;
  let prev: [number, number] | null = null;

  for (const e of plan.entries) {
    if (e.kind === 'colorChange') {
      colorIndex++;
      thread = plan.threads[colorIndex] ?? fallback;
      prev = null;
      continue;
    }
    if (e.kind === 'trim') {
      prev = null;
      continue;
    }
    const cur = toPx(e.x, e.y);
    // Nur echte Stiche zeichnen; Sprünge sind lose Fäden und gehören nicht ins Bild.
    if (e.kind === 'stitch' && prev) line(prev, cur, (x, y) => setPx(x, y, thread));
    prev = cur;
  }

  return encodeBmp(px, width, height);
}

/** Bresenham. */
function line(
  from: [number, number],
  to: [number, number],
  plot: (x: number, y: number) => void,
): void {
  let [x0, y0] = from;
  const [x1, y1] = to;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function encodeBmp(rgb: Uint8Array, width: number, height: number): Uint8Array {
  const rowSize = Math.floor((width * 3 + 3) / 4) * 4;
  const imageSize = rowSize * height;
  const fileSize = FILE_HEADER + INFO_HEADER + imageSize;

  const buf = new Uint8Array(fileSize);
  const view = new DataView(buf.buffer);

  buf[0] = 0x42; // 'B'
  buf[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(10, FILE_HEADER + INFO_HEADER, true);

  view.setUint32(14, INFO_HEADER, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true); // Ebenen
  view.setUint16(28, 24, true); // Bit je Pixel
  view.setUint32(30, 0, true); // keine Kompression
  view.setUint32(34, imageSize, true);
  // 3780 Pixel je Meter = 96 dpi. So steht es in TEST1.BMP und TEST2.BMP,
  // also in den Dateien, die die B 590 gelesen hat.
  view.setInt32(38, 3780, true);
  view.setInt32(42, 3780, true);

  let p = FILE_HEADER + INFO_HEADER;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      buf[p++] = rgb[i + 2] as number; // B
      buf[p++] = rgb[i + 1] as number; // G
      buf[p++] = rgb[i] as number; // R
    }
    p += rowSize - width * 3; // Zeilenauffüllung bleibt 0
  }

  return buf;
}
