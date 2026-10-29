import { describe, expect, it } from 'vitest';
import { parsePath } from './path.ts';
import { ringArea } from '../core/geometry/polygon.ts';

/** Feinheit, mit der die Tests Kurven zerlegen lassen. */
const TOL = 0.01;

describe('parsePath', () => {
  it('liest absolute und relative Geraden', () => {
    const [sub] = parsePath('M10 10 L20 10 l0 10 H10 V10 Z', TOL);
    expect(sub?.closed).toBe(true);
    expect(sub?.points).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
      { x: 10, y: 20 },
    ]);
  });

  it('wiederholt den Befehl, wenn weitere Zahlen folgen', () => {
    const [sub] = parsePath('M0,0 L1,0 2,0 3,0', TOL);
    expect(sub?.points).toHaveLength(4);
  });

  it('macht aus mehreren Koordinatenpaaren nach M einen Linienzug', () => {
    const [sub] = parsePath('M0,0 1,0 2,0', TOL);
    expect(sub?.points).toHaveLength(3);
  });

  it('versteht die knappe Schreibweise ohne Trennzeichen', () => {
    const [sub] = parsePath('M10-5.5.25.75L1 1', TOL);
    expect(sub?.points).toEqual([
      { x: 10, y: -5.5 },
      // Nach den zwei Zahlen von M geht es als Linienzug weiter.
      { x: 0.25, y: 0.75 },
      { x: 1, y: 1 },
    ]);
  });

  it('teilt mehrere Teilstücke an jedem M auf', () => {
    const subs = parsePath('M0,0 L1,0 Z M5,5 L6,5 L6,6 Z', TOL);
    expect(subs).toHaveLength(2);
    expect(subs[1]?.closed).toBe(true);
  });

  it('setzt nach Z am Anfang des Teilstücks fort', () => {
    const subs = parsePath('M0,0 L10,0 L10,10 Z L20,20', TOL);
    expect(subs).toHaveLength(2);
    expect(subs[1]?.points[0]).toEqual({ x: 0, y: 0 });
    expect(subs[1]?.closed).toBe(false);
  });

  it('löst eine Bézierkurve so fein auf, wie die Toleranz verlangt', () => {
    const grob = parsePath('M0,0 C0,50 100,50 100,0', 5);
    const fein = parsePath('M0,0 C0,50 100,50 100,0', 0.01);
    expect((fein[0]?.points.length ?? 0) > (grob[0]?.points.length ?? 0)).toBe(true);
    // Der Endpunkt muss in beiden Fällen genau getroffen werden.
    expect(fein[0]?.points.at(-1)).toEqual({ x: 100, y: 0 });
  });

  it('spiegelt den Kontrollpunkt bei S und T', () => {
    const s = parsePath('M0,0 C0,10 10,10 10,0 S20,-10 20,0', TOL);
    const points = s[0]?.points ?? [];
    expect(points.at(-1)).toEqual({ x: 20, y: 0 });
    // Nach dem Spiegeln muss die Kurve über die Nulllinie steigen.
    expect(points.some((p) => p.y < 0)).toBe(true);
  });

  it('macht aus zwei Halbbögen einen Kreis mit richtiger Fläche', () => {
    const [sub] = parsePath('M-10,0 A10,10 0 1 0 10,0 A10,10 0 1 0 -10,0 Z', 0.005);
    expect(sub?.closed).toBe(true);
    expect(ringArea(sub?.points ?? [])).toBeCloseTo(Math.PI * 100, 0);
  });

  it('liest Bogenflaggen auch ohne Trennzeichen', () => {
    // `a1 1 0 011 1` ist largeArc=0, sweep=1, dann 1,1 als Zielpunkt.
    const [sub] = parsePath('M0,0a1 1 0 011 1', TOL);
    expect(sub?.points.at(-1)?.x).toBeCloseTo(1, 6);
    expect(sub?.points.at(-1)?.y).toBeCloseTo(1, 6);
  });

  it('vergrößert zu kleine Bogenradien, statt aufzugeben', () => {
    const [sub] = parsePath('M0,0 A1,1 0 0 0 20,0', TOL);
    expect(sub?.points.at(-1)?.x).toBeCloseTo(20, 6);
  });

  it('nimmt einen Bogen ohne Radius als Gerade', () => {
    const [sub] = parsePath('M0,0 A0,0 0 0 0 10,10', TOL);
    expect(sub?.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it('bricht bei unlesbaren Daten ab, ohne hängen zu bleiben', () => {
    const subs = parsePath('M0,0 L10,0 ???? L50,50', TOL);
    expect(subs).toHaveLength(1);
    expect(subs[0]?.points).toHaveLength(2);
  });

  it('wirft doppelte Punkte weg', () => {
    const [sub] = parsePath('M0,0 L0,0 L10,0 L10,0 L10,10 Z', TOL);
    expect(sub?.points).toHaveLength(3);
  });

  it('gibt für leere und sinnlose Daten nichts zurück', () => {
    expect(parsePath('', TOL)).toEqual([]);
    expect(parsePath('M10,10', TOL)).toEqual([]);
  });
});
