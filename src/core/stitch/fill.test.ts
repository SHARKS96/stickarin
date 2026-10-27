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
