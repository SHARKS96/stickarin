import { describe, expect, it } from 'vitest';
import { quantize } from './quantize.ts';
import type { Rgb } from './color.ts';

const BACKGROUND: Rgb = { r: 245, g: 243, b: 238 };
const RED: Rgb = { r: 200, g: 60, b: 50 };
const BLUE: Rgb = { r: 40, g: 90, b: 170 };
const YELLOW: Rgb = { r: 235, g: 180, b: 60 };

/** Vier klar getrennte Flächen, der Hintergrund deutlich in der Überzahl. */
function synthetic() {
  const width = 300;
  const height = 220;
  const data = new Uint8ClampedArray(width * height * 4);
  const put = (i: number, c: Rgb) => {
    data[i] = c.r;
    data[i + 1] = c.g;
    data[i + 2] = c.b;
    data[i + 3] = 255;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      put(i, BACKGROUND);
      if (Math.hypot(x - 100, y - 100) < 60) put(i, RED);
      if (x > 170 && x < 270 && y > 60 && y < 140) put(i, BLUE);
      if (Math.hypot((x - 150) / 60, (y - 160) / 40) < 1) put(i, YELLOW);
    }
  }
  return { data, width, height };
}

const has = (palette: Rgb[], c: Rgb) =>
  palette.some(
    (p) => Math.abs(p.r - c.r) <= 6 && Math.abs(p.g - c.g) <= 6 && Math.abs(p.b - c.b) <= 6,
  );

describe('quantize', () => {
  it('liefert genau so viele Farben wie angefordert', () => {
    const { data, width, height } = synthetic();
    expect(quantize(data, width, height, { colors: 4 }).palette).toHaveLength(4);
  });

  it('trennt eine kleine Fläche vom dominierenden Hintergrund', () => {
    // Der Hintergrund stellt rund zwei Drittel aller Pixel. Eine Startbelegung,
    // die sich davon einfangen lässt, wirft Blau mit dem Hintergrund zusammen.
    const { data, width, height } = synthetic();
    const { palette } = quantize(data, width, height, { colors: 4 });
    for (const c of [BACKGROUND, RED, BLUE, YELLOW]) expect(has(palette, c)).toBe(true);
  });

  it('ist deterministisch — gleiches Bild, gleiche Palette', () => {
    const { data, width, height } = synthetic();
    const a = quantize(data, width, height, { colors: 4 }).palette;
    const b = quantize(data, width, height, { colors: 4 }).palette;
    expect(b).toEqual(a);
  });

  it('lässt eine Hintergrundfarbe weg', () => {
    const { data, width, height } = synthetic();
    const r = quantize(data, width, height, {
      colors: 3,
      ignored: [BACKGROUND],
      tolerance: 10,
    });
    expect(has(r.palette, BACKGROUND)).toBe(false);
    for (const c of [RED, BLUE, YELLOW]) expect(has(r.palette, c)).toBe(true);
    // Ignorierte Pixel tragen den Index -1.
    expect(Array.from(r.indices).filter((i) => i === -1).length).toBeGreaterThan(30_000);
  });

  it('kommt mit einem vollständig ignorierten Bild klar', () => {
    const { data, width, height } = synthetic();
    const r = quantize(data, width, height, {
      colors: 4,
      ignored: [BACKGROUND, RED, BLUE, YELLOW],
      tolerance: 60,
    });
    expect(r.palette).toHaveLength(0);
  });

  it('hält die Farbe der Pipette fest', () => {
    const { data, width, height } = synthetic();
    const r = quantize(data, width, height, { colors: 4, pinned: [BLUE] });
    expect(has(r.palette, BLUE)).toBe(true);
  });
});
