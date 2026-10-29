/**
 * Der Vektorweg: SVG rein, Flächen und Striche in Millimetern raus.
 *
 * Das Gegenstück zu `image/` — dort wird aus Pixeln geraten, hier steht
 * alles in der Datei. Beide Wege münden in dieselben `TracedArea`, damit
 * `core/` nicht wissen muss, woher ein Motiv kommt.
 */
export { parseSvg } from './svg.ts';
export { planVector, colorCountOf } from './plan.ts';
export { toPreviewSvg, toPreviewUrl } from './preview.ts';
export { EMPTY_DOCUMENT } from './types.ts';
export type { VectorArea, VectorDocument, VectorElement, VectorLine } from './types.ts';
export type { VectorPlan, VectorPlanOptions } from './plan.ts';
