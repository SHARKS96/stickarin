/**
 * Von den erkannten Flächen zum fertigen Stichplan.
 *
 * Reihenfolge: Farben hinten nach vorn, innerhalb einer Farbe die Flächen
 * über einen Nächster-Nachbar-Weg verbinden, lange Wege als Sprung mit
 * Schnitt. Verriegelt wird je Fadenstück, darum kümmert sich der Builder.
 */
import { FILL_SPACING_MM, SATIN_MAX_WIDTH_MM, SATIN_SPACING_MM } from './constants.ts';
import { approximateWidth, normalizeShape, shapeBounds } from './geometry/polygon.ts';
import type { Shape } from './geometry/polygon.ts';
import { StitchBuilder, dist } from './stitch/builder.ts';
import { fillArea } from './stitch/fill.ts';
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

export interface ColorPlanInput {
  thread: ThreadColor;
  areas: TracedArea[];
  /** Je Fläche eine Einstellung; fehlt eine, gilt die automatische Wahl. */
  settings?: (AreaSettings | undefined)[];
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

function centroid(shape: Shape): Point {
  const b = shapeBounds(shape);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/** Flächen so sortieren, dass der Weg zwischen ihnen kurz bleibt. */
function nearestNeighbourOrder(areas: TracedArea[]): TracedArea[] {
  if (areas.length <= 2) return [...areas];
  const rest = [...areas];
  const out: TracedArea[] = [rest.shift() as TracedArea];
  while (rest.length > 0) {
    const from = centroid((out[out.length - 1] as TracedArea).shape);
    let best = 0;
    let bestD = Infinity;
    rest.forEach((a, i) => {
      const d = dist(from, centroid(a.shape));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    out.push(rest.splice(best, 1)[0] as TracedArea);
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
    if (color.areas.length === 0) continue;
    if (threads.length > 0) builder.colorChange();
    threads.push(color.thread);

    const ordered = nearestNeighbourOrder(color.areas);
    ordered.forEach((area, areaIdx) => {
      const original = color.areas.indexOf(area);
      const settings = color.settings?.[original] ?? defaultSettingsFor(area.shape);

      // Weit entfernte Flächen bekommen einen Sprung mit Schnitt davor.
      const target = centroid(area.shape);
      const here = builder.current;
      if (areaIdx > 0 && here && dist(here, target) > jumpThresholdMm) builder.moveTo(target);

      stitchArea(builder, area.shape, settings);
    });
  }

  return { entries: builder.finish(), threads };
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
