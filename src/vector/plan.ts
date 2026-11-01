/**
 * Von der gelesenen Zeichnung zu Flächen und Strichen in Millimetern.
 *
 * Zwei Dinge passieren hier. Erstens die Größe: Der Entwurf trägt noch die
 * Koordinaten der Datei, gestickt wird in Millimetern — gestreckt wird auf
 * die eingestellte Breite. Zweitens die Farben: Eine Vektordatei sagt ihre
 * Farben selbst, es muss nichts geraten werden. Nur ihre Zahl kann zu groß
 * sein, denn jede Farbe ist ein Garn und ein Halt der Maschine. Darum lassen
 * sich die Farben zusammenlegen — und zwar immer die beiden ähnlichsten,
 * bis die gewünschte Zahl erreicht ist.
 *
 * Was *nicht* passiert: raten. Kein k-Means, keine Toleranz, keine Pipette.
 * Bei einem Pixelbild muss man die Farben finden; hier stehen sie da.
 */
import { pointInShape, shapeArea } from '../core/geometry/polygon.ts';
import type { Shape } from '../core/geometry/polygon.ts';
import type { TracedLine } from '../core/pipeline.ts';
import type { Point } from '../core/types.ts';
import { labDistance, rgbToLab, toHex } from '../image/color.ts';
import type { Lab, Rgb } from '../image/color.ts';
import type { TracedArea } from '../image/trace.ts';
import type { VectorDocument, VectorElement } from './types.ts';

export interface VectorPlanOptions {
  /** Zielbreite des Motivs in Millimetern. */
  widthMm: number;
  /**
   * Höchstzahl der Garne. Ohne Angabe bleibt jede Farbe der Datei eigen.
   */
  colorCount?: number;
  /**
   * Farben, die nicht gestickt werden.
   *
   * Sie bleiben für sich: Eine weggelassene Farbe mit einer gestickten
   * zusammenzulegen, geht immer schief. Entweder verschwindet ein Teil
   * des Motivs, weil er dem Hintergrund ähnlich sah, oder der
   * Hintergrund wird mitgestickt — eine volle Fläche Garn, die eine
   * Stunde kostet. Untereinander dürfen sie zusammen, das ändert nichts.
   */
  ignored?: Rgb[];
  /** Flächen unter dieser Größe fliegen raus. */
  minAreaMm2?: number;
  /** Striche unter dieser Länge fliegen raus. */
  minLineMm?: number;
}

export interface VectorPlan {
  palette: Rgb[];
  /** Bestickte Fläche in mm² je Garn — das Gegenstück zu den Pixelzahlen. */
  counts: number[];
  areas: TracedArea[];
  lines: TracedLine[];
  /** Das Garn des Hintergrunds, oder `null`, wenn es keinen gibt. */
  backgroundIndex: number | null;
}

/**
 * Ab diesem Lab-Abstand sind zwei Farben wirklich zwei Farben.
 *
 * Knapp bemessen: Hier wird nichts zusammengefasst, was der Zeichner
 * unterschieden hat — nur was beim Exportieren auseinandergelaufen ist,
 * etwa `#ffffff` und `#fefefe` aus zwei Ebenen.
 */
const SAME_COLOR_DISTANCE = 2;

/** So viele verschiedene Farben werden einzeln betrachtet. */
const MAX_DISTINCT = 256;

/** Winzige Teile kosten einen Schnitt und zwei Verriegelungen; das lohnt nicht. */
const MIN_AREA_MM2 = 1;
const MIN_LINE_MM = 1;

export function planVector(doc: VectorDocument, options: VectorPlanOptions): VectorPlan {
  const { widthMm, colorCount, minAreaMm2 = MIN_AREA_MM2, minLineMm = MIN_LINE_MM } = options;
  if (doc.width <= 0 || doc.height <= 0 || widthMm <= 0) {
    return { palette: [], counts: [], areas: [], lines: [], backgroundIndex: null };
  }

  const scale = widthMm / doc.width;
  const clusters = clusterColors(doc, colorCount, options.ignored ?? []);
  const palette = clusters.map((c) => c.color);
  const counts = new Array<number>(palette.length).fill(0);
  const indexOf = colorLookup(clusters);

  const areas: TracedArea[] = [];
  const lines: TracedLine[] = [];

  for (const element of doc.elements) {
    const colorIndex = indexOf(element.color);
    if (colorIndex < 0) continue;

    if (element.kind === 'area') {
      const shape = scaleShape(element.shape, scale);
      const areaMm2 = shapeArea(shape);
      if (areaMm2 < minAreaMm2) continue;
      areas.push({ colorIndex, shape, areaMm2 });
      counts[colorIndex] = (counts[colorIndex] as number) + areaMm2;
      continue;
    }

    const path = element.path.map((p) => scalePoint(p, scale));
    const widthOfLine = element.width * scale;
    const lengthMm = pathLength(path, element.closed);
    if (lengthMm < minLineMm) continue;
    lines.push({ colorIndex, path, closed: element.closed, widthMm: widthOfLine, lengthMm });
    counts[colorIndex] = (counts[colorIndex] as number) + lengthMm * widthOfLine;
  }

  return {
    palette,
    counts,
    areas,
    lines,
    backgroundIndex: backgroundOf(areas, widthMm, doc.height * scale),
  };
}

/**
 * Der Hintergrund: die hinterste Fläche, die bis in alle vier Ecken reicht.
 *
 * Eine volle Fläche Garn hinter dem Motiv kostet eine Stunde und sieht nach
 * nichts aus; sie gehört ausgeschaltet. Die Ecken sind dabei der
 * entscheidende Prüfstein — ein Hintergrundrechteck füllt sie, ein großer
 * Kreis oder eine Silhouette nicht. Darum wird aus einem schwarzen Kreis
 * nicht versehentlich „Hintergrund“ und damit ein leeres Stickbild.
 *
 * Gesucht wird nur unter den hintersten Flächen: Was vor etwas anderem
 * liegt, ist kein Hintergrund. Und ohne irgendetwas davor gibt es auch
 * keinen — dann ist diese Fläche das Motiv.
 */
function backgroundOf(areas: TracedArea[], widthMm: number, heightMm: number): number | null {
  if (areas.length < 2) return null;
  const inset = Math.min(widthMm, heightMm) * 0.01;
  const corners: Point[] = [
    { x: inset, y: inset },
    { x: widthMm - inset, y: inset },
    { x: widthMm - inset, y: heightMm - inset },
    { x: inset, y: heightMm - inset },
  ];
  const first = areas[0] as TracedArea;
  return corners.every((corner) => pointInShape(first.shape, corner)) ? first.colorIndex : null;
}

/** Wie viele Garne die Datei von sich aus mitbringt. */
export function colorCountOf(doc: VectorDocument): number {
  return clusterColors(doc, undefined, []).length;
}

interface Cluster {
  /** Die Farbe, mit der gestickt wird: die der größten Fläche im Bündel. */
  color: Rgb;
  lab: Lab;
  /** Alle Farben der Datei, die zu diesem Garn gehören. */
  members: Rgb[];
  weight: number;
  /** Stelle des ersten Vorkommens — bestimmt die Reihenfolge der Garne. */
  order: number;
  /** Wird nicht gestickt und bleibt deshalb unter sich. */
  ignored: boolean;
}

/**
 * Die Farben der Datei zu Garnen bündeln.
 *
 * Erst werden gleiche Farben zusammengezählt, dann die, die sich nur durch
 * Rundung unterscheiden, und erst zuletzt — wenn der Nutzer weniger Garne
 * will als die Datei Farben hat — die jeweils ähnlichsten, eins nach dem
 * anderen.
 */
function clusterColors(doc: VectorDocument, target: number | undefined, ignored: Rgb[]): Cluster[] {
  let clusters = initialClusters(doc.elements, new Set(ignored.map(toHex)));
  // Ohne Wunsch des Nutzers gibt es keine Obergrenze — dann werden nur
  // Farben zusammengelegt, die ohnehin dieselbe sind.
  const limit = target === undefined ? Infinity : Math.max(1, target);

  for (;;) {
    if (clusters.length <= 1) break;
    // Bleibt nur noch ein verbotenes Paar übrig, hört das Zusammenlegen
    // hier auf — lieber ein Garn mehr als ein zerstörtes Motiv.
    const pair = closestPair(clusters);
    if (!pair) break;
    const tooMany = clusters.length > limit;
    if (!tooMany && pair.distance > SAME_COLOR_DISTANCE) break;
    clusters = merge(clusters, pair.a, pair.b);
  }

  // Reihenfolge der Zeichnung: Was zuerst gezeichnet wurde, liegt hinten
  // und wird darum zuerst gestickt.
  return clusters.sort((a, b) => a.order - b.order);
}

function initialClusters(elements: VectorElement[], ignored: Set<string>): Cluster[] {
  const byColor = new Map<string, Cluster>();
  elements.forEach((element, index) => {
    const key = toHex(element.color);
    const weight = elementWeight(element);
    const existing = byColor.get(key);
    if (existing) {
      existing.weight += weight;
      return;
    }
    byColor.set(key, {
      color: element.color,
      lab: rgbToLab(element.color),
      members: [element.color],
      weight,
      order: index,
      ignored: ignored.has(key),
    });
  });

  const all = [...byColor.values()];
  if (all.length <= MAX_DISTINCT) return all;

  // Mehr Farben, als sich paarweise vergleichen lassen: Die größten Flächen
  // geben die Garne vor, der Rest kommt zum nächstgelegenen dazu. Ein
  // Verlauf, der als tausend Rechtecke exportiert wurde, bringt die
  // Rechnung sonst zum Stehen.
  const seeds = [...all].sort((a, b) => b.weight - a.weight).slice(0, MAX_DISTINCT);
  const isSeed = new Set(seeds);
  for (const cluster of all) {
    if (isSeed.has(cluster)) continue;
    let best = seeds[0] as Cluster;
    let bestD = Infinity;
    for (const seed of seeds) {
      const d = labDistance(cluster.lab, seed.lab);
      if (d < bestD) {
        bestD = d;
        best = seed;
      }
    }
    best.members.push(cluster.color);
    best.weight += cluster.weight;
    best.order = Math.min(best.order, cluster.order);
    best.ignored = best.ignored && cluster.ignored;
  }
  return seeds;
}

function elementWeight(element: VectorElement): number {
  if (element.kind === 'area') return shapeArea(element.shape);
  return pathLength(element.path, element.closed) * Math.max(element.width, 1e-6);
}

/** Das ähnlichste Paar, das zusammengelegt werden darf. */
function closestPair(clusters: Cluster[]): { a: number; b: number; distance: number } | null {
  let best: { a: number; b: number; distance: number } | null = null;
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const one = clusters[i] as Cluster;
      const other = clusters[j] as Cluster;
      if (one.ignored !== other.ignored) continue;
      const distance = labDistance(one.lab, other.lab);
      if (!best || distance < best.distance) best = { a: i, b: j, distance };
    }
  }
  return best;
}

/** Zwei Bündel zusammenlegen; die größere Fläche gibt die Garnfarbe vor. */
function merge(clusters: Cluster[], a: number, b: number): Cluster[] {
  const first = clusters[a] as Cluster;
  const second = clusters[b] as Cluster;
  const heavier = first.weight >= second.weight ? first : second;
  const merged: Cluster = {
    color: heavier.color,
    lab: heavier.lab,
    members: [...first.members, ...second.members],
    weight: first.weight + second.weight,
    order: Math.min(first.order, second.order),
    ignored: first.ignored && second.ignored,
  };
  return clusters.filter((_, i) => i !== a && i !== b).concat(merged);
}

/** Von der Farbe eines Elements zum Garn — über die Mitgliederlisten. */
function colorLookup(clusters: Cluster[]): (color: Rgb) => number {
  const byHex = new Map<string, number>();
  clusters.forEach((cluster, index) => {
    for (const member of cluster.members) byHex.set(toHex(member), index);
  });
  return (color) => byHex.get(toHex(color)) ?? -1;
}

function scalePoint(p: Point, scale: number): Point {
  return { x: p.x * scale, y: p.y * scale };
}

function scaleShape(shape: Shape, scale: number): Shape {
  return {
    outer: shape.outer.map((p) => scalePoint(p, scale)),
    holes: shape.holes.map((h) => h.map((p) => scalePoint(p, scale))),
  };
}

export function pathLength(path: Point[], closed: boolean): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Point;
    const b = path[i] as Point;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  if (closed && path.length > 2) {
    const first = path[0] as Point;
    const last = path[path.length - 1] as Point;
    total += Math.hypot(first.x - last.x, first.y - last.y);
  }
  return total;
}
