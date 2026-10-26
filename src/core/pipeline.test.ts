/**
 * Die ganze Kette in einem Stück: Bild → Farben → Flächen → Stichplan →
 * EXP. Prüft, dass am Ende eine Datei herauskommt, die ein Decoder ohne
 * unbekannte Befehle liest und deren Maße stimmen.
 */
import { describe, expect, it } from 'vitest';
import { quantize } from '../image/quantize.ts';
import { traceAreas } from '../image/trace.ts';
import { buildPlan, defaultSettingsFor } from './pipeline.ts';
import { exportDesign } from './export.ts';
import { planStats } from './types.ts';
import type { ThreadColor } from './types.ts';

const RING: ThreadColor = { r: 200, g: 60, b: 50, name: 'Rot', catalog: 'Test' };

/** Ring: Außendurchmesser 80 px, Loch 30 px — eine Form, die die konvexe Hülle nicht konnte. */
function donutImage(size = 120) {
  const data = new Uint8ClampedArray(size * size * 4);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const r = Math.hypot(x - c, y - c);
      const inRing = r <= 40 && r >= 15;
      data[i] = inRing ? 200 : 245;
      data[i + 1] = inRing ? 60 : 243;
      data[i + 2] = inRing ? 50 : 238;
      data[i + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

/** Dekodiert eine EXP und zählt mit. */
function decodeExp(bytes: Uint8Array) {
  const s8 = (b: number) => (b > 127 ? b - 256 : b);
  let i = 0;
  let x = 0;
  let y = 0;
  let stitches = 0;
  let jumps = 0;
  let trims = 0;
  let colorChanges = 0;
  let unknown = 0;
  let maxStep = 0;
  const xs: number[] = [];
  const ys: number[] = [];

  while (i < bytes.length) {
    if (bytes[i] === 0x80) {
      const cmd = bytes[i + 1];
      if (cmd === 0x04) {
        x += s8(bytes[i + 2] as number);
        y += s8(bytes[i + 3] as number);
        jumps++;
      } else if (cmd === 0x01) {
        colorChanges++;
      } else if (cmd === 0x80) {
        trims++;
      } else if (cmd === 0x02) {
        x += s8(bytes[i + 2] as number);
        y += s8(bytes[i + 3] as number);
      } else {
        unknown++;
      }
      i += 4;
    } else {
      const dx = s8(bytes[i] as number);
      const dy = s8(bytes[i + 1] as number);
      maxStep = Math.max(maxStep, Math.abs(dx), Math.abs(dy));
      x += dx;
      y += dy;
      stitches++;
      i += 2;
    }
    xs.push(x);
    ys.push(y);
  }

  return {
    stitches,
    jumps,
    trims,
    colorChanges,
    unknown,
    maxStep,
    widthMm: (Math.max(...xs) - Math.min(...xs)) / 10,
    heightMm: (Math.max(...ys) - Math.min(...ys)) / 10,
  };
}

describe('Pipeline von Bild bis EXP', () => {
  const widthMm = 60;
  const { data, width, height } = donutImage();
  const q = quantize(data, width, height, {
    colors: 2,
    ignored: [{ r: 245, g: 243, b: 238 }],
    tolerance: 10,
  });
  const areas = traceAreas(q, { mmPerPixel: widthMm / width });

  it('findet genau eine Fläche, und die hat ein Loch', () => {
    expect(areas).toHaveLength(1);
    expect(areas[0]!.shape.holes).toHaveLength(1);
  });

  it('erzeugt einen Stichplan mit Verriegelung und Schnitt', () => {
    const plan = buildPlan([
      { thread: RING, areas, settings: areas.map((a) => defaultSettingsFor(a.shape)) },
    ]);
    const stats = planStats(plan);
    expect(stats.stitches).toBeGreaterThan(500);
    expect(stats.trims).toBeGreaterThanOrEqual(1);
    expect(plan.threads).toHaveLength(1);
  });

  it('schreibt eine EXP, die sauber dekodiert', () => {
    const plan = buildPlan([
      { thread: RING, areas, settings: areas.map((a) => defaultSettingsFor(a.shape)) },
    ]);
    const files = exportDesign(plan, 'Ring');
    expect(files.map((f) => f.name)).toEqual(['RING.EXP', 'RING.INF', 'RING.BMP']);

    const exp = decodeExp(files[0]!.bytes);
    expect(exp.unknown).toBe(0);
    // Kein Schritt über 12,7 mm — sonst hätte die Zerlegung versagt.
    expect(exp.maxStep).toBeLessThanOrEqual(127);
    // Der Ring ist 80 von 120 px breit, also zwei Drittel von 60 mm.
    expect(exp.widthMm).toBeGreaterThan(36);
    expect(exp.widthMm).toBeLessThan(44);
    expect(exp.heightMm).toBeGreaterThan(36);
    expect(exp.heightMm).toBeLessThan(44);
  });

  it('lässt das Loch des Rings unbestickt', () => {
    const plan = buildPlan([
      { thread: RING, areas, settings: areas.map((a) => defaultSettingsFor(a.shape)) },
    ]);
    const centre = { x: 30, y: 30 };
    // Kein Einstich näher als 5 mm an der Mitte: Das Loch hat 15 px
    // Radius, also rund 7,5 mm.
    const nearest = plan.entries
      .filter((e) => e.kind === 'stitch')
      .reduce((min, e) => Math.min(min, Math.hypot(e.x - centre.x, e.y - centre.y)), Infinity);
    expect(nearest).toBeGreaterThan(5);
  });
});
