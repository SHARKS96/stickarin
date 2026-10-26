/**
 * Das Dateitrio für die Bernina: gleicher Name, drei Endungen.
 * Ohne .INF zeigt die Maschine Standardfarben, ohne .BMP kein Vorschaubild.
 */
import { writeBmp, writeExp, writeInf } from './format/index.ts';
import type { StitchPlan } from './types.ts';

export interface ExportedFile {
  name: string;
  /** Passender MIME-Typ für den Download. */
  type: string;
  bytes: Uint8Array;
}

/**
 * Erzeugt EXP, INF und BMP. Der Dateiname wird auf das beschränkt, was
 * Stickmaschinen sicher lesen: Großbuchstaben, Ziffern, Unterstrich.
 */
export function exportDesign(plan: StitchPlan, rawName: string): ExportedFile[] {
  const name = sanitizeName(rawName);
  return [
    { name: `${name}.EXP`, type: 'application/octet-stream', bytes: writeExp(plan) },
    { name: `${name}.INF`, type: 'application/octet-stream', bytes: writeInf(plan.threads) },
    { name: `${name}.BMP`, type: 'image/bmp', bytes: writeBmp(plan) },
  ];
}

export function sanitizeName(raw: string): string {
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[ÄÖÜß]/g, (c) => ({ Ä: 'AE', Ö: 'OE', Ü: 'UE', ß: 'SS' })[c] ?? c)
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 16);
  return cleaned || 'STICK';
}
