/**
 * Größe und Garne: Aus der Zeichnung werden Millimeter und Garnfarben.
 */
import { describe, expect, it } from 'vitest';
import { colorCountOf, planVector } from './plan.ts';
import { parseSvg } from './svg.ts';
import { toHex } from '../image/color.ts';
import { shapeBounds } from '../core/geometry/polygon.ts';

const svg = (body: string) =>
  parseSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`);

describe('planVector', () => {
  it('streckt das Motiv auf die eingestellte Breite', () => {
    const doc = svg('<rect width="100" height="50" fill="#ff0000"/>');
    const plan = planVector(doc, { widthMm: 80 });
    const bounds = shapeBounds((plan.areas[0] as never as { shape: never }).shape);
    expect(bounds.maxX - bounds.minX).toBeCloseTo(80, 6);
    expect(bounds.maxY - bounds.minY).toBeCloseTo(40, 6);
    expect(plan.areas[0]?.areaMm2).toBeCloseTo(80 * 40, 6);
  });

  it('nimmt die Farben aus der Datei, in der Reihenfolge der Zeichnung', () => {
    const doc = svg(
      '<rect width="10" height="10" fill="#0000ff"/>' +
        '<rect x="20" width="10" height="10" fill="#ff0000"/>',
    );
    const plan = planVector(doc, { widthMm: 50 });
    expect(plan.palette.map(toHex)).toEqual(['#0000ff', '#ff0000']);
  });

  it('legt Farben zusammen, die nur durch Rundung verschieden sind', () => {
    const doc = svg(
      '<rect width="10" height="10" fill="#ffffff"/>' +
        '<rect x="20" width="10" height="10" fill="#fefefe"/>',
    );
    const plan = planVector(doc, { widthMm: 50 });
    expect(plan.palette).toHaveLength(1);
    // Die größere Fläche gibt die Garnfarbe vor; hier sind beide gleich groß.
    expect(plan.areas).toHaveLength(2);
    expect(plan.areas.every((a) => a.colorIndex === 0)).toBe(true);
  });

  it('legt auf Wunsch bis zur gewünschten Zahl von Garnen zusammen', () => {
    const doc = svg(
      '<rect width="10" height="10" fill="#ff0000"/>' +
        '<rect x="20" width="10" height="10" fill="#ee0000"/>' +
        '<rect x="40" width="10" height="10" fill="#0000ff"/>',
    );
    expect(colorCountOf(doc)).toBe(3);

    const drei = planVector(doc, { widthMm: 50 });
    expect(drei.palette).toHaveLength(3);

    // Zwei Garne: Die beiden Rottöne gehören zusammen, nicht Rot und Blau.
    const zwei = planVector(doc, { widthMm: 50, colorCount: 2 });
    expect(zwei.palette).toHaveLength(2);
    const blau = zwei.palette.findIndex((c) => toHex(c) === '#0000ff');
    expect(blau).toBeGreaterThanOrEqual(0);
    expect(zwei.areas.filter((a) => a.colorIndex === blau)).toHaveLength(1);
    expect(zwei.areas.filter((a) => a.colorIndex !== blau)).toHaveLength(2);
  });

  it('zählt die bestickte Fläche je Garn in mm²', () => {
    const doc = svg(
      '<rect width="50" height="50" fill="#ff0000"/>' +
        '<rect x="60" width="10" height="10" fill="#0000ff"/>',
    );
    const plan = planVector(doc, { widthMm: 70 });
    // 70 mm auf 70 Einheiten: ein Zehnteleinheit-Quadrat wird 50 × 50 mm.
    expect(plan.counts[0]).toBeCloseTo(2500, 0);
    expect(plan.counts[1]).toBeCloseTo(100, 0);
  });

  it('wirft Krümel weg, die nur einen Fadenschnitt kosten würden', () => {
    const doc = svg(
      '<rect width="100" height="100" fill="#ff0000"/>' +
        '<rect x="0" y="0" width="0.2" height="0.2" fill="#0000ff"/>',
    );
    const plan = planVector(doc, { widthMm: 100, minAreaMm2: 1 });
    // Das blaue Quadrat wäre 0,2 × 0,2 mm groß.
    expect(plan.areas).toHaveLength(1);
    expect(plan.areas[0]?.colorIndex).toBe(0);
  });

  it('rechnet Striche samt Breite und Länge um', () => {
    const doc = svg('<path d="M0,0 L100,0" fill="none" stroke="#000000" stroke-width="2"/>');
    const plan = planVector(doc, { widthMm: 50 });
    const line = plan.lines[0];
    expect(line).toBeDefined();
    // Das Motiv ist der Strich samt seiner halben Breite ringsum, also
    // 102 Einheiten breit. Auf 50 mm gebracht wird der Pfad selbst
    // 100/102 davon lang, und die Breite schrumpft im gleichen Maß.
    const scale = 50 / 102;
    expect(line?.lengthMm).toBeCloseTo(100 * scale, 3);
    expect(line?.widthMm).toBeCloseTo(2 * scale, 3);
    expect(line?.closed).toBe(false);
  });

  it('lässt zu kurze Striche weg', () => {
    const doc = svg(
      '<rect width="100" height="100" fill="#ff0000"/>' +
        '<path d="M0,0 L0.5,0" fill="none" stroke="#0000ff" stroke-width="0.1"/>',
    );
    const plan = planVector(doc, { widthMm: 100, minLineMm: 1 });
    expect(plan.lines).toHaveLength(0);
  });

  it('gibt bei einem leeren Entwurf nichts zurück', () => {
    const plan = planVector({ width: 0, height: 0, elements: [], warnings: [] }, { widthMm: 80 });
    expect(plan).toEqual({
      palette: [],
      counts: [],
      areas: [],
      lines: [],
      backgroundIndex: null,
    });
  });
});

describe('Hintergrund erkennen', () => {
  it('erkennt ein Rechteck hinter dem Motiv', () => {
    const doc = svg(
      '<rect width="100" height="100" fill="#ffffff"/>' +
        '<circle cx="50" cy="50" r="30" fill="#ff0000"/>',
    );
    const plan = planVector(doc, { widthMm: 100 });
    expect(plan.backgroundIndex).toBe(0);
  });

  it('hält eine Silhouette nicht für den Hintergrund', () => {
    // Ein schwarzer Kreis mit etwas darauf: Die Ecken bleiben frei, also
    // ist der Kreis das Motiv. Würde er als Hintergrund ausgeschaltet,
    // bliebe vom Stickbild fast nichts.
    const doc = svg(
      '<circle cx="50" cy="50" r="50" fill="#000000"/>' +
        '<circle cx="50" cy="50" r="10" fill="#ffffff"/>',
    );
    expect(planVector(doc, { widthMm: 100 }).backgroundIndex).toBeNull();
  });

  it('sieht in einer einzigen Fläche keinen Hintergrund', () => {
    const doc = svg('<rect width="100" height="100" fill="#ffffff"/>');
    expect(planVector(doc, { widthMm: 100 }).backgroundIndex).toBeNull();
  });
});
