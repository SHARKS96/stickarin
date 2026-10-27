/**
 * Garnfarben zur Auswahl.
 *
 * Die App leitet die Garnfarbe aus dem Bild ab — das stimmt meistens, aber
 * nicht immer. Bei einem Negativ-Motiv etwa: Ist der schwarze Hintergrund
 * weggelassen, bleibt das weiße Motiv übrig, und gestickt würde es in Weiß
 * auf weißem Stoff.
 *
 * Darum eine Handvoll benannter Farben. Der Name ist nicht nur Zierde: Er
 * landet in der .INF und steht beim Umfädeln im Display der Maschine.
 */
import type { Rgb } from '../image/color.ts';

export interface ThreadChoice {
  name: string;
  rgb: Rgb;
}

const of = (name: string, hex: string): ThreadChoice => ({
  name,
  rgb: {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  },
});

/** Von hell nach dunkel, dann die bunten — so wie ein Garnschrank sortiert ist. */
export const THREAD_PALETTE: ThreadChoice[] = [
  of('Weiß', '#ffffff'),
  of('Creme', '#f2e8d5'),
  of('Beige', '#d9bc94'),
  of('Hellgrau', '#c8c8cc'),
  of('Grau', '#8a8a8e'),
  of('Anthrazit', '#4a4a4f'),
  of('Schwarz', '#1c1c1e'),
  of('Braun', '#7a4a28'),
  of('Rot', '#d0021b'),
  of('Dunkelrot', '#8b1a1a'),
  of('Pink', '#d81b74'),
  of('Orange', '#f07000'),
  of('Gelb', '#f5c518'),
  of('Hellgrün', '#7cb342'),
  of('Grün', '#2e7d32'),
  of('Türkis', '#00a0a8'),
  of('Hellblau', '#4a90d9'),
  of('Blau', '#1552b0'),
  of('Dunkelblau', '#152c5b'),
  of('Violett', '#7b3fa0'),
];
