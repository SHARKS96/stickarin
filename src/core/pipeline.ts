/**
 * Von den erkannten Flächen zum fertigen Stichplan.
 *
 * Reihenfolge: Farben hinten nach vorn, innerhalb einer Farbe die Flächen
 * über einen Nächster-Nachbar-Weg verbinden, lange Wege als Sprung mit
 * Schnitt. Verriegelt wird je Fadenstück, darum kümmert sich der Builder.
 */
import {
  FILL_SPACING_MM,
  LINE_SATIN_MIN_WIDTH_MM,
  RUN_STITCH_MM,
  SATIN_MAX_WIDTH_MM,
  SATIN_SPACING_MM,
} from './constants.ts';
import { approximateWidth, normalizeShape, shapeBounds } from './geometry/polygon.ts';
import type { Shape } from './geometry/polygon.ts';
import { StitchBuilder, dist } from './stitch/builder.ts';
import { fillArea } from './stitch/fill.ts';
import { runLine, satinLine } from './stitch/line.ts';
import { satinArea } from './stitch/satin.ts';
import type { Point, StitchPlan, ThreadColor } from './types.ts';
import type { TracedArea } from '../image/trace.ts';

export type StitchType = 'fill' | 'satin' | 'outline';

/** Erweiterte Einstellungen je Fläche; standardmäßig verborgen. */
export interface AreaSettings {
  stitchType: StitchType;
  /** Reihenabstand in mm; kleiner = dichter. */
  spacing: number;
  /** Winkel der Reihen im Bogenmaß. */
  angle: number;
  /** Zusätzliche Unterlagelagen für den 3D-Effekt. */
  raisedLayers: number;
}

/**
 * Ein Strich, der entlang seines Pfades gestickt wird.
 *
 * Kommt aus einer Vektorzeichnung: Dort ist ein Umriss ein Pfad mit einer
 * Strichbreite und keine dünne Fläche. Pixelbilder liefern keine Striche —
 * aus ihnen lässt sich nicht ablesen, ob eine dünne Spur als Linie gemeint
 * war oder nur eine schmale Fläche ist.
 */
export interface TracedLine {
  colorIndex: number;
  /** Der Pfad in Millimetern; bei `closed` ohne wiederholten Schlusspunkt. */
  path: Point[];
  closed: boolean;
  /** Strichbreite in mm. */
  widthMm: number;
  /** Pfadlänge in mm — entscheidet, ob der Strich das Anfahren lohnt. */
  lengthMm: number;
}

/** Stichart eines Strichs. */
export type LineStitchType = 'run' | 'satin';

/** Erweiterte Einstellungen je Strich. */
export interface LineSettings {
  stitchType: LineStitchType;
  /** Breite des Satinstrichs in mm. */
  widthMm: number;
  /** Stichlänge des Steppstichs in mm. */
  stitchLength: number;
}

export interface ColorPlanInput {
  thread: ThreadColor;
  areas: TracedArea[];
  /**
   * Striche dieser Farbe.
   *
   * Gestickt werden sie **nach** den Flächen derselben Farbe: Ein Umriss
   * gehört obenauf, sonst verschwindet er unter der Füllung.
   */
  lines?: TracedLine[];
  /** Je Fläche eine Einstellung; fehlt eine, gilt die automatische Wahl. */
  settings?: (AreaSettings | undefined)[];
  /** Je Strich eine Einstellung; fehlt eine, gilt die automatische Wahl. */
  lineSettings?: (LineSettings | undefined)[];
}

/** Automatische Wahl: schmal wird Satin, breit wird Füllstich. */
export function defaultSettingsFor(shape: Shape): AreaSettings {
  const width = approximateWidth(shape);
  return {
    stitchType: width <= SATIN_MAX_WIDTH_MM ? 'satin' : 'fill',
    spacing: FILL_SPACING_MM,
    angle: 0,
    raisedLayers: 0,
  };
}

/** Automatische Wahl für einen Strich: dünn wird Steppstich, breiter Satin. */
export function defaultLineSettingsFor(line: TracedLine): LineSettings {
  return {
    stitchType: line.widthMm >= LINE_SATIN_MIN_WIDTH_MM ? 'satin' : 'run',
    widthMm: line.widthMm,
    stitchLength: RUN_STITCH_MM,
  };
}

function centroid(shape: Shape): Point {
  const b = shapeBounds(shape);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/** Teile so sortieren, dass der Weg zwischen ihnen kurz bleibt. */
function nearestNeighbourOrder<T>(items: T[], at: (item: T) => Point): T[] {
  if (items.length <= 2) return [...items];
  const rest = [...items];
  const out: T[] = [rest.shift() as T];
  while (rest.length > 0) {
    const from = at(out[out.length - 1] as T);
    let best = 0;
    let bestD = Infinity;
    rest.forEach((a, i) => {
      const d = dist(from, at(a));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    out.push(rest.splice(best, 1)[0] as T);
  }
  return out;
}

export interface BuildPlanOptions {
  /** Ab dieser Weglänge wird gesprungen und geschnitten statt durchgestickt. */
  jumpThresholdMm?: number;
}

/**
 * Baut den Stichplan. Die Farbreihenfolge ist die der übergebenen Liste
 * — hinten nach vorn sortiert der Aufrufer.
 */
export function buildPlan(colors: ColorPlanInput[], options: BuildPlanOptions = {}): StitchPlan {
  const { jumpThresholdMm = 8 } = options;
  const builder = new StitchBuilder();
  const threads: ThreadColor[] = [];

  for (const color of colors) {
    const lines = color.lines ?? [];
    if (color.areas.length === 0 && lines.length === 0) continue;
    if (threads.length > 0) builder.colorChange();
    threads.push(color.thread);

    nearestNeighbourOrder(color.areas, (a) => centroid(a.shape)).forEach((area, position) => {
      const original = color.areas.indexOf(area);
      const settings = color.settings?.[original] ?? defaultSettingsFor(area.shape);

      // Weit entfernte Flächen bekommen einen Sprung mit Schnitt davor.
      jumpIfFar(builder, centroid(area.shape), position > 0, jumpThresholdMm);
      stitchArea(builder, area.shape, settings);
    });

    // Striche zuletzt: Ein Umriss gehört über die Füllung, nicht darunter.
    nearestNeighbourOrder(lines, (l) => l.path[0] as Point).forEach((line) => {
      const original = lines.indexOf(line);
      const settings = color.lineSettings?.[original] ?? defaultLineSettingsFor(line);
      jumpIfFar(builder, line.path[0] as Point, true, jumpThresholdMm);
      stitchLine(builder, line, settings);
    });
  }

  return { entries: builder.finish(), threads };
}

/** Sprung mit Schnitt, wenn der Weg zum nächsten Teil zu weit ist. */
function jumpIfFar(
  builder: StitchBuilder,
  target: Point,
  allowed: boolean,
  thresholdMm: number,
): void {
  const here = builder.current;
  if (allowed && here && dist(here, target) > thresholdMm) builder.moveTo(target);
}

function stitchLine(builder: StitchBuilder, line: TracedLine, settings: LineSettings): void {
  if (line.path.length < 2) return;
  if (settings.stitchType === 'satin') {
    satinLine(builder, line.path, line.closed, { width: settings.widthMm });
    return;
  }
  runLine(builder, line.path, line.closed, { stitchLength: settings.stitchLength });
}

function stitchArea(builder: StitchBuilder, raw: Shape, settings: AreaSettings): void {
  const shape = normalizeShape(raw);

  if (settings.stitchType === 'outline') {
    builder.runLoop(shape.outer);
    for (const hole of shape.holes) builder.runLoop(hole);
    return;
  }

  if (settings.stitchType === 'satin') {
    satinArea(builder, shape, { spacing: SATIN_SPACING_MM });
    return;
  }

  // Füllstich: Kantenlauf, Unterlage, ggf. 3D-Lagen, Deckschicht.
  builder.moveTo(shape.outer[0] as Point);
  fillArea(builder, shape, {
    spacing: settings.spacing,
    angle: settings.angle,
    raisedLayers: settings.raisedLayers,
  });
}
