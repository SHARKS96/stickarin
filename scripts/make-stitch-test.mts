/**
 * Erzeugt eine Testdatei zum Probesticken.
 *
 * TEST4 ist ein kontrollierter Versuch, kein Dichtevergleich. Die Frage,
 * die er beantworten soll: TEST3 hatte dieselbe Dichte wie TEST2 (gemessen
 * ±3 %) und sah auf dem Stoff trotzdem schlechter aus. Woran liegt das?
 *
 * Dafür unterscheidet sich jedes Feld vom Standard in **genau einer**
 * Sache, und der Standard wird zweimal gestickt — am Anfang und am Ende.
 * Die Differenz zwischen Feld 1 und Feld 6 ist der Fehler des Versuchs
 * selbst: Stoffspannung, Vlies und Fadenspannung ändern sich über eine
 * Stickung hinweg, und ohne dieses Maß lässt sich kein anderer
 * Unterschied einordnen.
 *
 *   1  Referenz A              4  ohne Unterlage
 *   2  ohne Abschlusskontur    5  dichter (0,33 mm)
 *   3  ohne Zugausgleich       6  Referenz B (wie 1, zuletzt)
 *
 * Aufruf: npx vite-node scripts/make-stitch-test.mts -- <Zielordner> [Name]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DENSITY_LEVELS, PULL_COMPENSATION_MM } from '../src/core/constants.ts';
import { exportDesign } from '../src/core/export.ts';
import type { Shape } from '../src/core/geometry/polygon.ts';
import { shapeBounds } from '../src/core/geometry/polygon.ts';
import { StitchBuilder } from '../src/core/stitch/builder.ts';
import { fillArea } from '../src/core/stitch/fill.ts';
import type { FillOptions } from '../src/core/stitch/fill.ts';
import { planStats } from '../src/core/types.ts';
import type { Point, StitchPlan } from '../src/core/types.ts';

const FIELD_MM = 12;
const GAP_MM = 3;

/** Quadrat an der Position `index`, von links. */
function field(index: number): Shape {
  const x = index * (FIELD_MM + GAP_MM);
  return {
    outer: [
      { x, y: 0 },
      { x: x + FIELD_MM, y: 0 },
      { x: x + FIELD_MM, y: FIELD_MM },
      { x, y: FIELD_MM },
    ],
    holes: [],
  };
}

const spacingOf = (label: string) =>
  (DENSITY_LEVELS.find((l) => l.label === label) ?? DENSITY_LEVELS[2]).spacingMm;

const NORMAL = spacingOf('Normal');
const DICHT = spacingOf('Dicht');

/** Der Standard, von dem jedes andere Feld um genau eine Sache abweicht. */
const STANDARD: FillOptions = {
  spacing: NORMAL,
  angle: 0,
  raisedLayers: 0,
  underlay: true,
  closingContour: true,
  pullCompensation: PULL_COMPENSATION_MM,
};

const fields: { options: FillOptions; was: string; prueft: string }[] = [
  {
    options: STANDARD,
    was: `Referenz A — Standard (${NORMAL} mm)`,
    prueft: 'der Vergleichspunkt für alles Übrige',
  },
  {
    options: { ...STANDARD, closingContour: false },
    was: 'ohne Abschlusskontur',
    prueft: 'ob die Kontur den Rand beruhigt oder die Fläche stört',
  },
  {
    options: { ...STANDARD, pullCompensation: 0 },
    was: 'ohne Zugausgleich (0 mm statt 0,2 mm)',
    prueft: 'ob die um 0,2 mm verlängerten Reihen die Kante öffnen',
  },
  {
    options: { ...STANDARD, underlay: false },
    was: 'ohne Unterlage (nur Deckschicht)',
    prueft: 'wie viel die Unterlage zur Deckung beiträgt',
  },
  {
    options: { ...STANDARD, spacing: DICHT },
    was: `dichter (${DICHT} mm statt ${NORMAL} mm)`,
    prueft: 'ob mehr Dichte den Eindruck überhaupt ändert',
  },
  {
    options: STANDARD,
    was: 'Referenz B — wie Feld 1, zuletzt gestickt',
    prueft: 'der Fehler des Versuchs: Drift über die Stickung hinweg',
  },
];

/** Mitte einer Fläche — dorthin wird gesprungen, wie es `buildPlan` tut. */
function centroid(shape: Shape): Point {
  const b = shapeBounds(shape);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

const builder = new StitchBuilder();
fields.forEach((f, i) => {
  const shape = field(i);
  // Zwischen den Feldern liegen 3 mm Stoff: springen und schneiden, genau
  // wie der Stichplan es bei weit auseinanderliegenden Flächen macht.
  builder.moveTo(centroid(shape));
  fillArea(builder, shape, f.options);
});

const plan: StitchPlan = {
  entries: builder.finish(),
  threads: [{ r: 200, g: 30, b: 45, name: 'Rot', catalog: 'Stickarin' }],
};

const outDir = process.argv[2];
if (!outDir) throw new Error('Zielordner fehlt.');
const name = process.argv[3] ?? 'TEST4';
mkdirSync(outDir, { recursive: true });

for (const file of exportDesign(plan, name)) {
  writeFileSync(join(outDir, file.name), file.bytes);
  console.log(`${file.name.padEnd(12)} ${String(file.bytes.length).padStart(7)} Bytes`);
}

const stats = planStats(plan);
console.log('');
fields.forEach((f, i) => console.log(`  Feld ${i + 1}: ${f.was}\n            ${f.prueft}`));
console.log('');
console.log(
  `  ${stats.stitches} Stiche · ${stats.trims} Schnitte · ${stats.jumps} Sprünge · ` +
    `${stats.widthMm.toFixed(1)} × ${stats.heightMm.toFixed(1)} mm`,
);
