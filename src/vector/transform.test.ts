import { describe, expect, it } from 'vitest';
import { applyMatrix, matrixScale, multiply, numbers, parseTransform } from './transform.ts';

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('parseTransform', () => {
  it('versteht translate, scale und matrix', () => {
    const p = applyMatrix(parseTransform('translate(10 20)'), { x: 1, y: 2 });
    near(p.x, 11);
    near(p.y, 22);

    const s = applyMatrix(parseTransform('scale(2 3)'), { x: 1, y: 2 });
    near(s.x, 2);
    near(s.y, 6);

    const m = applyMatrix(parseTransform('matrix(1 0 0 1 5 5)'), { x: 0, y: 0 });
    near(m.x, 5);
    near(m.y, 5);
  });

  it('dreht um den Ursprung und um einen Punkt', () => {
    const a = applyMatrix(parseTransform('rotate(90)'), { x: 1, y: 0 });
    near(a.x, 0);
    near(a.y, 1);

    const b = applyMatrix(parseTransform('rotate(90 5 5)'), { x: 5, y: 5 });
    near(b.x, 5);
    near(b.y, 5);
  });

  it('wendet mehrere Angaben von links nach rechts an', () => {
    // Erst skalieren, dann verschieben — so liest es die Norm.
    const p = applyMatrix(parseTransform('translate(10 0) scale(2)'), { x: 1, y: 0 });
    near(p.x, 12);
    near(p.y, 0);
  });

  it('überspringt, was es nicht kennt', () => {
    const p = applyMatrix(parseTransform('unbekannt(1) translate(1 1)'), { x: 0, y: 0 });
    near(p.x, 1);
    near(p.y, 1);
  });
});

describe('multiply', () => {
  it('wendet die rechte Abbildung zuerst an', () => {
    const combined = multiply(parseTransform('translate(10 0)'), parseTransform('scale(2)'));
    const p = applyMatrix(combined, { x: 1, y: 0 });
    near(p.x, 12);
  });
});

describe('matrixScale', () => {
  it('gibt die mittlere Längenänderung', () => {
    near(matrixScale(parseTransform('scale(2)')), 2);
    near(matrixScale(parseTransform('scale(2 8)')), 4);
    near(matrixScale(parseTransform('rotate(37)')), 1);
  });
});

describe('numbers', () => {
  it('trennt an Komma, Leerzeichen und Vorzeichen', () => {
    expect(numbers('1,2 3 -4.5e2')).toEqual([1, 2, 3, -450]);
  });
});
