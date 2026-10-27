/**
 * Was am Satinstich schiefging: Seine Richtung kam aus dem umschließenden
 * Rechteck, und die Sprossen liefen quer über dessen ganze Breite. Bei
 * einer Strichform wie einer „7“ lagen damit zwei Drittel der Stiche
 * außerhalb der Fläche — ein grobes Gitter statt eines Glanzstichs.
 */
import { describe, expect, it } from 'vitest';
import { PULL_COMPENSATION_MM, SATIN_MAX_WIDTH_MM } from '../constants.ts';
import { normalizeShape, offsetRingInward, pointInShape } from '../geometry/polygon.ts';
import type { Shape } from '../geometry/polygon.ts';
import { StitchBuilder } from './builder.ts';
import { satinArea, satinMetrics } from './satin.ts';
import type { PlanEntry, Point } from '../types.ts';

/** Ein „7“-artiger Strich: waagerechter Balken plus schräges Bein. */
const sieben: Shape = normalizeShape({
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

/** Eine schmale Säule — der Fall, für den es den Satinstich gibt. */
const saeule: Shape = normalizeShape({
  outer: [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 5, y: 40 },
    { x: 0, y: 40 },
  ],
  holes: [],
});

function stiche(shape: Shape, options?: Parameters<typeof satinArea>[2]): PlanEntry[] {
  const builder = new StitchBuilder();
  builder.moveTo(shape.outer[0] as Point);
  satinArea(builder, shape, options);
  return builder.finish();
}

/** Die Fläche samt Zugausgleich; weiter darf kein Stich gehen. */
function erlaubt(shape: Shape): Shape {
  return {
    outer: offsetRingInward(shape.outer, -(PULL_COMPENSATION_MM + 0.05)),
    holes: shape.holes.map((h) => offsetRingInward(h, -(PULL_COMPENSATION_MM + 0.05))),
  };
}

/** Längste durchgestickte Strecke; ein Sprung dazwischen zählt nicht. */
function laengsterStich(entries: PlanEntry[]): number {
  let worst = 0;
  for (let i = 1; i < entries.length; i++) {
    const a = entries[i - 1] as PlanEntry;
    const b = entries[i] as PlanEntry;
    if (a.kind !== 'stitch' || b.kind !== 'stitch') continue;
    worst = Math.max(worst, Math.hypot(b.x - a.x, b.y - a.y));
  }
  return worst;
}

describe('satinMetrics', () => {
  it('misst die Säule quer, nicht längs', () => {
    const { width } = satinMetrics(saeule);
    expect(width).toBeCloseTo(5, 0);
  });

  it('findet die Richtung auch bei einer schrägen Säule', () => {
    const schraeg = normalizeShape({
      outer: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 34, y: 30 },
        { x: 30, y: 30 },
      ],
      holes: [],
    });
    expect(satinMetrics(schraeg).width).toBeLessThan(8);
  });

  it('nimmt nicht das umschließende Rechteck', () => {
    // Für die „7“ wären das vierzig Millimeter in beide Richtungen; der
    // Strich selbst ist acht breit.
    expect(satinMetrics(sieben).width).toBeLessThan(15);
  });
});

describe('satinArea', () => {
  it('stickt nicht außerhalb der Fläche', () => {
    const zone = erlaubt(sieben);
    const draussen = stiche(sieben)
      .filter((e) => e.kind === 'stitch')
      .filter((e) => !pointInShape(zone, { x: e.x, y: e.y }));
    expect(draussen).toHaveLength(0);
  });

  it('macht aus einer Sprosse einen Stich, nicht viele', () => {
    // Zerfiele die Sprosse alle drei Millimeter in Einstiche, wäre der
    // Glanz weg — dann wäre es ein sehr dichter Füllstich.
    const entries = stiche(saeule);
    expect(laengsterStich(entries)).toBeGreaterThan(4);
  });

  it('unterteilt eine zu breite Sprosse', () => {
    // Ein Faden quer über vierzig Millimeter läge lose auf dem Stoff.
    const breit = normalizeShape({
      outer: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
        { x: 0, y: 40 },
      ],
      holes: [],
    });
    expect(laengsterStich(stiche(breit))).toBeLessThanOrEqual(SATIN_MAX_WIDTH_MM + 1e-6);
  });

  it('lässt ein Loch frei', () => {
    const ring = normalizeShape({
      outer: [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 30 },
        { x: 0, y: 30 },
      ],
      holes: [
        [
          { x: 11, y: 11 },
          { x: 19, y: 11 },
          { x: 19, y: 19 },
          { x: 11, y: 19 },
        ],
      ],
    });
    const drin = stiche(ring)
      .filter((e) => e.kind === 'stitch')
      .filter((e) => e.x > 13 && e.x < 17 && e.y > 13 && e.y < 17);
    expect(drin).toHaveLength(0);
  });

  it('folgt einer vorgegebenen Richtung', () => {
    const quer = stiche(saeule, { angle: Math.PI / 2 });
    // Quer zur Säule gemessen laufen die Sprossen jetzt die lange Seite
    // entlang — sichtbar an den viel längeren Stichen.
    expect(laengsterStich(quer)).toBeGreaterThan(laengsterStich(stiche(saeule)));
  });
});
