/**
 * Was aus einer SVG-Datei übrig bleibt, wenn man sie zum Sticken liest.
 *
 * Ein SVG kennt Farbverläufe, Schrift, Filter und Transparenz — die
 * Maschine kennt Flächen und Striche in genau einer Garnfarbe. Diese
 * Datenstruktur ist das Ergebnis dieser Übersetzung: zwei Arten von
 * Elementen in Zeichenreihenfolge, dazu eine Liste dessen, was dabei
 * unter den Tisch gefallen ist.
 *
 * Koordinaten sind **Nutzereinheiten des viewBox**, Y nach unten — noch
 * keine Millimeter. Erst `planVector` streckt sie auf die gewählte Größe,
 * denn die kann der Nutzer jederzeit ändern, ohne dass die Datei neu
 * gelesen werden müsste.
 *
 * Alles hier ist aus einfachen Objekten gebaut: Der Entwurf geht als
 * Nachricht in den Worker und als Datensatz in die IndexedDB.
 */
import type { Shape } from '../core/geometry/polygon.ts';
import type { Point } from '../core/types.ts';
import type { Rgb } from '../image/color.ts';

/** Eine gefüllte Fläche: äußerer Ring plus Löcher, in einer Farbe. */
export interface VectorArea {
  kind: 'area';
  color: Rgb;
  shape: Shape;
}

/**
 * Ein Strich.
 *
 * Bleibt ein Pfad und wird nicht zur Fläche: Ein Haar dünner Strich als
 * Fläche gefüllt ergibt eine Reihe Einzelstiche, als Steppstich entlang
 * des Pfades dagegen eine saubere Linie.
 */
export interface VectorLine {
  kind: 'line';
  color: Rgb;
  /** Der Pfad selbst; bei `closed` wird der letzte Punkt nicht wiederholt. */
  path: Point[];
  closed: boolean;
  /** Strichbreite in Nutzereinheiten. */
  width: number;
}

export type VectorElement = VectorArea | VectorLine;

/**
 * Eine gelesene Zeichnung.
 *
 * `width`/`height` sind die Maße des **Inhalts**, nicht die des viewBox:
 * Wer 8 cm einstellt, will ein 8 cm breites Motiv und nicht 8 cm Rand mit
 * einem Punkt in der Mitte. Die Elemente sind entsprechend verschoben, ihre
 * linke obere Ecke liegt auf (0, 0).
 */
export interface VectorDocument {
  width: number;
  height: number;
  elements: VectorElement[];
  /** Was nicht gestickt werden kann — wird dem Nutzer gezeigt. */
  warnings: string[];
}

export const EMPTY_DOCUMENT: VectorDocument = {
  width: 0,
  height: 0,
  elements: [],
  warnings: [],
};
