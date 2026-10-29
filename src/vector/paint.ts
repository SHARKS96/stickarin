/**
 * Farbe und Stil eines SVG-Elements bestimmen.
 *
 * Drei Quellen sagen dasselbe, mit steigendem Vorrang: geerbte Angaben vom
 * Elternteil, ein Stylesheet im Dokument (Illustrator schreibt seine Farben
 * gern als `.st0 { fill: #ed1c24 }`), die Attribute am Element selbst und
 * zuletzt dessen `style`.
 *
 * Transparenz gibt es beim Sticken nicht. Durchscheinende Farben werden
 * darum gegen Weiß verrechnet — das trifft, was der Nutzer am Schirm sieht,
 * und Weiß ist die Farbe des unbestickten Stoffs im Zweifel. Was fast ganz
 * durchsichtig ist, fällt weg.
 */
import { numbers } from './transform.ts';
import type { Rgb } from '../image/color.ts';
import type { XmlElement } from './xml.ts';

export type FillRule = 'nonzero' | 'evenodd';

export interface Style {
  /** `null` heißt: keine Füllung. */
  fill: Rgb | null;
  fillRule: FillRule;
  /** `null` heißt: kein Strich. */
  stroke: Rgb | null;
  /** Strichbreite in Nutzereinheiten. */
  strokeWidth: number;
  /** Für `currentColor`. */
  color: Rgb;
  visible: boolean;
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/**
 * Der Anfangszustand: SVG füllt ohne jede Angabe schwarz.
 *
 * Das ist keine Kleinigkeit — ein `<path d="…"/>` ohne `fill` ist eine
 * schwarze Fläche, und wer das als „keine Füllung“ liest, liefert eine
 * leere Stickdatei.
 */
export const ROOT_STYLE: Style = {
  fill: BLACK,
  fillRule: 'nonzero',
  stroke: null,
  strokeWidth: 1,
  color: BLACK,
  visible: true,
};

/** Alles, was eine Farbe für die Deckkraft unsichtbar macht. */
const MIN_ALPHA = 0.06;

/** Längeneinheiten in Nutzereinheiten, gerechnet mit 96 dpi wie im Browser. */
const UNITS: Record<string, number> = {
  px: 1,
  pt: 96 / 72,
  pc: 16,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
  q: 96 / 25.4 / 4,
};

/** `12`, `3mm`, `0.5pt` — ohne Einheit sind es Nutzereinheiten. */
export function parseLength(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const match = /^\s*([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)\s*([a-zA-Z%]*)\s*$/.exec(value);
  if (!match) return fallback;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return fallback;
  const unit = (match[2] as string).toLowerCase();
  if (unit === '' || unit === '%') return n;
  return n * (UNITS[unit] ?? 1);
}

/** Die paar Farbnamen, die in von Hand geschriebenen Dateien wirklich vorkommen. */
const NAMED: Record<string, string> = {
  black: '000000',
  silver: 'c0c0c0',
  gray: '808080',
  grey: '808080',
  white: 'ffffff',
  maroon: '800000',
  red: 'ff0000',
  purple: '800080',
  fuchsia: 'ff00ff',
  magenta: 'ff00ff',
  green: '008000',
  lime: '00ff00',
  olive: '808000',
  yellow: 'ffff00',
  navy: '000080',
  blue: '0000ff',
  teal: '008080',
  aqua: '00ffff',
  cyan: '00ffff',
  orange: 'ffa500',
  pink: 'ffc0cb',
  brown: 'a52a2a',
  gold: 'ffd700',
  beige: 'f5f5dc',
  ivory: 'fffff0',
  khaki: 'f0e68c',
  salmon: 'fa8072',
  coral: 'ff7f50',
  tomato: 'ff6347',
  crimson: 'dc143c',
  indigo: '4b0082',
  violet: 'ee82ee',
  turquoise: '40e0d0',
  skyblue: '87ceeb',
  steelblue: '4682b4',
  royalblue: '4169e1',
  midnightblue: '191970',
  forestgreen: '228b22',
  seagreen: '2e8b57',
  darkgreen: '006400',
  darkred: '8b0000',
  darkblue: '00008b',
  darkgray: 'a9a9a9',
  darkgrey: 'a9a9a9',
  lightgray: 'd3d3d3',
  lightgrey: 'd3d3d3',
  lightblue: 'add8e6',
  lightgreen: '90ee90',
  lightyellow: 'ffffe0',
  whitesmoke: 'f5f5f5',
  snow: 'fffafa',
  tan: 'd2b48c',
  wheat: 'f5deb3',
  chocolate: 'd2691e',
  sienna: 'a0522d',
  peru: 'cd853f',
  plum: 'dda0dd',
  orchid: 'da70d6',
  lavender: 'e6e6fa',
  mintcream: 'f5fffa',
  azure: 'f0ffff',
  linen: 'faf0e6',
};

/** Eine Farbangabe plus ihre Deckkraft, schon gegen Weiß verrechnet. */
function composite(rgb: Rgb, alpha: number): Rgb | null {
  if (alpha >= 0.999) return rgb;
  if (alpha < MIN_ALPHA) return null;
  const mix = (c: number) => Math.round(c * alpha + 255 * (1 - alpha));
  return { r: mix(rgb.r), g: mix(rgb.g), b: mix(rgb.b) };
}

/** Farbverläufe: Gemittelt wird über die Stopps — gestickt wird einfarbig. */
export type GradientTable = Record<string, Rgb>;

/**
 * Liest eine Farbangabe.
 *
 * `undefined` bedeutet „nichts angegeben“ (also erben), `null` bedeutet
 * ausdrücklich `none`.
 */
export function parseColor(
  value: string | undefined,
  context: { color: Rgb; gradients: GradientTable },
): Rgb | null | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  if (v === '' || v === 'inherit') return undefined;
  if (v === 'none' || v === 'transparent') return null;
  if (v === 'currentcolor') return context.color;

  if (v.startsWith('#')) {
    const hex = v.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const triple = hex
        .slice(0, 3)
        .split('')
        .map((c) => c + c)
        .join('');
      const alpha = hex.length === 4 ? parseInt((hex[3] as string).repeat(2), 16) / 255 : 1;
      return composite(fromHexTriple(triple), alpha);
    }
    if (hex.length === 6 || hex.length === 8) {
      const alpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return composite(fromHexTriple(hex.slice(0, 6)), alpha);
    }
    return undefined;
  }

  if (v.startsWith('rgb')) {
    const parts = numbers(v);
    if (parts.length < 3) return undefined;
    const percent = v.includes('%');
    const channel = (n: number) => clampByte(percent ? (n / 100) * 255 : n);
    const alpha = parts.length > 3 ? clamp01(parts[3] as number) : 1;
    return composite(
      {
        r: channel(parts[0] as number),
        g: channel(parts[1] as number),
        b: channel(parts[2] as number),
      },
      alpha,
    );
  }

  if (v.startsWith('url(')) {
    const id = /url\(\s*['"]?#([^'")\s]+)/.exec(v)?.[1];
    if (id === undefined) return undefined;
    // Ein Verlauf, den wir nicht kennen (etwa ein Muster), füllt nichts.
    return context.gradients[id] ?? null;
  }

  const named = NAMED[v];
  return named === undefined ? undefined : fromHexTriple(named);
}

function fromHexTriple(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(0, 2), 16) || 0,
    g: parseInt(hex.slice(2, 4), 16) || 0,
    b: parseInt(hex.slice(4, 6), 16) || 0,
  };
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Eigenschaften eines `style`-Attributs oder einer CSS-Regel. */
export type Declarations = Record<string, string>;

export function parseDeclarations(text: string): Declarations {
  const out: Declarations = {};
  for (const part of text.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const name = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).trim();
    if (name !== '' && value !== '') out[name] = value;
  }
  return out;
}

/**
 * Was ein Element an Stil mitbringt, in der Reihenfolge wachsenden Vorrangs
 * zusammengelegt: Stylesheet, Attribute, `style`.
 */
export function ownDeclarations(element: XmlElement, sheet: StyleSheet): Declarations {
  const out: Declarations = { ...sheet.match(element) };
  for (const [name, value] of Object.entries(element.attrs)) {
    if (STYLE_ATTRIBUTES.has(name)) out[name] = value;
  }
  const inline = element.attrs['style'];
  if (inline !== undefined) Object.assign(out, parseDeclarations(inline));
  return out;
}

/** Attribute, die gleichzeitig CSS-Eigenschaften sind („presentation attributes“). */
const STYLE_ATTRIBUTES = new Set([
  'fill',
  'fill-rule',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'opacity',
  'color',
  'display',
  'visibility',
]);

/**
 * Den Stil eines Elements aus dem des Elternteils und den eigenen Angaben
 * ableiten.
 */
export function resolveStyle(
  parent: Style,
  declarations: Declarations,
  gradients: GradientTable,
): Style {
  const color = parseColor(declarations['color'], { color: parent.color, gradients });
  const context = { color: color ?? parent.color, gradients };

  const groupAlpha = opacity(declarations['opacity']);
  const fill = withOpacity(
    parseColor(declarations['fill'], context),
    opacity(declarations['fill-opacity']) * groupAlpha,
    parent.fill,
  );
  const stroke = withOpacity(
    parseColor(declarations['stroke'], context),
    opacity(declarations['stroke-opacity']) * groupAlpha,
    parent.stroke,
  );

  const hidden =
    declarations['display']?.trim().toLowerCase() === 'none' ||
    declarations['visibility']?.trim().toLowerCase() === 'hidden';

  return {
    fill,
    fillRule:
      declarations['fill-rule']?.trim().toLowerCase() === 'evenodd' ? 'evenodd' : parent.fillRule,
    stroke,
    strokeWidth: parseLength(declarations['stroke-width'], parent.strokeWidth),
    color: context.color,
    visible: parent.visible && !hidden,
  };
}

function opacity(value: string | undefined): number {
  if (value === undefined) return 1;
  const text = value.trim();
  const n = text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text);
  return Number.isFinite(n) ? clamp01(n) : 1;
}

/**
 * Eine gelesene Farbe mit ihrer Deckkraft verrechnen; ohne eigene Angabe
 * gilt die geerbte.
 *
 * Die geerbte Farbe wird dabei **nicht** noch einmal abgedunkelt: Eine
 * Gruppe mit halber Deckkraft hat ihre Kinder schon aufgehellt, als deren
 * Stil entstand.
 */
function withOpacity(
  parsed: Rgb | null | undefined,
  alpha: number,
  inherited: Rgb | null,
): Rgb | null {
  if (parsed === undefined)
    return alpha >= 0.999 ? inherited : inherited && composite(inherited, alpha);
  if (parsed === null) return null;
  return composite(parsed, alpha);
}

/**
 * Ein Stylesheet aus `<style>`-Blöcken.
 *
 * Getragen werden einfache Selektoren: `.klasse`, `#id`, `tag` und
 * Listen davon. Alles mit Kombinatoren, Pseudoklassen oder Medienabfragen
 * wird übergangen — Exportfilter schreiben so etwas nicht, und falsch
 * angewandt wäre schlimmer als gar nicht.
 */
export class StyleSheet {
  private readonly byTag = new Map<string, Declarations>();
  private readonly byClass = new Map<string, Declarations>();
  private readonly byId = new Map<string, Declarations>();

  add(css: string): void {
    // Kommentare raus, dann Regel für Regel.
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = /([^{}]+)\{([^{}]*)\}/g;
    for (;;) {
      const match = rule.exec(clean);
      if (!match) break;
      const declarations = parseDeclarations(match[2] as string);
      for (const selector of (match[1] as string).split(',')) {
        this.addRule(selector.trim(), declarations);
      }
    }
  }

  private addRule(selector: string, declarations: Declarations): void {
    if (selector === '' || /[\s>+~:[*]/.test(selector)) return;
    const target = selector.startsWith('.')
      ? this.byClass
      : selector.startsWith('#')
        ? this.byId
        : this.byTag;
    const key = (
      selector.startsWith('.') || selector.startsWith('#') ? selector.slice(1) : selector
    ).toLowerCase();
    target.set(key, { ...target.get(key), ...declarations });
  }

  /** Die passenden Eigenschaften, schwache Selektoren zuerst. */
  match(element: XmlElement): Declarations {
    const out: Declarations = { ...this.byTag.get(element.name) };
    const classes = element.attrs['class'];
    if (classes !== undefined) {
      for (const name of classes.trim().split(/\s+/)) {
        Object.assign(out, this.byClass.get(name.toLowerCase()));
      }
    }
    const id = element.attrs['id'];
    if (id !== undefined) Object.assign(out, this.byId.get(id.toLowerCase()));
    return out;
  }
}
