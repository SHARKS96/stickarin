/**
 * Gegenprobe gegen `reference/stickcore.mjs`.
 *
 * Beide Implementierungen bekommen dieselbe Befehlsfolge und müssen
 * dieselben Bytes schreiben. Weicht etwas ab, hat erst einmal die
 * Referenz recht — mit ihr wurde TEST2 erzeugt und gestickt.
 *
 * Verglichen wird die **Formatschicht**, nicht die Stichgenerierung: Die
 * Befehlsfolgen stehen wörtlich im Test, es baut sie keine der beiden
 * Seiten. So zeigt ein Unterschied wirklich auf den Writer und nicht auf
 * abweichende Geometrie.
 */
import { describe, expect, it } from 'vitest';
import { writeBMP, writeEXP, writeINF } from '../../../reference/stickcore.mjs';
import type { Cmd, Thread } from '../../../reference/stickcore.mjs';
import { writeBmp } from './bmp.ts';
import { writeExp } from './exp.ts';
import { writeInf } from './inf.ts';
import type { PlanEntry, StitchPlan, ThreadColor } from '../types.ts';

const hex = (b: Uint8Array) => Array.from(b, (v) => v.toString(16).padStart(2, '0')).join(' ');

/**
 * Dieselbe Folge in beiden Datenmodellen.
 * Die Referenz rechnet in 0,1-mm-Einheiten, der Kern in Millimetern.
 */
function both(cmds: Cmd[]): { reference: Cmd[]; plan: PlanEntry[] } {
  const plan = cmds.map((c): PlanEntry => {
    if (c.t === 'trim') return { kind: 'trim', x: 0, y: 0 };
    if (c.t === 'color') return { kind: 'colorChange', x: 0, y: 0 };
    return { kind: c.t === 'jump' ? 'jump' : 'stitch', x: c.x / 10, y: c.y / 10 };
  });
  return { reference: cmds, plan };
}

const stitch = (x: number, y: number): Cmd => ({ t: 'stitch', x, y });
const jump = (x: number, y: number): Cmd => ({ t: 'jump', x, y });
const trim: Cmd = { t: 'trim' };
const color: Cmd = { t: 'color' };

/**
 * Die Referenz setzt keinen Nullstich hinter eine Sprungkette — der steht
 * bei ihr in `sew()`, also in der Stichgenerierung, nicht im Writer. Für
 * den Vergleich der Writer wird er deshalb abgeschaltet.
 */
const SAME_AS_REFERENCE = { nullStitchAfterJump: false } as const;

function expectSameExp(cmds: Cmd[]) {
  const { reference, plan } = both(cmds);
  const mine = writeExp({ entries: plan, threads: [] } as StitchPlan, SAME_AS_REFERENCE);
  expect(hex(mine)).toBe(hex(writeEXP(reference)));
  return mine;
}

describe('EXP gegen die Referenz', () => {
  it('schreibt ein Quadrat gleich', () => {
    expectSameExp([stitch(0, 0), stitch(100, 0), stitch(100, 100), stitch(0, 100), stitch(0, 0)]);
  });

  it('schreibt Schnitt und Farbwechsel gleich', () => {
    expectSameExp([stitch(0, 0), stitch(50, 0), trim, color, stitch(50, 50)]);
  });

  it('zerlegt lange Stiche gleich', () => {
    expectSameExp([stitch(0, 0), stitch(900, 0), stitch(900, 640)]);
  });

  it('zerlegt lange Sprünge gleich', () => {
    expectSameExp([stitch(0, 0), jump(1000, 700), stitch(1010, 700)]);
  });

  it('behandelt negative Richtungen gleich', () => {
    expectSameExp([stitch(0, 0), stitch(-300, -450), stitch(-1270, -1270), stitch(0, 0)]);
  });

  it('behandelt den Grenzfall von genau 127 Einheiten gleich', () => {
    expectSameExp([stitch(0, 0), stitch(127, 127), stitch(0, 0), stitch(128, -128)]);
  });

  it('behandelt Stiche ohne Bewegung gleich', () => {
    expectSameExp([stitch(0, 0), stitch(0, 0), stitch(40, 0), stitch(40, 0)]);
  });

  it('legt den Ursprung auf den ersten Punkt, auch abseits des Nullpunkts', () => {
    // Eine EXP kennt nur Relativbewegungen: Der erste Punkt ist dort, wo
    // die Nadel beim Start steht. Fährt der Writer stattdessen vom
    // Nullpunkt dorthin, zählt dieser Anfahrtsweg zur Ausdehnung der Datei.
    expectSameExp([stitch(500, 300), stitch(600, 300), stitch(600, 400)]);
  });

  it('legt den Ursprung auch auf einen führenden Sprung', () => {
    // So beginnt jede Füllfläche: Der Builder fährt die Kontur an.
    expectSameExp([jump(820, 450), stitch(820, 450), stitch(900, 450)]);
  });

  it('schreibt eine Verriegelung wie die Referenz', () => {
    // Die vier Mini-Stiche à 0,4 mm, mit denen TEST2 beginnt.
    const bytes = expectSameExp([
      stitch(0, 0),
      stitch(4, 0),
      stitch(0, 0),
      stitch(4, 0),
      stitch(0, 0),
    ]);
    expect(hex(bytes)).toBe('00 00 04 00 fc 00 04 00 fc 00');
  });
});

describe('INF gegen die Referenz', () => {
  const compare = (threads: ThreadColor[]) => {
    const reference: Thread[] = threads.map((t) => ({
      rgb: [t.r, t.g, t.b],
      name: t.name,
      chart: t.catalog,
    }));
    expect(hex(writeInf(threads))).toBe(hex(writeINF(reference)));
  };

  it('schreibt die Farben von TEST1 gleich', () => {
    compare([
      { r: 192, g: 0, b: 0, name: 'Rot', catalog: 'Unknown' },
      { r: 0, g: 80, b: 160, name: 'Blau', catalog: 'Unknown' },
    ]);
  });

  it('schreibt eine einzelne Farbe gleich', () => {
    compare([{ r: 0, g: 80, b: 160, name: 'Blau', catalog: 'Test' }]);
  });

  it('schreibt Umlaute gleich', () => {
    compare([{ r: 10, g: 20, b: 30, name: 'Grün', catalog: 'Isacord' }]);
  });

  it('schreibt viele Farben gleich', () => {
    compare(
      Array.from({ length: 6 }, (_, i) => ({
        r: i * 40,
        g: 255 - i * 30,
        b: i * 7,
        name: `Farbe ${i + 1}`,
        catalog: 'Stickarin',
      })),
    );
  });
});

describe('BMP gegen die Referenz', () => {
  it('schreibt den Kopf und die Maße gleich', () => {
    const cmds: Cmd[] = [
      stitch(0, 0),
      stitch(300, 0),
      stitch(300, 300),
      stitch(0, 300),
      stitch(0, 0),
    ];
    const { reference, plan } = both(cmds);
    const threads: ThreadColor[] = [{ r: 192, g: 0, b: 0, name: 'Rot', catalog: 'Test' }];

    const mine = writeBmp({ entries: plan, threads });
    const theirs = writeBMP(
      reference,
      threads.map((t) => ({
        rgb: [t.r, t.g, t.b] as [number, number, number],
        name: t.name,
        chart: t.catalog,
      })),
    );

    // Die ersten 54 Bytes sind Datei- und Infokopf: Größe, Maße, Bittiefe,
    // Kompression und Auflösung.
    expect(hex(mine.slice(0, 54))).toBe(hex(theirs.slice(0, 54)));
    expect(mine.length).toBe(theirs.length);
  });

  it('zeichnet dieselben Pixel', () => {
    const cmds: Cmd[] = [stitch(0, 0), stitch(200, 0), stitch(200, 150), stitch(0, 0)];
    const { reference, plan } = both(cmds);
    const threads: ThreadColor[] = [{ r: 0, g: 80, b: 160, name: 'Blau', catalog: 'Test' }];

    const mine = writeBmp({ entries: plan, threads });
    const theirs = writeBMP(
      reference,
      threads.map((t) => ({
        rgb: [t.r, t.g, t.b] as [number, number, number],
        name: t.name,
        chart: t.catalog,
      })),
    );
    expect(hex(mine)).toBe(hex(theirs));
  });
});
