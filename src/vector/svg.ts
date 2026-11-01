/**
 * Eine SVG-Datei lesen und in Flächen und Striche übersetzen.
 *
 * Der Baum wird einmal durchlaufen; jedes Element erbt die Abbildung und den
 * Stil seines Elternteils. Formen werden in Pfade umgeschrieben und von
 * derselben Stelle gelesen: Ein Kreis ist zwei Bögen, ein abgerundetes
 * Rechteck vier — so braucht nur ein Pfadleser zu stimmen.
 *
 * Der viewBox wird bewusst **nicht** ausgewertet. Er legt fest, wie die
 * Zeichnung in ein Fenster passt; hier gibt es kein Fenster, sondern einen
 * Stickrahmen, und die Größe stellt der Nutzer in Millimetern ein. Was
 * zählt, ist allein das Motiv: Am Ende wird auf seine eigene Ausdehnung
 * zugeschnitten, damit aus „8 cm breit“ nicht „8 cm Rand mit einem Punkt
 * in der Mitte“ wird.
 */
import { ringBounds } from '../core/geometry/polygon.ts';
import type { Ring } from '../core/geometry/polygon.ts';
import type { Bounds, Point } from '../core/types.ts';
import type { Rgb } from '../image/color.ts';
import {
  ownDeclarations,
  parseColor,
  parseLength,
  resolveStyle,
  ROOT_STYLE,
  StyleSheet,
} from './paint.ts';
import type { GradientTable, Style } from './paint.ts';
import { parsePath } from './path.ts';
import type { SubPath } from './path.ts';
import { ringsToShapes } from './shapes.ts';
import {
  applyMatrix,
  IDENTITY,
  matrixScale,
  multiply,
  numbers,
  parseTransform,
  translation,
} from './transform.ts';
import type { Matrix } from './transform.ts';
import type { VectorArea, VectorDocument, VectorElement, VectorLine } from './types.ts';
import { parseXml, walkXml } from './xml.ts';
import type { XmlElement } from './xml.ts';

/**
 * Feinheit, mit der Kurven in Geraden zerfallen, als Anteil der Motivgröße.
 *
 * Ein Zweitausendstel von 15 cm sind 0,075 mm — feiner als ein Stich und
 * feiner als die Maschine auflöst (0,1 mm). Relativ statt absolut, weil
 * dieselbe Datei in 2 cm und in 20 cm gestickt werden kann.
 */
const FLATNESS_RATIO = 1 / 2000;

/** Elemente, die nichts zeichnen; ihr Inhalt wird nur über `use` sichtbar. */
const SKIPPED = new Set([
  'defs',
  'clippath',
  'mask',
  'marker',
  'symbol',
  'pattern',
  'filter',
  'style',
  'title',
  'desc',
  'metadata',
  'script',
  'lineargradient',
  'radialgradient',
  'animate',
  'animatetransform',
]);

/** Elemente, die wie eine Gruppe behandelt werden. */
const GROUPS = new Set(['g', 'svg', 'a', 'switch']);

const MAX_USE_DEPTH = 8;

export function parseSvg(source: string): VectorDocument {
  const root = parseXml(source);
  if (!root) return { width: 0, height: 0, elements: [], warnings: ['Die Datei ist kein SVG.'] };

  const sheet = new StyleSheet();
  const ids = new Map<string, XmlElement>();
  for (const element of walkXml(root)) {
    if (element.name === 'style') sheet.add(element.text);
    const id = element.attrs['id'];
    if (id !== undefined && !ids.has(id)) ids.set(id, element);
  }
  const gradients = gradientTable(ids);

  // Erst mit einer geschätzten Größe lesen, dann prüfen: Die Feinheit der
  // Kurvenzerlegung hängt an der Motivgröße, die erst danach feststeht.
  let collected = collect(root, estimateExtent(root) * FLATNESS_RATIO, sheet, ids, gradients);
  const extent = Math.max(
    collected.bounds.maxX - collected.bounds.minX,
    collected.bounds.maxY - collected.bounds.minY,
  );
  if (extent > 0 && !within(extent, estimateExtent(root), 4)) {
    collected = collect(root, extent * FLATNESS_RATIO, sheet, ids, gradients);
  }

  return finish(collected);
}

interface Collected {
  elements: VectorElement[];
  bounds: Bounds;
  warnings: Set<string>;
  /** Umschließende Rechtecke aller angewandten Beschnitte. */
  clips: Bounds[];
  clipUnreadable: boolean;
}

function collect(
  root: XmlElement,
  tolerance: number,
  sheet: StyleSheet,
  ids: Map<string, XmlElement>,
  gradients: GradientTable,
): Collected {
  const out: Collected = {
    elements: [],
    bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    warnings: new Set(),
    clips: [],
    clipUnreadable: false,
  };

  /**
   * Das Motiv wächst um jeden Punkt — bei Strichen um ihre halbe Breite.
   *
   * Der Rand wird rundum genommen, auch in Laufrichtung des Strichs. Das
   * ist einen Hauch zu großzügig, aber in der sicheren Richtung: Das Motiv
   * wird dadurch nie größer als gewünscht, sondern höchstens ein wenig
   * kleiner — und passt damit immer in den Rahmen.
   */
  const grow = (p: Point, margin = 0) => {
    out.bounds.minX = Math.min(out.bounds.minX, p.x - margin);
    out.bounds.minY = Math.min(out.bounds.minY, p.y - margin);
    out.bounds.maxX = Math.max(out.bounds.maxX, p.x + margin);
    out.bounds.maxY = Math.max(out.bounds.maxY, p.y + margin);
  };

  /**
   * Die Kennungen aller Elemente, die gerade bearbeitet werden.
   *
   * Ein `use`, das auf einen seiner Vorfahren zeigt, ist ungültig — und
   * würde die Form so oft vervielfachen, wie die Schachtelung erlaubt.
   */
  const open = new Set<string>();

  const visit = (element: XmlElement, parentCtm: Matrix, parentStyle: Style, depth: number) => {
    const ownId = element.attrs['id'];
    if (ownId === undefined) {
      draw(element, parentCtm, parentStyle, depth);
      return;
    }
    if (open.has(ownId)) return;
    open.add(ownId);
    draw(element, parentCtm, parentStyle, depth);
    open.delete(ownId);
  };

  const draw = (element: XmlElement, parentCtm: Matrix, parentStyle: Style, depth: number) => {
    if (SKIPPED.has(element.name)) return;

    const declarations = ownDeclarations(element, sheet);
    const style = resolveStyle(parentStyle, declarations, gradients);
    const own = element.attrs['transform'];
    const ctm = own === undefined ? parentCtm : multiply(parentCtm, parseTransform(own));
    if (!style.visible) return;

    const clip = element.attrs['clip-path'];
    if (clip !== undefined) noteClip(out, clip, ids, ctm);

    if (GROUPS.has(element.name)) {
      for (const child of element.children) visit(child, ctm, style, depth);
      return;
    }

    if (element.name === 'use') {
      if (depth >= MAX_USE_DEPTH) return;
      const href = element.attrs['href'];
      const id = href?.startsWith('#') === true ? href.slice(1) : undefined;
      const target = id === undefined ? undefined : ids.get(id);
      if (!target || id === undefined || open.has(id)) return;
      const shifted = multiply(
        ctm,
        translation(parseLength(element.attrs['x'], 0), parseLength(element.attrs['y'], 0)),
      );
      // Ein `symbol` zeichnet nur über `use`; dann aber wie eine Gruppe.
      // Weil dabei nicht das Element selbst besucht wird, muss seine
      // Kennung hier von Hand offen gehalten werden.
      if (target.name === 'symbol' || target.name === 'svg') {
        open.add(id);
        for (const child of target.children) visit(child, shifted, style, depth + 1);
        open.delete(id);
      } else {
        visit(target, shifted, style, depth + 1);
      }
      return;
    }

    if (element.name === 'text' || element.name === 'tspan' || element.name === 'textpath') {
      out.warnings.add(
        'Die Datei enthält Text. Schrift braucht die Schriftdatei selbst — wandeln Sie den Text im Zeichenprogramm in Pfade um („Text in Kurven“), dann wird er mitgestickt.',
      );
      return;
    }
    if (element.name === 'image') {
      out.warnings.add(
        'Die Datei enthält ein eingebettetes Pixelbild. Es wird nicht gestickt; wählen Sie es einzeln als Bild aus.',
      );
      return;
    }

    const local = subPathsOf(element, tolerance / Math.max(matrixScale(ctm), 1e-9));
    if (local.length === 0) return;
    const mapped = local.map((sub) => ({
      points: sub.points.map((p) => applyMatrix(ctm, p)),
      closed: sub.closed,
    }));

    if (style.fill) {
      const rings: Ring[] = mapped
        // Beim Füllen gilt ein offener Pfad als geschlossen — so steht es
        // in der Norm, und so zeichnet es jeder Browser.
        .filter((sub) => sub.points.length >= 3)
        .map((sub) => sub.points);
      for (const shape of ringsToShapes(rings, style.fillRule)) {
        out.elements.push({ kind: 'area', color: style.fill, shape });
        for (const p of shape.outer) grow(p);
      }
    }

    if (style.stroke && style.strokeWidth > 0) {
      const width = style.strokeWidth * matrixScale(ctm);
      for (const sub of mapped) {
        if (sub.points.length < 2) continue;
        out.elements.push({
          kind: 'line',
          color: style.stroke,
          path: sub.points,
          closed: sub.closed,
          width,
        });
        for (const p of sub.points) grow(p, width / 2);
      }
    }
  };

  visit(root, IDENTITY, ROOT_STYLE, 0);
  return out;
}

/** Verschiebt alles in die linke obere Ecke und macht das Dokument fertig. */
function finish(collected: Collected): VectorDocument {
  const { minX, minY, maxX, maxY } = collected.bounds;
  if (!isFinite(minX) || maxX <= minX || maxY <= minY) {
    const warnings = [...collected.warnings];
    if (collected.elements.length === 0 && warnings.length === 0) {
      warnings.push('In dieser Datei ist keine Fläche und kein Strich zu finden.');
    }
    return { width: 0, height: 0, elements: [], warnings };
  }

  const shift = (p: Point): Point => ({ x: p.x - minX, y: p.y - minY });
  const elements = collected.elements.map(
    (element): VectorElement =>
      element.kind === 'area'
        ? {
            kind: 'area',
            color: element.color,
            shape: {
              outer: element.shape.outer.map(shift),
              holes: element.shape.holes.map((h) => h.map(shift)),
            },
          }
        : { ...element, path: element.path.map(shift) },
  );

  const warnings = [...collected.warnings];
  if (collected.clipUnreadable) {
    warnings.push(
      'Die Datei beschneidet Teile des Motivs auf eine Weise, die hier nicht nachgebildet wird. Prüfen Sie die Vorschau.',
    );
  } else if (clipsCutContent(collected.clips, collected.bounds)) {
    warnings.push(
      'In der Datei ist ein Teil des Motivs abgeschnitten. Gestickt wird das vollständige Motiv — prüfen Sie die Vorschau.',
    );
  }

  return { width: maxX - minX, height: maxY - minY, elements, warnings };
}

/** Beschnitt merken: Rechtecke lassen sich vergleichen, alles andere nicht. */
function noteClip(
  out: Collected,
  reference: string,
  ids: Map<string, XmlElement>,
  ctm: Matrix,
): void {
  const id = /url\(\s*['"]?#([^'")\s]+)/.exec(reference)?.[1];
  const clip = id === undefined ? undefined : ids.get(id);
  if (!clip) return;

  const children = clip.children.filter((c) => !SKIPPED.has(c.name));
  const rect = children.length === 1 ? (children[0] as XmlElement) : null;
  if (!rect || rect.name !== 'rect' || rect.attrs['transform'] !== undefined) {
    out.clipUnreadable = true;
    return;
  }
  const x = parseLength(rect.attrs['x'], 0);
  const y = parseLength(rect.attrs['y'], 0);
  const w = parseLength(rect.attrs['width'], 0);
  const h = parseLength(rect.attrs['height'], 0);
  if (w <= 0 || h <= 0) {
    out.clipUnreadable = true;
    return;
  }
  const corners = [
    applyMatrix(ctm, { x, y }),
    applyMatrix(ctm, { x: x + w, y }),
    applyMatrix(ctm, { x: x + w, y: y + h }),
    applyMatrix(ctm, { x, y: y + h }),
  ];
  out.clips.push(ringBounds(corners));
}

/** Schneidet einer der Beschnitte wirklich etwas weg? */
function clipsCutContent(clips: Bounds[], content: Bounds): boolean {
  // Ein Rand von einem Prozent der Motivgröße gilt als „trifft genau“:
  // Exportfilter setzen den Beschnitt gern bündig um das Motiv.
  const slack = Math.max(content.maxX - content.minX, content.maxY - content.minY) * 0.01;
  return clips.some(
    (c) =>
      content.minX < c.minX - slack ||
      content.minY < c.minY - slack ||
      content.maxX > c.maxX + slack ||
      content.maxY > c.maxY + slack,
  );
}

/**
 * Geometrie eines Elements als Pfadstücke in seinen eigenen Koordinaten.
 *
 * Alle Formen gehen über Pfaddaten — ein Kreis ist zwei Halbbögen. Das
 * spart je Form eine eigene Zerlegung und nutzt den Pfadleser, der ohnehin
 * getestet ist.
 */
function subPathsOf(element: XmlElement, tolerance: number): SubPath[] {
  const a = element.attrs;
  const len = (name: string, fallback = 0) => parseLength(a[name], fallback);

  switch (element.name) {
    case 'path': {
      const d = a['d'];
      return d === undefined ? [] : parsePath(d, tolerance);
    }
    case 'rect': {
      const w = len('width');
      const h = len('height');
      if (w <= 0 || h <= 0) return [];
      const x = len('x');
      const y = len('y');
      // Fehlt ein Radius, gilt der andere für beide Richtungen.
      const rxRaw = a['rx'] === undefined ? len('ry') : len('rx');
      const ryRaw = a['ry'] === undefined ? len('rx') : len('ry');
      const rx = Math.min(Math.max(rxRaw, 0), w / 2);
      const ry = Math.min(Math.max(ryRaw, 0), h / 2);
      if (rx <= 0 || ry <= 0) {
        return [
          {
            points: [
              { x, y },
              { x: x + w, y },
              { x: x + w, y: y + h },
              { x, y: y + h },
            ],
            closed: true,
          },
        ];
      }
      const d =
        `M${x + rx},${y}H${x + w - rx}` +
        `A${rx},${ry} 0 0 1 ${x + w},${y + ry}` +
        `V${y + h - ry}` +
        `A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}` +
        `H${x + rx}` +
        `A${rx},${ry} 0 0 1 ${x},${y + h - ry}` +
        `V${y + ry}` +
        `A${rx},${ry} 0 0 1 ${x + rx},${y}Z`;
      return parsePath(d, tolerance);
    }
    case 'circle': {
      const r = len('r');
      if (r <= 0) return [];
      return ellipsePath(len('cx'), len('cy'), r, r, tolerance);
    }
    case 'ellipse': {
      const rx = len('rx');
      const ry = len('ry');
      if (rx <= 0 || ry <= 0) return [];
      return ellipsePath(len('cx'), len('cy'), rx, ry, tolerance);
    }
    case 'line': {
      const from = { x: len('x1'), y: len('y1') };
      const to = { x: len('x2'), y: len('y2') };
      if (from.x === to.x && from.y === to.y) return [];
      return [{ points: [from, to], closed: false }];
    }
    case 'polyline':
    case 'polygon': {
      const points = pairs(numbers(a['points'] ?? ''));
      if (points.length < 2) return [];
      return [{ points, closed: element.name === 'polygon' }];
    }
    default:
      return [];
  }
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number, tolerance: number): SubPath[] {
  const d =
    `M${cx - rx},${cy}` +
    `A${rx},${ry} 0 1 0 ${cx + rx},${cy}` +
    `A${rx},${ry} 0 1 0 ${cx - rx},${cy}Z`;
  return parsePath(d, tolerance);
}

function pairs(values: number[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < values.length; i += 2) {
    out.push({ x: values[i] as number, y: values[i + 1] as number });
  }
  return out;
}

/**
 * Mittelwert der Stopp-Farben eines Verlaufs.
 *
 * Gestickt wird einfarbig; welche Farbe ein Verlauf „ist“, lässt sich nicht
 * besser beantworten als mit seiner mittleren. Wer es genauer will, teilt
 * die Fläche im Zeichenprogramm auf.
 */
function gradientTable(ids: Map<string, XmlElement>): GradientTable {
  const table: GradientTable = {};
  const stopsOf = (element: XmlElement, depth: number): Rgb[] => {
    const out: Rgb[] = [];
    for (const child of element.children) {
      if (child.name !== 'stop') continue;
      const declarations = child.attrs['style'] === undefined ? child.attrs : mergedStop(child);
      const color = parseColor(declarations['stop-color'] ?? '#000000', {
        color: { r: 0, g: 0, b: 0 },
        gradients: {},
      });
      if (color) out.push(color);
    }
    if (out.length > 0 || depth >= 4) return out;
    // Verläufe erben ihre Stopps häufig von einem anderen Verlauf.
    const href = element.attrs['href'];
    const parent = href?.startsWith('#') === true ? ids.get(href.slice(1)) : undefined;
    return parent ? stopsOf(parent, depth + 1) : [];
  };

  for (const [id, element] of ids) {
    if (element.name !== 'lineargradient' && element.name !== 'radialgradient') continue;
    const stops = stopsOf(element, 0);
    if (stops.length === 0) continue;
    const mean = stops.reduce((sum, c) => ({ r: sum.r + c.r, g: sum.g + c.g, b: sum.b + c.b }), {
      r: 0,
      g: 0,
      b: 0,
    });
    table[id] = {
      r: Math.round(mean.r / stops.length),
      g: Math.round(mean.g / stops.length),
      b: Math.round(mean.b / stops.length),
    };
  }
  return table;
}

/** Ein `<stop>` kann seine Farbe als Attribut oder im `style` tragen. */
function mergedStop(stop: XmlElement): Record<string, string> {
  const out: Record<string, string> = { ...stop.attrs };
  for (const part of (stop.attrs['style'] ?? '').split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    out[part.slice(0, colon).trim().toLowerCase()] = part.slice(colon + 1).trim();
  }
  return out;
}

/**
 * Grobe Schätzung, wie groß die Zeichnung ist — nur für die Feinheit der
 * Kurvenzerlegung im ersten Durchgang.
 */
function estimateExtent(root: XmlElement): number {
  const box = numbers(root.attrs['viewbox'] ?? '');
  if (box.length === 4) {
    const w = box[2] as number;
    const h = box[3] as number;
    if (w > 0 || h > 0) return Math.max(w, h);
  }
  const w = parseLength(root.attrs['width'], 0);
  const h = parseLength(root.attrs['height'], 0);
  if (w > 0 || h > 0) return Math.max(w, h);
  return 100;
}

/** Liegen zwei Größen innerhalb des Faktors `factor` beieinander? */
function within(a: number, b: number, factor: number): boolean {
  if (a <= 0 || b <= 0) return false;
  const ratio = a / b;
  return ratio <= factor && ratio >= 1 / factor;
}

export type { VectorArea, VectorLine };
