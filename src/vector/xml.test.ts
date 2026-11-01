import { describe, expect, it } from 'vitest';
import { decodeEntities, parseXml, walkXml } from './xml.ts';

describe('decodeEntities', () => {
  it('löst die benannten und die numerischen Entitäten auf', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#65; &#x42;')).toBe(
      'a & b <c> "d" A B',
    );
  });

  it('lässt Unbekanntes stehen, statt es zu verschlucken', () => {
    expect(decodeEntities('&unbekannt; &amp;')).toBe('&unbekannt; &');
  });
});

describe('parseXml', () => {
  it('liest Elemente, Attribute und Verschachtelung', () => {
    const root = parseXml('<svg width="10"><g id="a"><path d="M0,0"/></g></svg>');
    expect(root?.name).toBe('svg');
    expect(root?.attrs['width']).toBe('10');
    const g = root?.children[0];
    expect(g?.name).toBe('g');
    expect(g?.attrs['id']).toBe('a');
    expect(g?.children[0]?.name).toBe('path');
  });

  it('schneidet Namensräume ab', () => {
    const root = parseXml('<svg:svg><svg:use xlink:href="#a"/></svg:svg>');
    expect(root?.name).toBe('svg');
    expect(root?.children[0]?.name).toBe('use');
    expect(root?.children[0]?.attrs['href']).toBe('#a');
  });

  it('überliest Deklaration, Doctype und Kommentare', () => {
    const root = parseXml(
      '<?xml version="1.0"?><!DOCTYPE svg PUBLIC "x" "y"><!-- weg --><svg><!--auch weg--><g/></svg>',
    );
    expect(root?.name).toBe('svg');
    expect(root?.children).toHaveLength(1);
  });

  it('nimmt CDATA als Text — dort stehen die Stylesheets', () => {
    const root = parseXml('<svg><style><![CDATA[ .a { fill: red } ]]></style></svg>');
    expect(root?.children[0]?.text).toContain('fill: red');
  });

  it('lässt sich von einem > im Attributwert nicht täuschen', () => {
    const root = parseXml('<svg><path d="M0,0" data-x="a>b"/></svg>');
    expect(root?.children[0]?.attrs['data-x']).toBe('a>b');
    expect(root?.children[0]?.name).toBe('path');
  });

  it('bricht bei einem fehlenden schließenden Tag nicht ab', () => {
    const root = parseXml('<svg><g><path/></svg>');
    expect(root && walkXml(root).map((e) => e.name)).toEqual(['svg', 'g', 'path']);
  });

  it('gibt null zurück, wenn gar kein Element da ist', () => {
    expect(parseXml('kein xml')).toBeNull();
  });
});
