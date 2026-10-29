/**
 * Rechen-Worker: Farbreduktion, Vektorisierung und Stichplan.
 *
 * Läuft im eigenen Thread, damit die Regler auf dem iPad flüssig bleiben.
 * Der Worker hält den zuletzt berechneten Plan, damit das Speichern nicht
 * alles noch einmal rechnen muss.
 *
 * Zwei Wege führen zu den Flächen: Ein Pixelbild muss erst in Farben
 * zerlegt und seine Masken müssen verfolgt werden; eine Vektorzeichnung
 * bringt Farben und Konturen schon mit. Ab den Flächen ist alles
 * dasselbe — Reihenfolge, Stichart, Stichplan, Dateitrio.
 */
import { buildPlan, defaultLineSettingsFor, defaultSettingsFor } from '../core/pipeline.ts';
import { satinMetrics } from '../core/stitch/satin.ts';
import type { ColorPlanInput, TracedLine } from '../core/pipeline.ts';
import { exportDesign } from '../core/export.ts';
import { approximateWidth } from '../core/geometry/polygon.ts';
import { planStats, toCompactPlan } from '../core/types.ts';
import type { StitchPlan, ThreadColor } from '../core/types.ts';
import type { Rgb } from '../image/color.ts';
import { paletteAncestors } from '../image/ancestry.ts';
import { quantize } from '../image/quantize.ts';
import { traceAreas } from '../image/trace.ts';
import type { TracedArea } from '../image/trace.ts';
import { planVector } from '../vector/plan.ts';
import type { VectorDocument } from '../vector/types.ts';
import type {
  AreaInfo,
  ComputeOptions,
  LineInfo,
  WorkerRequest,
  WorkerResponse,
  WorkImage,
} from './protocol.ts';

let lastPlan: StitchPlan | null = null;

/**
 * Das Ergebnis der vorigen Farbreduktion. Daraus leitet sich ab, aus welcher
 * alten Farbe jede neue hervorgegangen ist — die Oberfläche hängt ihre
 * Einstellungen daran.
 */
let lastQuantize: { palette: Rgb[]; indices: Int16Array } | null = null;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'compute') post(compute(request));
    else post(exportFiles(request));
  } catch (error) {
    post({
      type: 'failed',
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

function post(response: WorkerResponse): void {
  // Die typisierten Felder des Plans werden übertragen statt kopiert.
  const transfer: Transferable[] = [];
  if (response.type === 'computed' && response.plan) {
    transfer.push(response.plan.kinds.buffer, response.plan.xs.buffer, response.plan.ys.buffer);
  }
  (self as unknown as Worker).postMessage(response, transfer);
}

/** Was beide Wege liefern müssen, bevor der Stichplan entsteht. */
interface Found {
  palette: Rgb[];
  counts: number[];
  areas: TracedArea[];
  lines: TracedLine[];
  backgroundIndex: number | null;
  /** Je neuer Farbe die alte, aus der sie hervorgegangen ist. */
  ancestors: (number | null)[];
  /** Die Palette, auf die sich `ancestors` bezieht. */
  ancestorsOf: Rgb[];
}

function compute(request: Extract<WorkerRequest, { type: 'compute' }>): WorkerResponse {
  const { source, options } = request;
  const found =
    source.kind === 'vector' ? fromVector(source.doc, options) : fromImage(source.image, options);

  if (found.palette.length === 0) {
    lastPlan = null;
    return {
      type: 'computed',
      id: request.id,
      palette: [],
      counts: [],
      areas: [],
      lines: [],
      plan: null,
      stats: null,
      threads: [],
      backgroundIndex: null,
      ancestors: [],
      ancestorsOf: found.ancestorsOf,
    };
  }

  const areaInfos: AreaInfo[] = found.areas.map((a) => ({
    colorIndex: a.colorIndex,
    areaMm2: a.areaMm2,
    widthMm: approximateWidth(a.shape),
    satinWidthMm: satinMetrics(a.shape).width,
    defaults: defaultSettingsFor(a.shape),
  }));
  const lineInfos: LineInfo[] = found.lines.map((l) => ({
    colorIndex: l.colorIndex,
    lengthMm: l.lengthMm,
    widthMm: l.widthMm,
    closed: l.closed,
    defaults: defaultLineSettingsFor(l),
  }));

  const plan = buildPlan(colorInputs(found, options));
  lastPlan = plan.entries.length > 0 ? plan : null;

  return {
    type: 'computed',
    id: request.id,
    palette: found.palette,
    counts: found.counts,
    areas: areaInfos,
    lines: lineInfos,
    plan: lastPlan ? toCompactPlan(lastPlan) : null,
    stats: lastPlan ? planStats(lastPlan) : null,
    threads: plan.threads,
    backgroundIndex: found.backgroundIndex,
    ancestors: found.ancestors,
    ancestorsOf: found.ancestorsOf,
  };
}

/** Pixelbild: Farben finden, Masken verfolgen. */
function fromImage(image: WorkImage, options: ComputeOptions): Found {
  const q = quantize(image.data, image.width, image.height, {
    colors: options.colorCount,
    ignored: options.ignoredSamples,
    tolerance: options.tolerance,
  });

  const previous = lastQuantize;
  lastQuantize = { palette: q.palette, indices: q.indices };

  return {
    palette: q.palette,
    counts: q.counts,
    areas: q.palette.length === 0 ? [] : traceAreas(q, { mmPerPixel: options.widthMm / q.width }),
    lines: [],
    backgroundIndex: dominantBorderColor(q.indices, q.width, q.height),
    ancestors: previous
      ? paletteAncestors(q.indices, q.palette.length, previous.indices, previous.palette.length)
      : [],
    ancestorsOf: previous?.palette ?? [],
  };
}

/**
 * Vektorzeichnung: nichts zu finden, nur umzurechnen.
 *
 * Eine Herkunft der Farben wird nicht mitgeliefert: Sie stehen in der
 * Datei und wandern nur, wenn der Nutzer ihre Zahl ändert. Diesen Fall
 * löst die Oberfläche über den Farbabstand — bei Farben, die beide direkt
 * aus der Datei stammen, trifft er immer.
 */
function fromVector(doc: VectorDocument, options: ComputeOptions): Found {
  // Eine neue Rechnung aus einer Vektordatei sagt nichts über eine
  // vorangegangene Farbreduktion; der gemerkte Stand gilt nicht mehr.
  lastQuantize = null;

  const plan = planVector(doc, {
    widthMm: options.widthMm,
    colorCount: options.colorCount,
  });
  return {
    palette: plan.palette,
    counts: plan.counts.map((mm2) => Math.round(mm2)),
    areas: plan.areas,
    lines: plan.lines,
    backgroundIndex: plan.backgroundIndex,
    ancestors: [],
    ancestorsOf: [],
  };
}

/**
 * Die Farbe, die den Bildrand beherrscht.
 *
 * Ein Motiv berührt den Rand selten rundum; was dort liegt, ist fast immer
 * der Hintergrund. Den will man nicht sticken — eine volle Fläche Garn
 * hinter dem Motiv kostet eine Stunde und sieht nach nichts aus.
 */
function dominantBorderColor(indices: Int16Array, width: number, height: number): number | null {
  const tally = new Map<number, number>();
  const count = (i: number) => {
    const c = indices[i] as number;
    if (c < 0) return;
    tally.set(c, (tally.get(c) ?? 0) + 1);
  };
  for (let x = 0; x < width; x++) {
    count(x);
    count((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    count(y * width);
    count(y * width + width - 1);
  }

  let best: number | null = null;
  let bestN = 0;
  let total = 0;
  for (const [index, n] of tally) {
    total += n;
    if (n > bestN) {
      bestN = n;
      best = index;
    }
  }
  // Nur wenn eine Farbe den Rand wirklich beherrscht; sonst lieber nichts
  // wegnehmen, als dem Nutzer ein halbes Motiv zu unterschlagen.
  return total > 0 && bestN / total >= 0.7 ? best : null;
}

/** Baut die Farbliste in Stickreihenfolge, ohne die weggelassenen Farben. */
function colorInputs(found: Found, options: ComputeOptions): ColorPlanInput[] {
  const inputs: ColorPlanInput[] = [];
  for (const color of options.colors) {
    if (color.ignored) continue;
    const areas = found.areas.filter((a) => a.colorIndex === color.index);
    const lines = found.lines.filter((l) => l.colorIndex === color.index);
    if (areas.length === 0 && lines.length === 0) continue;

    // Von Hand gewähltes Garn schlägt die erkannte Bildfarbe.
    const rgb = color.thread ?? found.palette[color.index] ?? { r: 0, g: 0, b: 0 };
    const thread: ThreadColor = {
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      name: color.name,
      catalog: color.catalog,
    };
    inputs.push({
      thread,
      areas,
      lines,
      settings: areas.map(
        (a) => options.areaSettings[found.areas.indexOf(a)] ?? defaultSettingsFor(a.shape),
      ),
      lineSettings: lines.map(
        (l) => options.lineSettings[found.lines.indexOf(l)] ?? defaultLineSettingsFor(l),
      ),
    });
  }
  return inputs;
}

function exportFiles(request: Extract<WorkerRequest, { type: 'export' }>): WorkerResponse {
  if (!lastPlan) {
    return { type: 'failed', id: request.id, message: 'Es liegt noch kein Stichplan vor.' };
  }
  return { type: 'exported', id: request.id, files: exportDesign(lastPlan, request.name) };
}
