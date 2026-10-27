/**
 * Darf der Faden von hier nach dort durchgestickt werden?
 *
 * Zwischen zwei Reihen liegt oft nur ein Zehntelmillimeter — da wird
 * durchgestickt. Liegt aber ein Loch oder die Einbuchtung einer U-Form
 * dazwischen, liefe der Faden sichtbar über Stoff, auf dem nichts
 * gestickt wird. Dann muss gesprungen und geschnitten werden.
 */
import { PULL_COMPENSATION_MM } from '../constants.ts';
import { offsetRingInward, pointInShape } from '../geometry/polygon.ts';
import type { Shape } from '../geometry/polygon.ts';
import type { Point } from '../types.ts';

/** Wie viele Zwischenpunkte geprüft werden; mehr kostet nur Rechenzeit. */
const TRAVEL_SAMPLES = 8;

/** Spielraum, damit ein Punkt genau auf der Kante nicht als außen gilt. */
export const TRAVEL_TOLERANCE_MM = 0.1;

/**
 * Die Fläche um `d` vergrößern: außen weiter hinaus, in ein Loch hinein.
 *
 * Das ist genau die Fläche, die die Reihen mit Zugausgleich bedecken —
 * jede Reihe läuft `d` über die Sollkante hinaus, an der Außenkante wie am
 * Lochrand. `offsetRingInward` rechnet dabei in Material: Ein negativer
 * Wert bedeutet mehr Material, bei beiden Ringarten.
 */
export function outsetBy(shape: Shape, d: number): Shape {
  return {
    outer: offsetRingInward(shape.outer, -d),
    holes: shape.holes.map((h) => offsetRingInward(h, -d)),
  };
}

/**
 * Die Fläche, die die Reihen tatsächlich bedecken — einschließlich
 * Zugausgleich und etwas Spielraum. Gegen die Sollkante geprüft würde
 * jeder Reihenwechsel als Austritt gelten.
 */
export function coveredArea(shape: Shape): Shape {
  return outsetBy(shape, PULL_COMPENSATION_MM + TRAVEL_TOLERANCE_MM);
}

/** Liegt die ganze Strecke von `a` nach `b` innerhalb der Fläche? */
export function staysInside(shape: Shape, a: Point, b: Point): boolean {
  for (let i = 1; i < TRAVEL_SAMPLES; i++) {
    const t = i / TRAVEL_SAMPLES;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (!pointInShape(shape, p)) return false;
  }
  return true;
}
