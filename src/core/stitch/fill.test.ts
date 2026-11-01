/**
 * Eigenschaften der Füllfläche, die am Maschinentest aufgefallen sind.
 */
import { describe, expect, it } from 'vitest';
import { PULL_COMPENSATION_MM } from '../constants.ts';
import { normalizeShape } from '../geometry/polygon.ts';
import type { Shape } from '../geometry/polygon.ts';
import { StitchBuilder } from './builder.ts';
import { fillArea } from './fill.ts';
import { tatamiRows } from './tatami.ts';
import type { PlanEntry, Point } from '../types.ts';

const SIZE = 12;

const square: Shape = normalizeShape({
  outer: [
    { x: 0, y: 0 },
    { x: SIZE, y: 0 },
    { x: SIZE, y: SIZE },
    { x: 0, y: SIZE },
  ],
  holes: [],
});

function boundsOf(entries: { x: number; y: number }[]) {
  const xs = entries.map((e) => e.x);
  const ys = entries.map((e) => e.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function fill(shape: Shape, options?: Parameters<typeof fillArea>[2]): PlanEntry[] {
  const builder = new StitchBuilder();
  builder.moveTo(shape.outer[0] as Point);
  fillArea(builder, shape, options);
  return builder.finish().filter((e) => e.kind === 'stitch');
}

describe('Abschlusskontur', () => {
  const stitches = fill(square);
  const all = boundsOf(stitches);

  it('liegt ganz außen, nicht hinter den Reihenenden', () => {
    // Der Zugausgleich verlängert jede Reihe über die Sollkante hinaus.
    expect(all.maxX).toBeGreaterThan(SIZE);
    expect(all.minX).toBeLessThan(0);

    // Die Kontur wird zuletzt gestickt und erreicht genau diese Außenkante.
    // Liefe sie auf der Sollkante, blieben die Reihenenden davor stehen und
    // bildeten weiter den sichtbaren Rand — den Kamm aus TEST2.
    const closing = boundsOf(stitches.slice(-30));
    expect(closing.minX).toBeCloseTo(all.minX, 6);
    expect(closing.maxX).toBeCloseTo(all.maxX, 6);
    expect(closing.minY).toBeCloseTo(all.minY, 6);
    expect(closing.maxY).toBeCloseTo(all.maxY, 6);
  });

  it('sitzt um den Zugausgleich außerhalb der Sollkante', () => {
    expect(all.maxX - SIZE).toBeCloseTo(PULL_COMPENSATION_MM, 6);
    expect(-all.minX).toBeCloseTo(PULL_COMPENSATION_MM, 6);
  });

  it('bekommt auch ein Loch seine eigene Kontur', () => {
    const withHole = normalizeShape({
      outer: square.outer,
      holes: [
        [
          { x: 4, y: 4 },
          { x: 8, y: 4 },
          { x: 8, y: 8 },
          { x: 4, y: 8 },
        ],
      ],
    });
    const entries = fill(withHole);
    // Die Füllreihen greifen durch den Zugausgleich in das Loch hinein,
    // also läuft auch seine Kontur dort — nicht auf der Sollkante.
    const onHoleRim = entries.filter(
      (e) => Math.abs(e.x - (4 + PULL_COMPENSATION_MM)) < 1e-6 && e.y > 3 && e.y < 9,
    );
    expect(onHoleRim.length).toBeGreaterThan(0);

    // Und das Loch bleibt frei: kein Stich in seiner Mitte.
    expect(entries.some((e) => e.x > 5 && e.x < 7 && e.y > 5 && e.y < 7)).toBe(false);
  });
});

describe('Kontur und Füllung treffen sich', () => {
  /**
   * Der Befund aus TEST3: Die Kontur hatte einen sichtbaren Abstand zur
   * Fläche, und das Stickbild sah deshalb schlechter aus als TEST2 ganz
   * ohne Kontur.
   *
   * Die Ursache war eine Unwucht. Die Reihen bekamen ihren Zugausgleich
   * in Reihenrichtung, die Kontur ihren ringsum: In Reihenrichtung trafen
   * sich beide genau, quer dazu klaffte ein halber Reihenabstand plus
   * Zugausgleich. Gemessen an TEST3: Kontur bei y = −0,2 und 12,2,
   * äußerste Füllreihe bei 0,2 und 11,8.
   */
  it('lässt quer zu den Reihen keine Lücke', () => {
    const spacing = 0.4;
    const builder = new StitchBuilder();
    builder.moveTo(square.outer[0] as Point);
    fillArea(builder, square, { spacing });
    const stitches = builder.finish().filter((e) => e.kind === 'stitch');

    const ys = stitches.map((e) => e.y).sort((a, b) => a - b);
    const unten = ys[0] as number;
    // Die Kontur liegt ganz außen. Die äußerste Füllreihe darf höchstens
    // einen Reihenabstand darüber liegen, sonst steht die Kontur ab.
    const naechste = ys.find((y) => y > unten + 1e-6) as number;
    expect(naechste - unten).toBeLessThanOrEqual(spacing + 1e-6);
  });

  it('trifft sich in Reihenrichtung genauso', () => {
    const builder = new StitchBuilder();
    builder.moveTo(square.outer[0] as Point);
    fillArea(builder, square, { spacing: 0.4 });
    const stitches = builder.finish().filter((e) => e.kind === 'stitch');
    const xs = stitches.map((e) => e.x).sort((a, b) => a - b);
    // Reihenenden und Kontur liegen auf derselben Kante — kein Versatz.
    expect(xs[0] as number).toBeCloseTo(-PULL_COMPENSATION_MM, 6);
  });
});

describe('Deckschicht', () => {
  it('reicht bis an die Kante, nicht nur bis zum Kantenlauf', () => {
    // Früher lief die Deckschicht auf der um 0,5 mm versetzten Fläche und
    // endete damit sichtbar vor der Kontur.
    const rows = tatamiRows(square, { spacing: 0.4 });
    const widest = Math.max(...rows.map((r) => Math.max(...r.map((p) => p.x))));
    expect(widest).toBeCloseTo(SIZE + PULL_COMPENSATION_MM, 6);
  });
});

describe('Reihenversatz', () => {
  /**
   * Kleinster Abstand zwischen einem Einstich einer Reihe und dem
   * nächstgelegenen der Folgereihe. Nahe 0 heißt: Die Einstiche liegen
   * übereinander — genau das erzeugt die Streifen aus TEST1.
   */
  function worstOffset(rows: Point[][]): number {
    let worst = Infinity;
    for (let i = 0; i + 1 < rows.length; i++) {
      const a = (rows[i] as Point[]).slice(1, -1).map((p) => p.x);
      const b = (rows[i + 1] as Point[]).slice(1, -1).map((p) => p.x);
      if (a.length < 2 || b.length < 2) continue;
      for (const x of a) for (const y of b) worst = Math.min(worst, Math.abs(x - y));
    }
    return worst;
  }

  const shapes: [string, Point[]][] = [
    [
      'Rechteck',
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
        { x: 0, y: 40 },
      ],
    ],
    [
      'Parallelogramm',
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 55, y: 40 },
        { x: 15, y: 40 },
      ],
    ],
    [
      // Die Kante wandert je Reihe um 2,25 mm — also genau um das, was den
      // Viertel-Versatz von 0,75 mm auf ein volles Stichraster ergänzt.
      // Hing der Versatz am Reihenanfang statt an einem festen Raster,
      // lagen hier alle Einstiche exakt übereinander.
      'Flache Diagonale',
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 265, y: 40 },
        { x: 225, y: 40 },
      ],
    ],
  ];

  for (const [name, outer] of shapes) {
    it(`versetzt die Einstiche auch bei ${name}`, () => {
      const rows = tatamiRows(normalizeShape({ outer, holes: [] }), {
        spacing: 0.4,
        stitchLength: 3,
      });
      // Ein Viertel der Stichlänge ist das Ziel; alles über einem Achtel
      // reicht, damit keine durchgehenden Lücken entstehen.
      expect(worstOffset(rows)).toBeGreaterThan(3 / 8);
    });
  }
});

describe('Verriegelung', () => {
  it('läuft entlang der Naht, nicht quer dazu', () => {
    const builder = new StitchBuilder();
    builder.moveTo({ x: 0, y: 0 });
    // Naht nach rechts: Die Verriegelung muss auf der x-Achse bleiben.
    builder.stitchTo({ x: 10, y: 0 });
    const entries = builder.build().filter((e) => e.kind === 'stitch');
    expect(entries.slice(0, 4).every((e) => Math.abs(e.y) < 1e-9)).toBe(true);

    const vertical = new StitchBuilder();
    vertical.moveTo({ x: 0, y: 0 });
    // Naht nach unten: jetzt muss sie auf der y-Achse bleiben.
    vertical.stitchTo({ x: 0, y: 10 });
    const down = vertical.build().filter((e) => e.kind === 'stitch');
    expect(down.slice(0, 4).every((e) => Math.abs(e.x) < 1e-9)).toBe(true);
  });

  it('schreibt vier Records wie TEST2', () => {
    const builder = new StitchBuilder();
    builder.moveTo({ x: 0, y: 0 });
    builder.stitchTo({ x: 3, y: 0 });
    const entries = builder.build().filter((e) => e.kind === 'stitch');
    // 0,4 / 0 / 0,4 / 0, dann der eigentliche Stich.
    expect(entries.slice(0, 4).map((e) => Number(e.x.toFixed(2)))).toEqual([0.4, 0, 0.4, 0]);
  });
});

describe('Reihenwechsel', () => {
  /**
   * Am Reihenende steht die Nadel einen Reihenabstand neben dem Anfang der
   * nächsten Reihe. Diesen Weg als eigenen Stich zu schreiben erzeugte bei
   * jedem Reihenwechsel einen Stich von 0,4 mm quer zur Naht: In TEST4 war
   * so jeder fünfte Stich kürzer als 0,5 mm, in der professionell
   * digitalisierten Referenz ist es jeder fünfhundertste.
   */
  function stichlaengen(entries: PlanEntry[]): number[] {
    const out: number[] = [];
    for (let i = 1; i < entries.length; i++) {
      const a = entries[i - 1] as PlanEntry;
      const b = entries[i] as PlanEntry;
      if (a.kind !== 'stitch' || b.kind !== 'stitch') continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > 1e-9) out.push(d);
    }
    return out;
  }

  it('setzt dafür keinen eigenen Kurzstich', () => {
    const builder = new StitchBuilder();
    builder.moveTo(square.outer[0] as Point);
    fillArea(builder, square, { spacing: 0.4 });
    const laengen = stichlaengen(builder.finish());
    const kurz = laengen.filter((d) => d < 0.4 + 1e-6);

    // Übrig bleiben nur die Verriegelungen — vier Records je Fadenstück.
    // Ein Reihenwechsel je Reihe wären bei 12 mm und 0,4 mm Abstand allein
    // dreißig Stück, dazu dieselbe Zahl noch einmal für die Unterlage.
    expect(kurz.length).toBeLessThan(12);
  });

  it('kehrt um, statt rechtwinklig abzuknicken', () => {
    const builder = new StitchBuilder();
    builder.moveTo(square.outer[0] as Point);
    fillArea(builder, square, { spacing: 0.4 });
    const p = builder.finish().filter((e) => e.kind === 'stitch');

    let umkehr = 0;
    let knick = 0;
    for (let i = 2; i < p.length; i++) {
      const a = p[i - 2] as PlanEntry;
      const b = p[i - 1] as PlanEntry;
      const c = p[i] as PlanEntry;
      const l1 = Math.hypot(b.x - a.x, b.y - a.y);
      const l2 = Math.hypot(c.x - b.x, c.y - b.y);
      if (l1 < 0.5 || l2 < 0.5) continue;
      const cos = ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / (l1 * l2);
      if (cos < -0.85) umkehr++;
      else if (Math.abs(cos) < 0.5) knick++;
    }
    // Die Referenz zeigt 23 % Umkehrungen gegen 1 % rechte Winkel.
    expect(umkehr).toBeGreaterThan(knick);
  });
});

describe('Bahnen bei Loch und Einbuchtung', () => {
  const ring = normalizeShape({
    outer: [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ],
    holes: [
      [
        { x: 14, y: 14 },
        { x: 26, y: 14 },
        { x: 26, y: 26 },
        { x: 14, y: 26 },
      ],
    ],
  });

  it('schneidet nicht in jeder Reihe den Faden', () => {
    const builder = new StitchBuilder();
    builder.moveTo(ring.outer[0] as Point);
    fillArea(builder, ring, { spacing: 0.4 });
    const trims = builder.finish().filter((e) => e.kind === 'trim').length;

    // Die Fläche hat rund hundert Reihen. Würde Reihe für Reihe gestickt,
    // käme auf jede ein Schnitt, weil der Weg über das Loch verboten ist.
    // Bahnweise bleibt der Faden auf seiner Seite.
    expect(trims).toBeLessThan(15);
  });

  it('stickt nicht durch das Loch', () => {
    const builder = new StitchBuilder();
    builder.moveTo(ring.outer[0] as Point);
    fillArea(builder, ring, { spacing: 0.4 });
    const inHole = builder
      .finish()
      .filter((e) => e.kind === 'stitch')
      .filter((e) => e.x > 16 && e.x < 24 && e.y > 16 && e.y < 24);
    expect(inHole).toHaveLength(0);
  });

  it('stickt nicht über die Einbuchtung einer U-Form', () => {
    const u = normalizeShape({
      outer: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 26 },
        { x: 26, y: 26 },
        { x: 26, y: 0 },
        { x: 36, y: 0 },
        { x: 36, y: 36 },
        { x: 0, y: 36 },
      ],
      holes: [],
    });
    const builder = new StitchBuilder();
    builder.moveTo(u.outer[0] as Point);
    fillArea(builder, u, { spacing: 0.4 });
    const inNotch = builder
      .finish()
      .filter((e) => e.kind === 'stitch')
      .filter((e) => e.x > 12 && e.x < 24 && e.y > 2 && e.y < 24);
    expect(inNotch).toHaveLength(0);
  });
});
