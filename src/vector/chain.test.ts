/**
 * Der Vektorweg in einem Stück: SVG → Farben → Flächen und Striche →
 * Stichplan → Dateitrio.
 *
 * Geprüft wird nicht das Aussehen, sondern dass am Ende eine Datei
 * herauskommt, die die Maschine lesen kann: bekannte Befehle, Schritte
 * innerhalb eines Bytes, Maße so groß wie eingestellt.
 */
import { describe, expect, it } from 'vitest';
import { buildPlan } from '../core/pipeline.ts';
import type { ColorPlanInput } from '../core/pipeline.ts';
import { exportDesign } from '../core/export.ts';
import { planBounds, planStats } from '../core/types.ts';
import type { ThreadColor } from '../core/types.ts';
import { MAX_STEP_UNITS, PULL_COMPENSATION_MM } from '../core/constants.ts';
import { toHex } from '../image/color.ts';
import { planVector } from './plan.ts';
import { parseSvg } from './svg.ts';
import type { VectorPlan } from './plan.ts';

/** Ein Motiv, wie es aus einem Zeichenprogramm kommt: Fläche, Loch, Strich. */
const MOTIV = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">
  <style>.gruen{fill:#2e8b57}</style>
  <g transform="translate(10 10)">
    <path class="gruen" d="M0,0 H100 V60 H0 Z M20,20 H80 V40 H20 Z" fill-rule="evenodd"/>
    <circle cx="50" cy="30" r="8" fill="#ffd700"/>
    <path d="M0,60 Q50,90 100,60" fill="none" stroke="#8b0000" stroke-width="3"/>
  </g>
</svg>`;

/** Baut aus einem Vektorplan die Farbliste für `buildPlan`. */
function colorInputs(plan: VectorPlan): ColorPlanInput[] {
  return plan.palette.map((rgb, index): ColorPlanInput => {
    const thread: ThreadColor = { ...rgb, name: `Garn ${index + 1}`, catalog: 'Test' };
    return {
      thread,
      areas: plan.areas.filter((a) => a.colorIndex === index),
      lines: plan.lines.filter((l) => l.colorIndex === index),
    };
  });
}

/** Dekodiert eine EXP und zählt mit. */
function decodeExp(bytes: Uint8Array) {
  const s8 = (b: number) => (b > 127 ? b - 256 : b);
  let i = 0;
  let stitches = 0;
  let colorChanges = 0;
  let unknown = 0;
  let maxStep = 0;
  while (i < bytes.length) {
    if (bytes[i] === 0x80) {
      const cmd = bytes[i + 1];
      if (cmd === 0x01) colorChanges++;
      else if (cmd !== 0x04 && cmd !== 0x80 && cmd !== 0x02) unknown++;
      i += 4;
    } else {
      maxStep = Math.max(
        maxStep,
        Math.abs(s8(bytes[i] as number)),
        Math.abs(s8(bytes[i + 1] as number)),
      );
      stitches++;
      i += 2;
    }
  }
  return { stitches, colorChanges, unknown, maxStep };
}

describe('SVG bis zur Stickdatei', () => {
  const doc = parseSvg(MOTIV);
  const plan = planVector(doc, { widthMm: 100 });

  it('liest alle drei Farben der Datei', () => {
    expect(doc.warnings).toEqual([]);
    expect(plan.palette.map(toHex)).toEqual(['#2e8b57', '#ffd700', '#8b0000']);
  });

  it('erkennt Loch, Insel und Strich', () => {
    const gruen = plan.areas.filter((a) => a.colorIndex === 0);
    expect(gruen).toHaveLength(1);
    expect(gruen[0]?.shape.holes).toHaveLength(1);

    // Der gelbe Kreis liegt im Loch und ist eine eigene Fläche.
    expect(plan.areas.filter((a) => a.colorIndex === 1)).toHaveLength(1);
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0]?.colorIndex).toBe(2);
  });

  it('hält die eingestellte Breite ein', () => {
    const bounds = planBounds(buildPlan(colorInputs(plan)));
    // Gemessen werden Einstichstellen. Der Motivkasten rechnet bei jedem
    // Strich die halbe Breite dazu, darum bleiben die Einstiche ein wenig
    // innerhalb der eingestellten Breite — nie darüber.
    expect(bounds.maxX - bounds.minX).toBeLessThanOrEqual(100 + 1e-6);
    expect(bounds.maxX - bounds.minX).toBeGreaterThan(96);

    // Die Höhe folgt dem Seitenverhältnis des Motivs. Etwas darüber darf
    // sie liegen: Der Satinstich rechnet den Zugausgleich nach außen.
    const erwartet = 100 * (doc.height / doc.width);
    expect(bounds.maxY - bounds.minY).toBeLessThanOrEqual(
      erwartet + 2 * PULL_COMPENSATION_MM + 1e-6,
    );
    expect(bounds.maxY - bounds.minY).toBeGreaterThan(erwartet - 1);
  });

  it('macht daraus einen Plan mit drei Garnen', () => {
    const stitchPlan = buildPlan(colorInputs(plan));
    const stats = planStats(stitchPlan);
    expect(stitchPlan.threads).toHaveLength(3);
    expect(stats.colorChanges).toBe(2);
    expect(stats.stitches).toBeGreaterThan(500);
  });

  it('schreibt ein Dateitrio, das ein Decoder ohne Rätsel liest', () => {
    const files = exportDesign(buildPlan(colorInputs(plan)), 'Vektor');
    expect(files.map((f) => f.name)).toEqual(['VEKTOR.EXP', 'VEKTOR.INF', 'VEKTOR.BMP']);

    const exp = decodeExp(files[0]?.bytes as Uint8Array);
    expect(exp.unknown).toBe(0);
    expect(exp.colorChanges).toBe(2);
    expect(exp.maxStep).toBeLessThanOrEqual(MAX_STEP_UNITS);
    expect(exp.stitches).toBeGreaterThan(500);
  });

  it('stickt den Strich nach der Fläche derselben Farbe', () => {
    // Umriss und Füllung in einer Farbe: Der Umriss gehört obenauf.
    const beides = parseSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">' +
        '<rect x="5" y="5" width="40" height="40" fill="#123456" stroke="#123456" stroke-width="2"/>' +
        '</svg>',
    );
    const vector = planVector(beides, { widthMm: 60 });
    expect(vector.palette).toHaveLength(1);
    expect(vector.areas).toHaveLength(1);
    expect(vector.lines).toHaveLength(1);

    const stitchPlan = buildPlan(colorInputs(vector));
    expect(stitchPlan.threads).toHaveLength(1);
    expect(planStats(stitchPlan).colorChanges).toBe(0);
  });

  it('kommt mit einer reinen Strichzeichnung zurecht', () => {
    const strich = parseSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">' +
        '<path d="M5,25 C5,5 45,5 45,25" fill="none" stroke="#000000" stroke-width="0.4"/>' +
        '</svg>',
    );
    const vector = planVector(strich, { widthMm: 80 });
    expect(vector.areas).toHaveLength(0);
    expect(vector.lines).toHaveLength(1);

    const stats = planStats(buildPlan(colorInputs(vector)));
    expect(stats.stitches).toBeGreaterThan(10);
    // Der Steppstich sitzt auf dem Pfad; die halbe Strichbreite ringsum
    // gehört zum Motiv, aber nicht zu den Einstichen.
    expect(stats.widthMm).toBeLessThanOrEqual(80 + 1e-6);
    expect(stats.widthMm).toBeGreaterThan(78);
  });
});
