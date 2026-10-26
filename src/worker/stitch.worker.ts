/**
 * Rechen-Worker: Farbreduktion, Vektorisierung und Stichplan.
 *
 * Läuft im eigenen Thread, damit die Regler auf dem iPad flüssig bleiben.
 * Der Worker hält den zuletzt berechneten Plan, damit das Speichern nicht
 * alles noch einmal rechnen muss.
 */
import { buildPlan, defaultSettingsFor } from '../core/pipeline.ts';
import type { ColorPlanInput } from '../core/pipeline.ts';
import { exportDesign } from '../core/export.ts';
import { approximateWidth } from '../core/geometry/polygon.ts';
import { planStats, toCompactPlan } from '../core/types.ts';
import type { StitchPlan, ThreadColor } from '../core/types.ts';
import type { Rgb } from '../image/color.ts';
import { quantize } from '../image/quantize.ts';
import { traceAreas } from '../image/trace.ts';
import type { TracedArea } from '../image/trace.ts';
import type { AreaInfo, WorkerRequest, WorkerResponse } from './protocol.ts';

let lastPlan: StitchPlan | null = null;

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

function compute(request: Extract<WorkerRequest, { type: 'compute' }>): WorkerResponse {
  const { image, options } = request;

  const q = quantize(image.data, image.width, image.height, {
    colors: options.colorCount,
    ignored: options.ignoredSamples,
    tolerance: options.tolerance,
  });

  if (q.palette.length === 0) {
    lastPlan = null;
    return {
      type: 'computed',
      id: request.id,
      palette: [],
      counts: [],
      areas: [],
      plan: null,
      stats: null,
      threads: [],
      backgroundIndex: null,
    };
  }

  const areas = traceAreas(q, { mmPerPixel: options.widthMm / q.width });
  const infos: AreaInfo[] = areas.map((a) => ({
    colorIndex: a.colorIndex,
    areaMm2: a.areaMm2,
    widthMm: approximateWidth(a.shape),
    defaults: defaultSettingsFor(a.shape),
  }));

  const plan = buildPlan(colorInputs(areas, options, q.palette));
  lastPlan = plan.entries.length > 0 ? plan : null;

  return {
    type: 'computed',
    id: request.id,
    palette: q.palette,
    counts: q.counts,
    areas: infos,
    plan: lastPlan ? toCompactPlan(lastPlan) : null,
    stats: lastPlan ? planStats(lastPlan) : null,
    threads: plan.threads,
    backgroundIndex: dominantBorderColor(q.indices, q.width, q.height),
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
function colorInputs(
  areas: TracedArea[],
  options: Extract<WorkerRequest, { type: 'compute' }>['options'],
  palette: Rgb[],
): ColorPlanInput[] {
  const inputs: ColorPlanInput[] = [];
  for (const color of options.colors) {
    if (color.ignored) continue;
    const own = areas.filter((a) => a.colorIndex === color.index);
    if (own.length === 0) continue;

    const rgb = palette[color.index] ?? { r: 0, g: 0, b: 0 };
    const thread: ThreadColor = {
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      name: color.name,
      catalog: color.catalog,
    };
    inputs.push({
      thread,
      areas: own,
      settings: own.map(
        (a) => options.areaSettings[areas.indexOf(a)] ?? defaultSettingsFor(a.shape),
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
