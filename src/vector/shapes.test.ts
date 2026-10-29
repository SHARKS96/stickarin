/**
 * Füllregeln: Was ist ein Loch und was eine Insel?
 *
 * Die Prüfsteine sind ein Ring („O“) und ein Ring mit Punkt darin („◉“) —
 * beides Formen, bei denen `evenodd` und `nonzero` auseinandergehen, wenn
 * die Ringe gleich herum laufen.
 */
import { describe, expect, it } from 'vitest';
import { ringsToShapes, interiorPoint } from './shapes.ts';
import { pointInShape, shapeArea } from '../core/geometry/polygon.ts';
import type { Ring } from '../core/geometry/polygon.ts';

/** Quadrat um (cx, cy); `reverse` dreht die Umlaufrichtung. */
function square(cx: number, cy: number, half: number, reverse = false): Ring {
  const ring: Ring = [
    { x: cx - half, y: cy - half },
    { x: cx + half, y: cy - half },
    { x: cx + half, y: cy + half },
    { x: cx - half, y: cy + half },
  ];
  return reverse ? ring.reverse() : ring;
}

describe('ringsToShapes', () => {
  it('macht aus einem Ring eine Fläche', () => {
    const shapes = ringsToShapes([square(0, 0, 10)], 'nonzero');
    expect(shapes).toHaveLength(1);
    expect(shapeArea(shapes[0] as never)).toBeCloseTo(400, 6);
  });

  it('liest den inneren Ring als Loch, wenn er gegenläuft (nonzero)', () => {
    const shapes = ringsToShapes([square(0, 0, 10), square(0, 0, 5, true)], 'nonzero');
    expect(shapes).toHaveLength(1);
    expect(shapes[0]?.holes).toHaveLength(1);
    expect(shapeArea(shapes[0] as never)).toBeCloseTo(400 - 100, 6);
  });

  it('füllt bei nonzero durch, wenn beide Ringe gleich laufen', () => {
    const shapes = ringsToShapes([square(0, 0, 10), square(0, 0, 5)], 'nonzero');
    expect(shapes).toHaveLength(1);
    expect(shapes[0]?.holes).toHaveLength(0);
    expect(shapeArea(shapes[0] as never)).toBeCloseTo(400, 6);
  });

  it('macht bei evenodd auch aus gleichlaufenden Ringen ein Loch', () => {
    const shapes = ringsToShapes([square(0, 0, 10), square(0, 0, 5)], 'evenodd');
    expect(shapes).toHaveLength(1);
    expect(shapes[0]?.holes).toHaveLength(1);
    expect(shapeArea(shapes[0] as never)).toBeCloseTo(300, 6);
  });

  it('erkennt die Insel im Loch als eigene Fläche', () => {
    // Drei Quadrate ineinander: Fläche, Loch, Insel.
    const shapes = ringsToShapes([square(0, 0, 10), square(0, 0, 6), square(0, 0, 2)], 'evenodd');
    expect(shapes).toHaveLength(2);
    const [outer, island] = shapes as [never, never];
    expect(shapeArea(outer)).toBeCloseTo(400 - 144, 6);
    expect(shapeArea(island)).toBeCloseTo(16, 6);
  });

  it('gibt ein Loch dem engsten Ring, der es enthält', () => {
    // Zwei getrennte Ringe, der rechte mit Loch.
    const shapes = ringsToShapes(
      [square(-20, 0, 8), square(20, 0, 10), square(20, 0, 4, true)],
      'nonzero',
    );
    const withHole = shapes.find((s) => s.holes.length === 1);
    expect(withHole).toBeDefined();
    expect(pointInShape(withHole as never, { x: 20, y: 0 })).toBe(false);
    expect(pointInShape(withHole as never, { x: 20, y: 7 })).toBe(true);
  });

  it('wirft entartete Ringe weg', () => {
    expect(
      ringsToShapes(
        [
          [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        ],
        'nonzero',
      ),
    ).toEqual([]);
    expect(
      ringsToShapes(
        [
          [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 5, y: 0 },
          ],
        ],
        'nonzero',
      ),
    ).toEqual([]);
  });

  it('sortiert die Flächen von groß nach klein', () => {
    const shapes = ringsToShapes([square(0, 0, 2), square(30, 0, 9)], 'nonzero');
    expect(shapeArea(shapes[0] as never)).toBeGreaterThan(shapeArea(shapes[1] as never));
  });
});

describe('interiorPoint', () => {
  it('findet einen Punkt im Material, auch wenn die Mitte hohl ist', () => {
    // C-Form: der Schwerpunkt läge in der Lücke.
    const c: Ring = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 8 },
      { x: 10, y: 8 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const p = interiorPoint(c);
    expect(p).not.toBeNull();
    expect(pointInShape({ outer: c, holes: [] }, p as never)).toBe(true);
  });

  it('gibt null für eine Strecke', () => {
    expect(
      interiorPoint([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toBeNull();
  });
});
