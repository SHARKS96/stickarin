/**
 * Standardwerte der App.
 *
 * Grundsatz aus den Anforderungen: Das Ergebnis muss **ohne** jede Einstellung
 * direkt stickbar sein und ein dichtes, deckendes Stickbild ergeben. Diese
 * Werte sind deshalb die Vorgabe, nicht nur ein Startpunkt.
 */

/** Längeneinheit der Maschinenformate: 0,1 mm. */
export const UNIT_MM = 0.1;

/** −127…+127 je Byte, also höchstens 12,7 mm pro Schritt. */
export const MAX_STEP_UNITS = 127;

/** Längster Einzelstich der Deckschicht. */
export const MAX_STITCH_MM = 3.0;

/** Kürzester sinnvoller Stich; alles darunter wird verschluckt. */
export const MIN_STITCH_MM = 0.5;

/**
 * Bis zu dieser Weglänge wird durchgestickt statt gesprungen.
 *
 * Darüber lohnt der Sprung mit Schnitt, darunter kostet er mehr, als er
 * spart: Jeder Schnitt bedeutet Verriegeln und einen Fadenrest. Ein
 * Zentimeter ist die übliche Faustregel; innerhalb einer Fläche liegt der
 * Weg ohnehin unter der Deckschicht und ist nicht zu sehen.
 */
export const TRAVEL_MAX_MM = 10;

/** Reihenabstand des Füllstichs (kleiner = dichter). */
export const FILL_SPACING_MM = 0.4;

/** Versatz der Einstiche von Reihe zu Reihe, als Anteil der Stichlänge. */
export const FILL_STAGGER = 0.25;

/** Zugausgleich je Seite: Stiche ziehen den Stoff zusammen. */
export const PULL_COMPENSATION_MM = 0.2;

/** Verriegelung: so viele Mini-Stiche am Anfang und Ende jedes Fadenstücks. */
export const TIE_STITCH_COUNT = 4;
export const TIE_STITCH_MM = 0.4;

/** Kantenlauf der Füllfläche, so weit innerhalb der Kontur. */
export const FILL_EDGE_INSET_MM = 0.5;

/** Lockere Querunterlage unter der Füllfläche. */
export const UNDERLAY_SPACING_MM = 2.0;

/** 3D-Effekt: zusätzliche Unterlagelagen, enger und abwechselnd gedreht. */
export const RAISED_UNDERLAY_SPACING_MM = 1.0;

/** Satin: Abstand Spitze zu Spitze. */
export const SATIN_SPACING_MM = 0.4;

/** Oberhalb dieser Breite neigt Satin zu losen Schlaufen -> Füllstich. */
export const SATIN_MAX_WIDTH_MM = 10.0;

/** Rahmen der Bernina B 590, in der Reihenfolge des Entwurfs. */
export const HOOPS = [
  { id: 'klein', name: 'Klein', widthMm: 72, heightMm: 50 },
  { id: 'mittel', name: 'Mittel', widthMm: 100, heightMm: 130 },
  { id: 'midi', name: 'Midi', widthMm: 265, heightMm: 165 },
] as const;

export type HoopId = (typeof HOOPS)[number]['id'];

export function hoopById(id: HoopId) {
  return HOOPS.find((h) => h.id === id) ?? HOOPS[2];
}

/**
 * Dichtestufen für die erweiterten Einstellungen. Die Oberfläche zeigt
 * Worte, der Kern rechnet mit Reihenabständen; Stufe 2 ist die Vorgabe.
 */
export const DENSITY_LEVELS = [
  { label: 'Sehr locker', spacingMm: 0.6 },
  { label: 'Locker', spacingMm: 0.5 },
  { label: 'Normal', spacingMm: FILL_SPACING_MM },
  { label: 'Dicht', spacingMm: 0.33 },
  { label: 'Sehr dicht', spacingMm: 0.28 },
] as const;

export const DEFAULT_DENSITY_LEVEL = 2;

/** Größenraster des Plus-Minus-Knopfs. */
export const SIZE_STEP_MM = 5;
export const MIN_SIZE_MM = 20;

/** Vorschaubild für das Maschinendisplay. */
export const BMP_MM_PER_PIXEL = 0.4;
export const BMP_MARGIN_MM = 4.0;
