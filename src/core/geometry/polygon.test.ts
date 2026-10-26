import { describe, expect, it } from 'vitest';
import {
  insetShape,
  normalizeShape,
  offsetRingInward,
  pointInRing,
  pointInShape,
  scanlineSpans,
  shapeArea,
  signedArea2,
  simplifyRing,
  toClockwise,
} from './polygon.ts';
import type { Ring, Shape } from './polygon.ts';

const rect = (x: number, y: number, w: number, h: number): Ring => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/** Quadrat 20 × 20 mit einem Loch 8 × 8 in der Mitte. */
const ringShape = (): Shape =>
  normalizeShape({ outer: rect(0, 0, 20, 20), holes: [rect(6, 6, 8, 8)] });

/** U-Form: 20 breit, unten geschlossen, oben offen. */
const uShape = (): Shape =>
  normalizeShape({
    outer: [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 14 },
      { x: 14, y: 14 },
      { x: 14, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ],
    holes: [],
  });

describe('Orientierung', () => {
  it('zählt im Uhrzeigersinn positiv (Y nach unten)', () => {
    expect(signedArea2(rect(0, 0, 1, 1))).toBeGreaterThan(0);
  });

  it('dreht äußere Ringe im Uhrzeigersinn und Löcher dagegen', () => {
    const s = normalizeShape({
      outer: [...rect(0, 0, 10, 10)].reverse(),
      holes: [rect(2, 2, 3, 3)],
    });
    expect(signedArea2(s.outer)).toBeGreaterThan(0);
    expect(signedArea2(s.holes[0] as Ring)).toBeLessThan(0);
  });
});

describe('pointInRing / pointInShape', () => {
  it('erkennt Punkte in einer konkaven Form', () => {
    const u = uShape();
    expect(pointInShape(u, { x: 3, y: 5 })).toBe(true); // linker Schenkel
    expect(pointInShape(u, { x: 17, y: 5 })).toBe(true); // rechter Schenkel
    expect(pointInShape(u, { x: 10, y: 5 })).toBe(false); // Einbuchtung
    expect(pointInShape(u, { x: 10, y: 17 })).toBe(true); // Boden
  });

  it('schließt Löcher aus', () => {
    const s = ringShape();
    expect(pointInShape(s, { x: 2, y: 10 })).toBe(true);
    expect(pointInShape(s, { x: 10, y: 10 })).toBe(false);
    expect(pointInRing(s.outer, { x: 10, y: 10 })).toBe(true);
  });
});

describe('scanlineSpans', () => {
  it('liefert zwei Strecken, wo eine Reihe das Loch kreuzt', () => {
    const spans = scanlineSpans(ringShape(), 10);
    expect(spans).toEqual([
      [0, 6],
      [14, 20],
    ]);
  });

  it('liefert eine Strecke oberhalb und unterhalb des Lochs', () => {
    expect(scanlineSpans(ringShape(), 3)).toEqual([[0, 20]]);
    expect(scanlineSpans(ringShape(), 17)).toEqual([[0, 20]]);
  });

  it('trennt die beiden Schenkel einer U-Form', () => {
    const spans = scanlineSpans(uShape(), 5);
    expect(spans).toEqual([
      [0, 6],
      [14, 20],
    ]);
  });

  it('liefert nichts außerhalb der Fläche', () => {
    expect(scanlineSpans(ringShape(), -1)).toEqual([]);
    expect(scanlineSpans(ringShape(), 25)).toEqual([]);
  });
});

describe('offsetRingInward', () => {
  it('schrumpft ein Rechteck gleichmäßig', () => {
    const moved = offsetRingInward(toClockwise(rect(0, 0, 10, 10)), 1);
    const xs = moved.map((p) => p.x).sort((a, b) => a - b);
    const ys = moved.map((p) => p.y).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(1, 6);
    expect(xs[3]).toBeCloseTo(9, 6);
    expect(ys[0]).toBeCloseTo(1, 6);
    expect(ys[3]).toBeCloseTo(9, 6);
  });
});

describe('insetShape', () => {
  it('verkleinert die Außenkante und vergrößert das Loch', () => {
    const inset = insetShape(ringShape(), 1);
    expect(inset).not.toBeNull();
    const s = inset as Shape;
    // Außen 18 × 18, Loch 10 × 10 -> 324 − 100
    expect(shapeArea(s)).toBeCloseTo(224, 4);
  });

  it('gibt null zurück, wenn die Form schmaler ist als der doppelte Versatz', () => {
    expect(insetShape(normalizeShape({ outer: rect(0, 0, 1, 1), holes: [] }), 2)).toBeNull();
  });
});

describe('simplifyRing', () => {
  it('macht aus einer Pixeltreppe eine gerade Kante', () => {
    // Treppe entlang einer Diagonalen, wie sie die Konturverfolgung liefert.
    const stair: Ring = [];
    for (let i = 0; i <= 10; i++) {
      stair.push({ x: i, y: i });
      stair.push({ x: i + 1, y: i });
    }
    stair.push({ x: 11, y: 20 }, { x: 0, y: 20 });
    const simplified = simplifyRing(stair, 1.5);
    expect(simplified.length).toBeLessThan(stair.length);
    expect(simplified.length).toBeGreaterThanOrEqual(3);
  });

  it('lässt ein Rechteck unangetastet', () => {
    expect(simplifyRing(rect(0, 0, 10, 10), 0.3)).toHaveLength(4);
  });
});
