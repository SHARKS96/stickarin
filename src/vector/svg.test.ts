/**
 * Die Datei als Ganzes: Was kommt aus einem SVG heraus?
 *
 * Geprüft wird vor allem das, was Exportfilter wirklich schreiben —
 * Klassen statt Attribute (Illustrator), Gruppen mit Abbildung (Inkscape),
 * `use` auf ein `symbol` (Figma) — und das, was beim Sticken anders
 * behandelt werden muss als beim Anzeigen.
 */
import { describe, expect, it } from 'vitest';
import { parseSvg } from './svg.ts';
import { shapeArea } from '../core/geometry/polygon.ts';
import { toHex } from '../image/color.ts';
import type { VectorArea, VectorDocument, VectorLine } from './types.ts';

function areas(doc: VectorDocument): VectorArea[] {
  return doc.elements.filter((e): e is VectorArea => e.kind === 'area');
}

function lines(doc: VectorDocument): VectorLine[] {
  return doc.elements.filter((e): e is VectorLine => e.kind === 'line');
}

const wrap = (body: string, attrs = 'viewBox="0 0 100 100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

describe('parseSvg', () => {
  it('schneidet auf das Motiv zu, nicht auf den viewBox', () => {
    const doc = parseSvg(wrap('<rect x="10" y="20" width="30" height="40" fill="#ff0000"/>'));
    expect(doc.width).toBeCloseTo(30, 6);
    expect(doc.height).toBeCloseTo(40, 6);
    // Die linke obere Ecke des Motivs liegt danach auf (0, 0).
    expect(Math.min(...(areas(doc)[0] as VectorArea).shape.outer.map((p) => p.x))).toBeCloseTo(
      0,
      6,
    );
    expect(Math.min(...(areas(doc)[0] as VectorArea).shape.outer.map((p) => p.y))).toBeCloseTo(
      0,
      6,
    );
  });

  it('füllt ohne Angabe schwarz — so steht es in der Norm', () => {
    const doc = parseSvg(wrap('<rect width="10" height="10"/>'));
    expect(areas(doc)).toHaveLength(1);
    expect(toHex((areas(doc)[0] as VectorArea).color)).toBe('#000000');
  });

  it('nimmt fill="none" ernst', () => {
    const doc = parseSvg(wrap('<rect width="10" height="10" fill="none"/>'));
    expect(areas(doc)).toHaveLength(0);
    expect(doc.warnings.length).toBeGreaterThan(0);
  });

  it('löst Kreis und Ellipse in Flächen der richtigen Größe auf', () => {
    const doc = parseSvg(wrap('<circle cx="50" cy="50" r="20" fill="#00ff00"/>'));
    // Ein Vieleck ist dem Kreis einbeschrieben und darum immer ein wenig
    // kleiner; ein halbes Promille Fehlfläche ist weit unter einem Stich.
    const exact = Math.PI * 400;
    expect(shapeArea((areas(doc)[0] as VectorArea).shape)).toBeGreaterThan(exact * 0.998);
    expect(shapeArea((areas(doc)[0] as VectorArea).shape)).toBeLessThanOrEqual(exact);
    expect(doc.width).toBeCloseTo(40, 3);
  });

  it('erbt Farbe und Abbildung von der Gruppe', () => {
    const doc = parseSvg(
      wrap(
        '<g fill="#123456" transform="translate(10 10) scale(2)"><rect width="5" height="5"/></g>',
      ),
    );
    const area = areas(doc)[0] as VectorArea;
    expect(toHex(area.color)).toBe('#123456');
    // 5 × 5 verdoppelt ergibt 10 × 10.
    expect(shapeArea(area.shape)).toBeCloseTo(100, 6);
  });

  it('liest Farben aus einem Stylesheet mit Klassen', () => {
    const doc = parseSvg(
      wrap('<style>.st0{fill:#ed1c24}</style><path class="st0" d="M0,0H10V10H0Z"/>'),
    );
    expect(toHex((areas(doc)[0] as VectorArea).color)).toBe('#ed1c24');
  });

  it('lässt style vor Attribut und Attribut vor Stylesheet gehen', () => {
    const doc = parseSvg(
      wrap(
        '<style>.a{fill:#ff0000}</style>' +
          '<rect class="a" fill="#00ff00" width="10" height="10"/>' +
          '<rect class="a" fill="#00ff00" style="fill:#0000ff" x="20" width="10" height="10"/>',
      ),
    );
    expect(toHex((areas(doc)[0] as VectorArea).color)).toBe('#00ff00');
    expect(toHex((areas(doc)[1] as VectorArea).color)).toBe('#0000ff');
  });

  it('mittelt einen Farbverlauf zu einer Garnfarbe', () => {
    const doc = parseSvg(
      wrap(
        '<defs><linearGradient id="g"><stop stop-color="#000000"/><stop stop-color="#ffffff"/></linearGradient></defs>' +
          '<rect width="10" height="10" fill="url(#g)"/>',
      ),
    );
    expect(toHex((areas(doc)[0] as VectorArea).color)).toBe('#808080');
  });

  it('verrechnet Deckkraft gegen Weiß', () => {
    const doc = parseSvg(wrap('<rect width="10" height="10" fill="#000000" opacity="0.5"/>'));
    expect(toHex((areas(doc)[0] as VectorArea).color)).toBe('#808080');
  });

  it('lässt fast durchsichtige Flächen weg', () => {
    const doc = parseSvg(wrap('<rect width="10" height="10" fill-opacity="0.01"/>'));
    expect(areas(doc)).toHaveLength(0);
  });

  it('übergeht display:none und visibility:hidden', () => {
    const doc = parseSvg(
      wrap(
        '<rect width="10" height="10" display="none"/><g visibility="hidden"><circle r="5"/></g>',
      ),
    );
    expect(doc.elements).toHaveLength(0);
  });

  it('macht aus einem Strich einen Strich und keine Fläche', () => {
    const doc = parseSvg(
      wrap('<path d="M0,0 L50,0" fill="none" stroke="#ff0000" stroke-width="2"/>'),
    );
    expect(areas(doc)).toHaveLength(0);
    const line = lines(doc)[0] as VectorLine;
    expect(line.width).toBeCloseTo(2, 6);
    expect(line.closed).toBe(false);
    // Der Strich ragt um die halbe Breite über den Pfad hinaus.
    expect(doc.height).toBeCloseTo(2, 6);
  });

  it('skaliert die Strichbreite mit der Abbildung', () => {
    const doc = parseSvg(
      wrap(
        '<g transform="scale(3)"><path d="M0,0 L10,0" fill="none" stroke="#000" stroke-width="2"/></g>',
      ),
    );
    expect((lines(doc)[0] as VectorLine).width).toBeCloseTo(6, 6);
  });

  it('stickt Fläche und Strich desselben Pfades beide', () => {
    const doc = parseSvg(
      wrap('<rect width="20" height="20" fill="#eeeeee" stroke="#000000" stroke-width="1"/>'),
    );
    expect(areas(doc)).toHaveLength(1);
    expect(lines(doc)).toHaveLength(1);
    expect((lines(doc)[0] as VectorLine).closed).toBe(true);
  });

  it('folgt use auf ein symbol', () => {
    const doc = parseSvg(
      wrap(
        '<defs><symbol id="s"><rect width="10" height="10" fill="#ff0000"/></symbol></defs>' +
          '<use href="#s" x="40" y="40"/>',
      ),
    );
    expect(areas(doc)).toHaveLength(1);
    expect(toHex((areas(doc)[0] as VectorArea).color)).toBe('#ff0000');
  });

  it('folgt use mit xlink:href auf eine Form', () => {
    const doc = parseSvg(
      wrap(
        '<defs><circle id="c" r="5" fill="#00ff00"/></defs><use xlink:href="#c" x="20" y="20"/>',
      ),
    );
    expect(areas(doc)).toHaveLength(1);
  });

  it('dreht sich bei einem use auf sich selbst nicht fest', () => {
    const doc = parseSvg(wrap('<g id="a"><use href="#a"/><rect width="5" height="5"/></g>'));
    expect(areas(doc)).toHaveLength(1);
  });

  it('liest polygon geschlossen und polyline offen', () => {
    const doc = parseSvg(
      wrap(
        '<polygon points="0,0 10,0 10,10" fill="#ff0000"/>' +
          '<polyline points="20,0 30,0 30,10" fill="none" stroke="#000" stroke-width="1"/>',
      ),
    );
    expect(areas(doc)).toHaveLength(1);
    expect((lines(doc)[0] as VectorLine).closed).toBe(false);
  });

  it('rundet die Ecken eines Rechtecks mit rx ab', () => {
    const eckig = parseSvg(wrap('<rect width="20" height="20"/>'));
    const rund = parseSvg(wrap('<rect width="20" height="20" rx="5"/>'));
    const flat = shapeArea((areas(eckig)[0] as VectorArea).shape);
    const rounded = shapeArea((areas(rund)[0] as VectorArea).shape);
    expect(rounded).toBeLessThan(flat);
    // Vier Ecken, je ein Quadrat minus Viertelkreis.
    const expected = 25 * 4 - Math.PI * 25;
    expect(Math.abs(flat - rounded - expected) / expected).toBeLessThan(0.01);
  });

  it('sagt es, wenn Text in der Datei steht', () => {
    const doc = parseSvg(wrap('<text x="10" y="10">Hallo</text><rect width="5" height="5"/>'));
    expect(doc.warnings.join(' ')).toContain('Text');
    expect(areas(doc)).toHaveLength(1);
  });

  it('sagt es, wenn ein Pixelbild eingebettet ist', () => {
    const doc = parseSvg(
      wrap('<image href="x.png" width="10" height="10"/><rect width="5" height="5"/>'),
    );
    expect(doc.warnings.join(' ')).toContain('Pixelbild');
  });

  it('warnt, wenn ein Beschnitt wirklich etwas abschneidet', () => {
    const geschnitten = parseSvg(
      wrap(
        '<defs><clipPath id="c"><rect width="20" height="20"/></clipPath></defs>' +
          '<g clip-path="url(#c)"><rect width="80" height="80"/></g>',
      ),
    );
    expect(geschnitten.warnings.join(' ')).toContain('abgeschnitten');

    const bundig = parseSvg(
      wrap(
        '<defs><clipPath id="c"><rect width="20" height="20"/></clipPath></defs>' +
          '<g clip-path="url(#c)"><rect width="20" height="20"/></g>',
      ),
    );
    expect(bundig.warnings).toHaveLength(0);
  });

  it('bleibt bei einer Datei ohne Inhalt ruhig', () => {
    const doc = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(doc.elements).toHaveLength(0);
    expect(doc.width).toBe(0);
    expect(doc.warnings.length).toBeGreaterThan(0);
  });

  it('erkennt, was gar kein SVG ist', () => {
    expect(parseSvg('nur Text').warnings[0]).toContain('kein SVG');
  });

  it('löst Kurven feiner auf, wenn das Motiv größer ist', () => {
    const klein = parseSvg(wrap('<circle cx="5" cy="5" r="5"/>', 'viewBox="0 0 10 10"'));
    const gross = parseSvg(wrap('<circle cx="500" cy="500" r="500"/>', 'viewBox="0 0 1000 1000"'));
    const kleinPoints = (areas(klein)[0] as VectorArea).shape.outer.length;
    const grossPoints = (areas(gross)[0] as VectorArea).shape.outer.length;
    // Gleiche *relative* Feinheit: gleich viele Punkte für dieselbe Form.
    expect(grossPoints).toBe(kleinPoints);
  });

  it('kommt auch ohne viewBox zur richtigen Feinheit', () => {
    // Ohne viewBox wird die Größe geschätzt und bei Bedarf neu gelesen.
    const doc = parseSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5000" cy="5000" r="5000"/></svg>',
    );
    const area = areas(doc)[0] as VectorArea;
    const exact = Math.PI * 5000 * 5000;
    expect(shapeArea(area.shape)).toBeGreaterThan(exact * 0.999);
    expect(area.shape.outer.length).toBeGreaterThan(40);
  });
});
