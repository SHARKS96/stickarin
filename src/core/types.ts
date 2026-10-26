/**
 * Datenmodell des Stichkerns.
 *
 * Koordinaten sind durchgehend Millimeter mit **Y nach unten** (Bild- und
 * SVG-Konvention). Erst die EXP-Ausgabe dreht Y um, weil die Maschine
 * Y nach oben zählt.
 */

/** Ein Punkt in Millimetern, Y nach unten. */
export interface Point {
  x: number;
  y: number;
}

/** Was die Maschine an dieser Stelle tut. */
export type StitchKind =
  /** Fahren und einstechen. */
  | 'stitch'
  /** Fahren ohne Einstich; hinterlässt einen losen Faden. */
  | 'jump'
  /** Fadenabschneider. */
  | 'trim'
  /** Maschine hält an, Garn wird gewechselt. */
  | 'colorChange';

/** Ein Eintrag im Stichplan. Bei `trim` und `colorChange` zählen x/y nicht. */
export interface PlanEntry {
  kind: StitchKind;
  x: number;
  y: number;
}

/** Eine Garnfarbe, so wie sie in der .INF landet. */
export interface ThreadColor {
  r: number;
  g: number;
  b: number;
  /** z. B. "Isacord 1902". Landet im Maschinendisplay. */
  name: string;
  /** z. B. "Isacord". */
  catalog: string;
}

/**
 * Das fertige Ergebnis: Stichfolge plus Garnliste. Die Reihenfolge der
 * Farben entspricht der Reihenfolge der Farbwechsel in der Stichfolge.
 */
export interface StitchPlan {
  entries: PlanEntry[];
  threads: ThreadColor[];
}

/** Achsenparalleles Rechteck in Millimetern. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Bounding-Box über alle einstechenden und anfahrenden Punkte. */
export function planBounds(plan: StitchPlan): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const e of plan.entries) {
    if (e.kind === 'trim' || e.kind === 'colorChange') continue;
    if (e.x < minX) minX = e.x;
    if (e.y < minY) minY = e.y;
    if (e.x > maxX) maxX = e.x;
    if (e.y > maxY) maxY = e.y;
  }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/** Kennzahlen für die Anzeige im Frontend. */
export interface PlanStats {
  stitches: number;
  jumps: number;
  trims: number;
  colorChanges: number;
  widthMm: number;
  heightMm: number;
}

export function planStats(plan: StitchPlan): PlanStats {
  let stitches = 0;
  let jumps = 0;
  let trims = 0;
  let colorChanges = 0;
  for (const e of plan.entries) {
    if (e.kind === 'stitch') stitches++;
    else if (e.kind === 'jump') jumps++;
    else if (e.kind === 'trim') trims++;
    else colorChanges++;
  }
  const b = planBounds(plan);
  return {
    stitches,
    jumps,
    trims,
    colorChanges,
    widthMm: b.maxX - b.minX,
    heightMm: b.maxY - b.minY,
  };
}
