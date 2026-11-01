/**
 * Erzeugt eine Testdatei zum Probesticken.
 *
 * TEST5 prüft die beiden Punkte, die der Vergleich mit einer
 * professionell digitalisierten Datei (Lady_10, 28 000 Stiche) offen
 * gelassen hat.
 *
 * **Garnmenge.** Im Inneren einer Fläche liegen dort 5,50 mm Garn je mm²,
 * bei uns waren es 3,00. Die Satindichte ist dabei dieselbe (0,42 gegen
 * 0,40 mm) — der Unterschied steckt allein in der Zahl der Lagen. Die
 * Felder 1 bis 3 fahren drei Stufen ab: alte Unterlage, neue Unterlage,
 * neue Unterlage plus Zusatzlagen.
 *
 * **Satin.** Die Sprossen folgen jetzt einer Mittellinie und drehen mit
 * der Form mit. Feld 4 zeigt das an einer geraden, Feld 5 an einer
 * gebogenen Säule — gerade sollte sauber sein, gebogen ist der Fall, für
 * den der Umbau gemacht wurde.
 *
 * Wie bei TEST4 weicht jedes Feld in genau einer Sache ab, und der
 * Standard steht zweimal darin: Feld 1 am Anfang, Feld 6 am Ende. Ihre
 * Differenz auf dem Stoff ist der Fehler des Versuchs selbst.
 *
 * Aufruf: npx vite-node scripts/make-stitch-test.mts -- <Zielordner> [Name]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DENSITY_LEVELS, UNDERLAY_SPACING_MM } from '../src/core/constants.ts';
import { exportDesign } from '../src/core/export.ts';
import { normalizeShape, shapeBounds } from '../src/core/geometry/polygon.ts';
import type { Shape } from '../src/core/geometry/polygon.ts';
import { StitchBuilder } from '../src/core/stitch/builder.ts';
import { fillArea } from '../src/core/stitch/fill.ts';
import type { FillOptions } from '../src/core/stitch/fill.ts';
import { satinArea } from '../src/core/stitch/satin.ts';
import { planStats } from '../src/core/types.ts';
import type { Point, StitchPlan } from '../src/core/types.ts';

const FIELD_MM = 12;
const GAP_MM = 3;
const NORMAL = (DENSITY_LEVELS.find((l) => l.label === 'Normal') ?? DENSITY_LEVELS[2]).spacingMm;

/** Linke Kante des Feldes `index`. */
const left = (index: number) => index * (FIELD_MM + GAP_MM);

function square(index: number): Shape {
  const x = left(index);
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

/** Gerade Säule, mittig im Feld. */
function column(index: number, widthMm: number): Shape {
  const x = left(index) + (FIELD_MM - widthMm) / 2;
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

/** Viertelkreis fester Breite — die Form, für die der Satin umgebaut wurde. */
function arc(index: number, widthMm: number): Shape {
  const r = 7;
  const cx = left(index) + 1;
  const outer: Point[] = [];
  const inner: Point[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * (Math.PI / 2);
    outer.push({ x: cx + Math.cos(t) * (r + widthMm / 2), y: Math.sin(t) * (r + widthMm / 2) });
    inner.push({ x: cx + Math.cos(t) * (r - widthMm / 2), y: Math.sin(t) * (r - widthMm / 2) });
  }
  return normalizeShape({ outer: [...outer, ...inner.reverse()], holes: [] });
}

type Feld = { shape: Shape; was: string; prueft: string; fill?: FillOptions; satin?: true };

const STANDARD: FillOptions = { spacing: NORMAL, angle: 0, raisedLayers: 0 };

const fields: Feld[] = [
  {
    shape: square(0),
    fill: STANDARD,
    was: `Referenz A — neuer Standard (Unterlage ${UNDERLAY_SPACING_MM} mm)`,
    prueft: 'der Vergleichspunkt für alles Übrige',
  },
  {
    shape: square(1),
    fill: { ...STANDARD, underlaySpacing: 2.0 },
    was: 'Unterlage 2,0 mm — der bisherige Wert',
    prueft: 'was die dichtere Unterlage überhaupt bringt',
  },
  {
    shape: square(2),
    fill: { ...STANDARD, raisedLayers: 2 },
    was: 'Unterlage 1,0 mm + zwei Zusatzlagen',
    prueft: 'die Garnmenge der Referenz (rechnerisch ~5 mm/mm²)',
  },
  {
    shape: column(3, 4),
    satin: true,
    was: 'Satin, gerade Säule 4 mm',
    prueft: 'der einfache Fall — muss sauber sein',
  },
  {
    shape: arc(4, 4),
    satin: true,
    was: 'Satin, gebogene Säule 4 mm',
    prueft: 'die Sprossen drehen mit der Form mit',
  },
  {
    shape: square(5),
    fill: STANDARD,
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
for (const f of fields) {
  // Zwischen den Feldern liegt Stoff: springen und schneiden, genau wie
  // der Stichplan es bei weit auseinanderliegenden Flächen macht.
  builder.moveTo(centroid(f.shape));
  if (f.satin) satinArea(builder, f.shape);
  else fillArea(builder, f.shape, f.fill);
}

const plan: StitchPlan = {
  entries: builder.finish(),
  threads: [{ r: 200, g: 30, b: 45, name: 'Rot', catalog: 'Stickarin' }],
};

const outDir = process.argv[2];
if (!outDir) throw new Error('Zielordner fehlt.');
const name = process.argv[3] ?? 'TEST5';
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
