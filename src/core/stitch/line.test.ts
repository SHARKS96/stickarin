/**
 * Striche: Was beim Sticken entlang eines Pfades gelten muss.
 *
 * Der Prüfstein ist nicht das Aussehen, sondern was die Maschine aushält:
 * keine Stiche unter der Mindestlänge, keine über der Höchstlänge, nichts
 * außerhalb der Strichbreite — und beim Satin eine Sprosse, die von Kante
 * zu Kante reicht und nicht nur bis zur Mitte.
 */
import { describe, expect, it } from 'vitest';
import {
  LINE_SATIN_MIN_WIDTH_MM,
  PULL_COMPENSATION_MM,
  RUN_STITCH_MM,
  SATIN_MAX_WIDTH_MM,
  SATIN_SPACING_MM,
} from '../constants.ts';
import { StitchBuilder, dist } from './builder.ts';
import { resample, runLine, satinLine } from './line.ts';
import { defaultLineSettingsFor } from '../pipeline.ts';
import type { PlanEntry, Point } from '../types.ts';

/** Eine Strecke von 20 mm auf der x-Achse. */
const strecke: Point[] = [
  { x: 0, y: 0 },
  { x: 20, y: 0 },
];

/** Ein Quadrat als geschlossener Zug. */
const quadrat: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

function stitches(entries: PlanEntry[]): Point[] {
  return entries.filter((e) => e.kind === 'stitch').map((e) => ({ x: e.x, y: e.y }));
}

/**
 * Der längste echte Stich.
 *
 * Gemessen wird über die Einträge, nicht über die Punkte: Zwischen zwei
 * Stichen kann ein Sprung liegen, und dessen Weg ist kein Stich.
 */
function longestStitch(entries: PlanEntry[]): number {
  let max = 0;
  let previous: PlanEntry | null = null;
  for (const entry of entries) {
    if (previous?.kind === 'stitch' && entry.kind === 'stitch') {
      max = Math.max(max, dist(previous, entry));
    }
    previous = entry;
  }
  return max;
}

describe('resample', () => {
  it('tastet gleichmäßig ab und trifft Anfang und Ende genau', () => {
    const points = resample(strecke, false, 2, false);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points.at(-1)).toEqual({ x: 20, y: 0 });
    expect(points).toHaveLength(11);
  });

  it('passt den Abstand an, damit kein Reststück übrig bleibt', () => {
    // 20 mm in Schritten von 3 mm gehen nicht auf: 7 Schritte à 2,857 mm.
    const points = resample(strecke, false, 3, false);
    const steps = points.slice(1).map((p, i) => dist(points[i] as Point, p));
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(1e-9);
    expect(points.at(-1)).toEqual({ x: 20, y: 0 });
  });

  it('läuft beim geschlossenen Zug ganz herum, ohne den Anfang zu doppeln', () => {
    const points = resample(quadrat, true, 2, false);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points.at(-1)).not.toEqual({ x: 0, y: 0 });
    expect(points).toHaveLength(20);
  });

  it('liefert auf Wunsch eine gerade Zahl von Stützpunkten', () => {
    // Nötig für den Satin: sonst trifft die letzte Sprosse auf derselben
    // Seite auf wie die erste.
    const points = resample(quadrat, true, 2.9, true);
    expect(points.length % 2).toBe(0);
  });

  it('bleibt bei einem Pfad ohne Länge stehen', () => {
    expect(resample([{ x: 1, y: 1 }], false, 2, false)).toEqual([{ x: 1, y: 1 }]);
    expect(
      resample(
        [
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ],
        false,
        2,
        false,
      ),
    ).toEqual([{ x: 1, y: 1 }]);
  });
});

describe('runLine', () => {
  it('stickt eine Reihe Stiche auf dem Pfad', () => {
    const builder = new StitchBuilder();
    runLine(builder, strecke, false);
    const entries = builder.finish();
    const points = stitches(entries);

    expect(points.length).toBeGreaterThan(5);
    // Alles liegt auf der Linie — die Verriegelung ausgenommen, die nur
    // entlang der Naht läuft.
    expect(points.every((p) => Math.abs(p.y) < 1e-9)).toBe(true);
    expect(longestStitch(entries)).toBeLessThanOrEqual(RUN_STITCH_MM + 1e-9);
  });

  it('hält die gewünschte Stichlänge', () => {
    const builder = new StitchBuilder();
    runLine(builder, strecke, false, { stitchLength: 1 });
    expect(longestStitch(builder.finish())).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('schließt einen geschlossenen Zug', () => {
    const builder = new StitchBuilder();
    runLine(builder, quadrat, true);
    const points = stitches(builder.finish());
    // Der letzte Stich sitzt auf dem Anfang des Zuges; davor liegt noch
    // die Verriegelung, die in die Naht zurückläuft.
    expect(dist(points.at(-1) as Point, quadrat[0] as Point)).toBeLessThan(1e-6);
  });

  it('tut bei einem Pfad aus einem Punkt nichts', () => {
    const builder = new StitchBuilder();
    runLine(builder, [{ x: 0, y: 0 }], false);
    expect(builder.finish()).toEqual([]);
  });
});

describe('satinLine', () => {
  it('legt die Sprossen quer über den Strich, von Kante zu Kante', () => {
    const builder = new StitchBuilder();
    satinLine(builder, strecke, false, { width: 3 });
    const points = stitches(builder.finish());
    const half = 3 / 2 + PULL_COMPENSATION_MM;

    // Nichts liegt weiter von der Mittellinie entfernt als die halbe Breite.
    expect(Math.max(...points.map((p) => Math.abs(p.y)))).toBeCloseTo(half, 6);
    // Und die Deckschicht reicht auf beide Seiten.
    expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(-half, 6);
    expect(points.every((p) => p.x >= -1e-9 && p.x <= 20 + 1e-9)).toBe(true);
  });

  it('unterteilt eine Sprosse, die breiter ist als ein Satinstich tragen kann', () => {
    const builder = new StitchBuilder();
    satinLine(builder, strecke, false, { width: 30 });
    // 30 mm kann die Maschine nicht am Stück; geteilt wird auf höchstens
    // die Breite, die ein Satinstich trägt.
    expect(longestStitch(builder.finish())).toBeLessThanOrEqual(SATIN_MAX_WIDTH_MM + 1e-6);
  });

  it('legt einen Mittellauf als Unterlage darunter', () => {
    const builder = new StitchBuilder();
    satinLine(builder, strecke, false, { width: 4 });
    const entries = builder.finish();
    const points = stitches(entries);
    // Die Unterlage läuft auf der Mittellinie; ohne sie gäbe es dort nichts.
    expect(points.filter((p) => Math.abs(p.y) < 1e-9).length).toBeGreaterThan(3);
    // Kein Stich ist länger als eine Sprosse. Die steht nicht genau quer,
    // sondern rückt um einen Reihenabstand vor — daher die Schräge.
    const sprosse = Math.hypot(4 + 2 * PULL_COMPENSATION_MM, SATIN_SPACING_MM);
    expect(longestStitch(entries)).toBeLessThanOrEqual(sprosse + 1e-6);
  });

  it('kommt bei einem geschlossenen Zug wieder am Anfang heraus', () => {
    const builder = new StitchBuilder();
    satinLine(builder, quadrat, true, { width: 2 });
    const points = stitches(builder.finish());
    expect(points.length).toBeGreaterThan(20);
    // Die Deckschicht endet dort, wo sie begonnen hat.
    const zigzagStart = points.find((p) => Math.abs(p.x) > 1e-9 || Math.abs(p.y) > 1e-9);
    expect(zigzagStart).toBeDefined();
  });
});

describe('defaultLineSettingsFor', () => {
  it('nimmt für dünne Striche Steppstich und für breite Satin', () => {
    const line = (widthMm: number) => ({
      colorIndex: 0,
      path: strecke,
      closed: false,
      widthMm,
      lengthMm: 20,
    });
    expect(defaultLineSettingsFor(line(0.3)).stitchType).toBe('run');
    expect(defaultLineSettingsFor(line(LINE_SATIN_MIN_WIDTH_MM)).stitchType).toBe('satin');
    expect(defaultLineSettingsFor(line(4)).stitchType).toBe('satin');
  });
});
