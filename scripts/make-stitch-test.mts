/**
 * Erzeugt eine Testdatei zum Probesticken.
 *
 * Vier Felder nebeneinander, dieselben wie in TEST2 vom 26.10.2026, damit
 * sich das Ergebnis Feld für Feld mit dem vorigen Ausdruck vergleichen lässt:
 *
 *   1  Füllstich Standard        2  Füllstich dicht
 *   3  Füllstich Standard + 3D   4  Satinsäule 5 mm
 *
 * Aufruf: npx vite-node scripts/make-stitch-test.mts -- <Zielordner> [Name]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPlan } from '../src/core/pipeline.ts';
import type { AreaSettings } from '../src/core/pipeline.ts';
import { exportDesign } from '../src/core/export.ts';
import { planStats } from '../src/core/types.ts';
import { DENSITY_LEVELS } from '../src/core/constants.ts';
import type { Shape } from '../src/core/geometry/polygon.ts';
import type { TracedArea } from '../src/image/trace.ts';

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

/** Schmale Säule für das Satin-Feld. */
function column(index: number, widthMm: number): Shape {
  const x = index * (FIELD_MM + GAP_MM) + (FIELD_MM - widthMm) / 2;
  return {
    outer: [
      { x, y: 0 },
      { x: x + widthMm, y: 0 },
      { x: x + widthMm, y: FIELD_MM },
      { x, y: FIELD_MM },
    ],
    holes: [],
  };
}

const spacingOf = (label: string) =>
  (DENSITY_LEVELS.find((l) => l.label === label) ?? DENSITY_LEVELS[2]).spacingMm;

const fields: { shape: Shape; settings: AreaSettings; was: string }[] = [
  {
    shape: field(0),
    settings: { stitchType: 'fill', spacing: spacingOf('Normal'), angle: 0, raisedLayers: 0 },
    was: `Füllstich Standard (${spacingOf('Normal')} mm)`,
  },
  {
    shape: field(1),
    settings: { stitchType: 'fill', spacing: spacingOf('Dicht'), angle: 0, raisedLayers: 0 },
    was: `Füllstich dicht (${spacingOf('Dicht')} mm)`,
  },
  {
    shape: field(2),
    settings: { stitchType: 'fill', spacing: spacingOf('Normal'), angle: 0, raisedLayers: 2 },
    was: 'Füllstich Standard + 3D (2 Zusatzlagen)',
  },
  {
    shape: column(3, 5),
    settings: { stitchType: 'satin', spacing: spacingOf('Normal'), angle: 0, raisedLayers: 0 },
    was: 'Satinsäule 5 mm',
  },
];

const areas: TracedArea[] = fields.map((f) => ({
  colorIndex: 0,
  shape: f.shape,
  areaMm2: FIELD_MM * FIELD_MM,
}));

const plan = buildPlan([
  {
    thread: { r: 200, g: 30, b: 45, name: 'Rot', catalog: 'Stickarin' },
    areas,
    settings: fields.map((f) => f.settings),
  },
]);

const outDir = process.argv[2];
if (!outDir) throw new Error('Zielordner fehlt.');
const name = process.argv[3] ?? 'TEST3';
mkdirSync(outDir, { recursive: true });

for (const file of exportDesign(plan, name)) {
  writeFileSync(join(outDir, file.name), file.bytes);
  console.log(`${file.name.padEnd(12)} ${String(file.bytes.length).padStart(7)} Bytes`);
}

const stats = planStats(plan);
console.log('');
fields.forEach((f, i) => console.log(`  Feld ${i + 1}: ${f.was}`));
console.log('');
console.log(
  `  ${stats.stitches} Stiche · ${stats.trims} Schnitte · ${stats.jumps} Sprünge · ` +
    `${stats.widthMm.toFixed(1)} × ${stats.heightMm.toFixed(1)} mm`,
);
