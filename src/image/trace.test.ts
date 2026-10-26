import { describe, expect, it } from 'vitest';
import { traceAreas } from './trace.ts';
import type { QuantizeResult } from './quantize.ts';
import { pointInShape, shapeArea } from '../core/geometry/polygon.ts';

/** Baut ein QuantizeResult aus einer Vorlage: '.' = ignoriert, Ziffer = Farbindex. */
function maskOf(rows: string[]): QuantizeResult {
  const height = rows.length;
  const width = (rows[0] as string).length;
  const indices = new Int16Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = rows[y] as string;
    for (let x = 0; x < width; x++) {
      const c = row[x] as string;
      indices[y * width + x] = c === '.' ? -1 : Number(c);
    }
  }
  return { indices, palette: [{ r: 0, g: 0, b: 0 }], width, height, counts: [0] };
}

/** Gefüllter Block 10 × 10. */
const block = Array.from({ length: 10 }, () => '0'.repeat(10));

/** Ring 10 × 10 mit Loch 4 × 4 in der Mitte. */
const donut = [
  '0000000000',
  '0000000000',
  '0000000000',
  '0000000000',
  '000....000',
  '000....000',
  '000....000',
  '000....000',
  '0000000000',
  '0000000000',
];

/** U-Form: Einbuchtung von oben. */
const uForm = [
  '000....000',
  '000....000',
  '000....000',
  '000....000',
  '000....000',
  '0000000000',
  '0000000000',
  '0000000000',
  '0000000000',
  '0000000000',
];

describe('traceAreas', () => {
  it('findet einen einfachen Block ohne Löcher', () => {
    const areas = traceAreas(maskOf(block), { mmPerPixel: 1, simplifyMm: 0 });
    expect(areas).toHaveLength(1);
    const a = areas[0]!;
    expect(a.shape.holes).toHaveLength(0);
    expect(a.areaMm2).toBeCloseTo(100, 6);
  });

  it('erkennt das Loch eines Rings als Loch, nicht als eigene Fläche', () => {
    const areas = traceAreas(maskOf(donut), { mmPerPixel: 1, simplifyMm: 0 });
    expect(areas).toHaveLength(1);
    const a = areas[0]!;
    expect(a.shape.holes).toHaveLength(1);
    // 100 − 16; die konvexe Hülle hätte hier 100 geliefert.
    expect(a.areaMm2).toBeCloseTo(84, 6);
  });

  it('lässt das Loch beim Punkttest außen vor', () => {
    const a = traceAreas(maskOf(donut), { mmPerPixel: 1, simplifyMm: 0 })[0]!;
    expect(pointInShape(a.shape, { x: 1.5, y: 5 })).toBe(true);
    expect(pointInShape(a.shape, { x: 5, y: 6 })).toBe(false);
  });

  it('hält die Einbuchtung einer U-Form frei', () => {
    const a = traceAreas(maskOf(uForm), { mmPerPixel: 1, simplifyMm: 0 })[0]!;
    expect(a.shape.holes).toHaveLength(0);
    expect(a.areaMm2).toBeCloseTo(80, 6);
    expect(pointInShape(a.shape, { x: 5, y: 2 })).toBe(false);
    expect(pointInShape(a.shape, { x: 5, y: 8 })).toBe(true);
    expect(pointInShape(a.shape, { x: 1.5, y: 2 })).toBe(true);
  });

  it('trennt zwei Gebiete derselben Farbe', () => {
    const areas = traceAreas(
      maskOf([
        '000....000',
        '000....000',
        '000....000',
        '..........',
        '..........',
        '000....000',
        '000....000',
        '000....000',
        '..........',
        '..........',
      ]),
      { mmPerPixel: 1, simplifyMm: 0 },
    );
    expect(areas).toHaveLength(4);
    for (const a of areas) expect(a.areaMm2).toBeCloseTo(9, 6);
  });

  it('wirft Krümel unter der Mindestfläche weg', () => {
    const areas = traceAreas(
      maskOf([
        '0000000000',
        '0000000000',
        '0000000000',
        '0000000000',
        '0000000000',
        '..........',
        '..........',
        '.......0..',
        '..........',
        '..........',
      ]),
      { mmPerPixel: 1, minAreaMm2: 4, simplifyMm: 0 },
    );
    expect(areas).toHaveLength(1);
    expect(areas[0]!.areaMm2).toBeCloseTo(50, 6);
  });

  it('stickt winzige Löcher zu, statt für sie zu springen', () => {
    const withPinhole = [
      '0000000000',
      '0000000000',
      '0000000000',
      '0000000000',
      '0000.00000',
      '0000000000',
      '0000000000',
      '0000000000',
      '0000000000',
      '0000000000',
    ];
    const a = traceAreas(maskOf(withPinhole), {
      mmPerPixel: 1,
      minHoleAreaMm2: 2,
      simplifyMm: 0,
    })[0]!;
    expect(a.shape.holes).toHaveLength(0);
  });

  it('rechnet Pixel korrekt in Millimeter um', () => {
    const a = traceAreas(maskOf(block), { mmPerPixel: 0.5, simplifyMm: 0 })[0]!;
    // 10 px × 0,5 mm = 5 mm Kantenlänge
    expect(shapeArea(a.shape)).toBeCloseTo(25, 6);
  });
});
