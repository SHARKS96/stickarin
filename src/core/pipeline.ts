/**
 * Von den erkannten Flächen zum fertigen Stichplan.
 *
 * Reihenfolge: Farben hinten nach vorn, innerhalb einer Farbe die Flächen
 * über einen Nächster-Nachbar-Weg verbinden, lange Wege als Sprung mit
 * Schnitt. Verriegelt wird je Fadenstück, darum kümmert sich der Builder.
 */
import { FILL_SPACING_MM, SATIN_MAX_WIDTH_MM } from './constants.ts';
import { insetConvex, polygonBounds } from './geometry/polygon.ts';
import type { Polygon } from './geometry/polygon.ts';
import { StitchBuilder, dist } from './stitch/builder.ts';
import { fillArea } from './stitch/fill.ts';
import { satinLayers } from './stitch/satin.ts';
import type { Point, StitchPlan, ThreadColor } from './types.ts';
import { approximateWidth } from '../image/trace.ts';
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

export interface ColorPlanInput {
  thread: ThreadColor;
  areas: TracedArea[];
  /** Je Fläche eine Einstellung; fehlt eine, gilt die automatische Wahl. */
  settings?: (AreaSettings | undefined)[];
}

/** Automatische Wahl: schmal wird Satin, breit wird Füllstich. */
export function defaultSettingsFor(poly: Polygon): AreaSettings {
  const width = approximateWidth(poly);
  return {
    stitchType: width <= SATIN_MAX_WIDTH_MM ? 'satin' : 'fill',
    spacing: FILL_SPACING_MM,
    angle: 0,
    raisedLayers: 0,
  };
}

function centroid(poly: Polygon): Point {
  const b = polygonBounds(poly);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/** Flächen so sortieren, dass der Weg zwischen ihnen kurz bleibt. */
function nearestNeighbourOrder(areas: TracedArea[]): TracedArea[] {
  if (areas.length <= 2) return [...areas];
  const rest = [...areas];
  const out: TracedArea[] = [rest.shift() as TracedArea];
  while (rest.length > 0) {
    const from = centroid((out[out.length - 1] as TracedArea).polygon);
    let best = 0;
    let bestD = Infinity;
    rest.forEach((a, i) => {
      const d = dist(from, centroid(a.polygon));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    out.push(rest.splice(best, 1)[0] as TracedArea);
  }
  return out;
}

/** Mittellinie einer schmalen Fläche, grob über die lange Achse. */
function spineOf(poly: Polygon): { center: Point[]; width: number } {
  const b = polygonBounds(poly);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  if (w >= h) {
    const y = (b.minY + b.maxY) / 2;
    return {
      center: [
        { x: b.minX, y },
        { x: b.maxX, y },
      ],
      width: h,
    };
  }
  const x = (b.minX + b.maxX) / 2;
  return {
    center: [
      { x, y: b.minY },
      { x, y: b.maxY },
    ],
    width: w,
  };
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
    if (color.areas.length === 0) continue;
    if (threads.length > 0) builder.colorChange();
    threads.push(color.thread);

    const ordered = nearestNeighbourOrder(color.areas);
    ordered.forEach((area, areaIdx) => {
      const original = color.areas.indexOf(area);
      const settings = color.settings?.[original] ?? defaultSettingsFor(area.polygon);

      // Weit entfernte Flächen bekommen einen Sprung mit Schnitt davor.
      const target = centroid(area.polygon);
      const here = builder.current;
      if (areaIdx > 0 && here && dist(here, target) > jumpThresholdMm) builder.moveTo(target);

      stitchArea(builder, area.polygon, settings);
    });
  }

  return { entries: builder.finish(), threads };
}

function stitchArea(builder: StitchBuilder, poly: Polygon, settings: AreaSettings): void {
  if (settings.stitchType === 'outline') {
    builder.runLoop(poly);
    return;
  }

  if (settings.stitchType === 'satin') {
    const { center, width } = spineOf(poly);
    const layers = satinLayers(center, width);
    builder.runPath(layers.centerRun);
    builder.runPath(layers.underlay);
    builder.runPath(layers.top);
    return;
  }

  // Füllstich: Kantenlauf, Unterlage, ggf. 3D-Lagen, Deckschicht.
  const inner = insetConvex(poly, 0) ?? poly;
  builder.moveTo(inner[0] as Point);
  fillArea(builder, inner, {
    spacing: settings.spacing,
    angle: settings.angle,
    raisedLayers: settings.raisedLayers,
  });
}
