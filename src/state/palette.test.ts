/**
 * Der Fehler, der hier nicht wiederkommen soll: Ein Tipp mit der Pipette
 * nummerierte die Palette neu, und „wird nicht gestickt“ hing danach an
 * einer Farbe, die niemand angefasst hatte.
 */
import { describe, expect, it } from 'vitest';
import { paletteAncestors } from '../image/ancestry.ts';
import { quantize } from '../image/quantize.ts';
import { inheritKeys, inheritOrder, matchPalette, samePalette } from './palette.ts';
import type { Rgb } from '../image/color.ts';

const WEISS: Rgb = { r: 245, g: 245, b: 240 };
const ROT: Rgb = { r: 220, g: 40, b: 40 };
const GELB: Rgb = { r: 240, g: 200, b: 40 };
const BLAU: Rgb = { r: 40, g: 120, b: 220 };
const GRUEN: Rgb = { r: 40, g: 170, b: 90 };

describe('matchPalette', () => {
  it('findet dieselbe Farbe an neuer Stelle wieder', () => {
    // alt: Gelb, Rot, Weiß, Blau — neu: Blau, Rot, Gelb
    expect(matchPalette([GELB, ROT, WEISS, BLAU], [BLAU, ROT, GELB])).toEqual([3, 1, 0]);
  });

  it('verzeiht die kleine Verschiebung aus dem Neurechnen', () => {
    // Der Paletteneintrag ist ein Mittelwert; fallen Pixel weg, wandert er.
    expect(matchPalette([ROT], [{ r: 226, g: 48, b: 35 }])).toEqual([0]);
  });

  it('lässt zwei neue Farben nicht dieselbe alte beanspruchen', () => {
    const ancestors = matchPalette([ROT], [ROT, { r: 224, g: 44, b: 44 }]);
    expect(ancestors.filter((a) => a === 0)).toHaveLength(1);
  });

  it('erkennt eine wirklich andere Farbe nicht als dieselbe', () => {
    expect(matchPalette([ROT], [BLAU])).toEqual([null]);
  });
});

describe('inheritKeys', () => {
  it('zieht die Einstellungen mit um', () => {
    // neu 0 stammt aus alt 3, neu 1 aus alt 1, neu 2 aus alt 0
    const ignored = { 0: false, 1: true, 3: true };
    expect(inheritKeys(ignored, [3, 1, 0])).toEqual({ 0: true, 1: true, 2: false });
  });

  it('gibt eine zerfallene Farbe an beide Nachfolger weiter', () => {
    expect(inheritKeys({ 1: true }, [0, 1, 1])).toEqual({ 1: true, 2: true });
  });

  it('lässt weg, was es nicht mehr gibt', () => {
    expect(inheritKeys({ 2: true }, [0, 1])).toEqual({});
  });

  it('gibt dasselbe Objekt zurück, wenn sich nichts ändert', () => {
    // Nur so bricht React ab und rechnet nicht noch eine Runde umsonst.
    const names = { 0: 'Dach', 1: 'Wand' };
    expect(inheritKeys(names, [0, 1])).toBe(names);
  });
});

describe('inheritOrder', () => {
  it('zieht die Stickreihenfolge mit um', () => {
    expect(inheritOrder([3, 1, 0], [3, 1, 0])).toEqual([0, 1, 2]);
  });

  it('stellt die Nachfolger einer zerfallenen Farbe nebeneinander', () => {
    expect(inheritOrder([1, 0], [0, 1, 1])).toEqual([1, 2, 0]);
  });

  it('hängt eine neu hinzugekommene Farbe hinten an', () => {
    expect(inheritOrder([0, 1], [0, 1, null])).toEqual([0, 1, 2]);
  });

  it('gibt dieselbe Liste zurück, wenn sich nichts ändert', () => {
    const order = [1, 0];
    expect(inheritOrder(order, [0, 1])).toBe(order);
  });
});

describe('samePalette', () => {
  it('unterscheidet Länge und Inhalt', () => {
    expect(samePalette([ROT, BLAU], [ROT, BLAU])).toBe(true);
    expect(samePalette([ROT, BLAU], [BLAU, ROT])).toBe(false);
    expect(samePalette([ROT], [ROT, BLAU])).toBe(false);
  });
});

describe('am echten Fall', () => {
  /** Vier Farbbänder, ringsum ein heller Rand. */
  function bild(w = 120, h = 90) {
    const data = new Uint8ClampedArray(w * h * 4);
    const baender = [ROT, GELB, BLAU, GRUEN];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const rand = x < 10 || y < 10 || x >= w - 10 || y >= h - 10;
        const c = rand ? WEISS : (baender[Math.floor(((x - 10) / (w - 20)) * 4)] as Rgb);
        data[i] = c.r;
        data[i + 1] = c.g;
        data[i + 2] = c.b;
        data[i + 3] = 255;
      }
    }
    return { data, w, h };
  }

  const nahe = (p: Rgb, c: Rgb) =>
    Math.abs(p.r - c.r) < 30 && Math.abs(p.g - c.g) < 30 && Math.abs(p.b - c.b) < 30;

  it('lässt „wird nicht gestickt“ bei derselben Farbe, wenn die Pipette zutippt', () => {
    const { data, w, h } = bild();
    // Vier Plätze, fünf Farben: Weiß und Grün teilen sich einen und kommen
    // als blasser Mittelwert heraus — genau die Lage, in der der Fehler
    // auftrat.
    const vorher = quantize(data, w, h, { colors: 4, tolerance: 30 });
    const sammel = vorher.palette.findIndex(
      (p) => !nahe(p, WEISS) && !nahe(p, ROT) && !nahe(p, GELB) && !nahe(p, BLAU),
    );
    expect(sammel).toBeGreaterThanOrEqual(0);
    // Der Mittelwert ist weder Weiß noch Grün: Über Farbabstände wäre seine
    // Herkunft nicht wiederzufinden.
    expect(nahe(vorher.palette[sammel] as Rgb, GRUEN)).toBe(false);

    // Der Nutzer schaltet diese Sammelfarbe aus. Dann nimmt er mit der
    // Pipette den hellen Rand weg — der freie Platz lässt reines Grün
    // hervortreten.
    const nachher = quantize(data, w, h, { colors: 4, tolerance: 30, ignored: [WEISS] });
    expect(nachher.palette.some((p) => nahe(p, GRUEN))).toBe(true);

    const ancestors = paletteAncestors(
      nachher.indices,
      nachher.palette.length,
      vorher.indices,
      vorher.palette.length,
    );
    const aus = inheritKeys({ [sammel]: true }, ancestors);

    const ausgeschaltet = Object.entries(aus)
      .filter(([, v]) => v)
      .map(([k]) => nachher.palette[Number(k)] as Rgb);

    // Grün bleibt aus — und sonst nichts. Ohne die Herkunft aus den Pixeln
    // wäre hier entweder gar nichts oder die falsche Farbe ausgeschaltet.
    expect(ausgeschaltet).toHaveLength(1);
    expect(nahe(ausgeschaltet[0] as Rgb, GRUEN)).toBe(true);
  });

  it('vererbt nichts an Pixel, die vorher gar keine Farbe hatten', () => {
    // Zurückgenommener Pipettentipp: Der helle Rand kommt wieder. Er darf
    // nicht die Einstellung der zufällig nächstliegenden Farbe erben.
    const { data, w, h } = bild();
    const ohneRand = quantize(data, w, h, { colors: 5, tolerance: 30, ignored: [WEISS] });
    const mitRand = quantize(data, w, h, { colors: 5, tolerance: 30 });

    const ancestors = paletteAncestors(
      mitRand.indices,
      mitRand.palette.length,
      ohneRand.indices,
      ohneRand.palette.length,
    );
    const weissIndex = mitRand.palette.findIndex((p) => nahe(p, WEISS));
    expect(weissIndex).toBeGreaterThanOrEqual(0);
    expect(ancestors[weissIndex]).toBeNull();
  });
});
