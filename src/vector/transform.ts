/**
 * Affine Abbildungen, wie das `transform`-Attribut sie beschreibt.
 *
 * Gespeichert wird wie in SVG als Sechstupel: `[a c e; b d f]`. Eine
 * verschachtelte Gruppe multipliziert ihre eigene Abbildung von rechts an
 * die des Elternteils — der Punkt läuft von innen nach außen.
 */
import type { Point } from '../core/types.ts';

export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Erst `n`, dann `m` — das Produkt `m · n`. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

export function translation(tx: number, ty: number): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function scaling(sx: number, sy: number): Matrix {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

/**
 * Mittlere Längenänderung der Abbildung.
 *
 * Gebraucht für Strichbreiten und für die Feinheit, mit der Kurven in
 * Geraden zerlegt werden: Beides sind Längen und müssen mitskalieren. Bei
 * ungleichmäßiger Streckung ist die Wurzel der Determinante der
 * vernünftige Kompromiss — flächentreu und richtungsunabhängig.
 */
export function matrixScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
}

const FUNCTION = /([a-zA-Z]+)\s*\(([^)]*)\)/g;

/**
 * Liest `translate(10 20) rotate(45 5 5) scale(2)`.
 *
 * Unbekannte Funktionen werden übersprungen; eine Datei soll an einer
 * Kleinigkeit nicht scheitern.
 */
export function parseTransform(value: string): Matrix {
  let out = IDENTITY;
  FUNCTION.lastIndex = 0;
  for (;;) {
    const match = FUNCTION.exec(value);
    if (!match) break;
    const args = numbers(match[2] as string);
    const next = single((match[1] as string).toLowerCase(), args);
    if (next) out = multiply(out, next);
  }
  return out;
}

function single(name: string, v: number[]): Matrix | null {
  const n = (i: number, fallback = 0) => v[i] ?? fallback;
  switch (name) {
    case 'translate':
      return translation(n(0), n(1));
    case 'scale':
      return scaling(n(0, 1), v.length > 1 ? n(1, 1) : n(0, 1));
    case 'rotate': {
      const rad = (n(0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const turn: Matrix = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
      if (v.length < 3) return turn;
      // Drehung um einen Punkt: hin, drehen, zurück.
      return multiply(multiply(translation(n(1), n(2)), turn), translation(-n(1), -n(2)));
    }
    case 'skewx':
      return { a: 1, b: 0, c: Math.tan((n(0) * Math.PI) / 180), d: 1, e: 0, f: 0 };
    case 'skewy':
      return { a: 1, b: Math.tan((n(0) * Math.PI) / 180), c: 0, d: 1, e: 0, f: 0 };
    case 'matrix':
      return { a: n(0, 1), b: n(1), c: n(2), d: n(3, 1), e: n(4), f: n(5) };
    default:
      return null;
  }
}

const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

/** Alle Zahlen einer Liste — Komma, Leerzeichen und Zeilenumbruch trennen gleich. */
export function numbers(text: string): number[] {
  const out: number[] = [];
  NUMBER.lastIndex = 0;
  for (;;) {
    const match = NUMBER.exec(text);
    if (!match) break;
    const value = Number(match[0]);
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
}
