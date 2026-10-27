/**
 * Typen für `stickcore.mjs`.
 *
 * Die Referenz bleibt unverändertes JavaScript; die Typen stehen daneben,
 * damit die Vergleichstests sie typgeprüft aufrufen können.
 *
 * Alle Längen sind 0,1-mm-Einheiten, Punkte sind `[x, y]`.
 */

export type Pt = [number, number];

export type Cmd =
  | { t: 'stitch'; x: number; y: number }
  | { t: 'jump'; x: number; y: number }
  | { t: 'trim' }
  | { t: 'color' };

export interface Thread {
  rgb: [number, number, number];
  name: string;
  chart: string;
}

export function inset(poly: Pt[], d: number): Pt[];

export class Plan {
  cmds: Cmd[];
  pos: Pt | null;
  dir: Pt;
  stitchTo(p: Pt, maxLen?: number): void;
  jumpTo(p: Pt): void;
  trim(): void;
  color(): void;
  sew(path: Pt[], maxLen?: number): void;
}

export function tatami(
  poly: Pt[],
  options?: {
    spacing?: number;
    len?: number;
    angle?: number;
    pull?: number;
    stagger?: number;
  },
): Pt[];

export function contour(poly: Pt[]): Pt[];

export function fillArea(
  poly: Pt[],
  options?: { density?: number; angle?: number; raised?: number },
): Pt[];

export function satin(
  railA: [Pt, Pt],
  railB: [Pt, Pt],
  options?: { spacing?: number; pull?: number },
): Pt[];

export function writeEXP(cmds: Cmd[]): Uint8Array;
export function writeINF(threads: Thread[]): Uint8Array;
export function writeBMP(
  cmds: Cmd[],
  threads: Thread[],
  scale?: number,
  margin?: number,
): Uint8Array;
