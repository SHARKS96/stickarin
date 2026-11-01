/**
 * Der Satinstich bekam bisher **eine** Richtung für die ganze Fläche. Bei
 * einer gebogenen Strähne läuft er damit schräg über die Form statt quer.
 * Hier wird geprüft, dass die Mittellinie wirklich in der Mitte liegt und
 * die Sprossen mit der Krümmung mitdrehen.
 */
import { describe, expect, it } from 'vitest';
import { normalizeShape, pointInShape } from '../geometry/polygon.ts';
import type { Shape } from '../geometry/polygon.ts';
import { traceSpine } from './spine.ts';
import type { Rung } from './spine.ts';
import type { Point } from '../types.ts';

/** Ein Kreisbogen fester Breite — Radius 25 mm, 5 mm breit, Viertelkreis. */
function bogen(radius = 25, breite = 5, bis = Math.PI / 2): Shape {
  const aussen: Point[] = [];
  const innen: Point[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = (i / 60) * bis;
    aussen.push({ x: Math.cos(t) * (radius + breite / 2), y: Math.sin(t) * (radius + breite / 2) });
    innen.push({ x: Math.cos(t) * (radius - breite / 2), y: Math.sin(t) * (radius - breite / 2) });
  }
  return normalizeShape({ outer: [...aussen, ...innen.reverse()], holes: [] });
}

const laenge = (r: Rung) => Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y);
const winkel = (r: Rung) => (Math.atan2(r.b.y - r.a.y, r.b.x - r.a.x) * 180) / Math.PI;

describe('traceSpine', () => {
  it('legt die Linie in die Mitte, nicht an die Innenkante', () => {
    // Ein kürzester Weg durch die Form drückt sich innen an die Kurve und
    // läge bei Radius 22,5 statt 25. Dagegen das Nachrücken in die Mitte.
    const sp = traceSpine(bogen(), 0.4);
    expect(sp).not.toBeNull();
    const mitte = (sp as NonNullable<typeof sp>).path.slice(5, -5);
    for (const p of mitte) expect(Math.hypot(p.x, p.y)).toBeCloseTo(25, 0);
  });

  it('macht Sprossen so lang wie die Form breit ist', () => {
    const sp = traceSpine(bogen(25, 5), 0.4) as NonNullable<ReturnType<typeof traceSpine>>;
    const l = sp.rungs.map(laenge).sort((a, b) => a - b);
    expect(l[l.length >> 1] as number).toBeCloseTo(5, 1);
    // Keine Ausreißer, die längs durch die Form laufen.
    expect(l[l.length - 1] as number).toBeLessThan(7);
  });

  it('dreht den Sprossenwinkel mit der Krümmung mit', () => {
    const sp = traceSpine(bogen(25, 5), 0.4) as NonNullable<ReturnType<typeof traceSpine>>;
    const w = sp.rungs.map(winkel);
    const spanne = Math.abs((w[w.length - 1] as number) - (w[0] as number));
    // Über einen Viertelkreis muss er sich um etwa 90° drehen. Früher kam
    // ein einziger Winkel für die ganze Fläche heraus: Spanne 0.
    expect(spanne).toBeGreaterThan(60);
  });

  it('bleibt mit beiden Enden in der Form', () => {
    const shape = bogen();
    const sp = traceSpine(shape, 0.4) as NonNullable<ReturnType<typeof traceSpine>>;
    for (const r of sp.rungs) {
      const m = { x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2 };
      expect(pointInShape(shape, m)).toBe(true);
    }
  });

  it('gibt bei einer verzweigten Form auf', () => {
    // Eine „7“ hat kein durchgehendes Band. Dafür taugt keine Mittellinie;
    // der Satinstich fällt dann auf den festen Winkel zurück.
    const sieben = normalizeShape({
      outer: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 8 },
        { x: 22, y: 8 },
        { x: 14, y: 40 },
        { x: 6, y: 40 },
        { x: 14, y: 8 },
        { x: 0, y: 8 },
      ],
      holes: [],
    });
    expect(traceSpine(sieben, 0.4)).toBeNull();
  });

  it('gibt bei einer Form ohne Ausdehnung auf', () => {
    expect(traceSpine(normalizeShape({ outer: [], holes: [] }), 0.4)).toBeNull();
  });
});
