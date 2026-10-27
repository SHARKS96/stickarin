/**
 * Farbreduktion: aus einem Pixelbild werden N Stickfarben.
 *
 * k-Means im Lab-Raum, mit k-Means++ als Startbelegung. Die Pipette setzt
 * feste Startfarben, der Toleranzregler bestimmt, wie weit ein Pixel von
 * seiner Farbe entfernt sein darf, und eine Ignorieren-Farbe schneidet den
 * Hintergrund weg.
 */
import { labDistance, rgbToLab } from './color.ts';
import type { Lab, Rgb } from './color.ts';

export interface QuantizeOptions {
  /** Anzahl Stickfarben. */
  colors: number;
  /** Von der Pipette gesetzte Farben; werden als Zentren festgehalten. */
  pinned?: Rgb[];
  /** Farben, die als Hintergrund wegfallen. */
  ignored?: Rgb[];
  /** Maximaler Lab-Abstand zu einer Ignorieren-Farbe, ab dem ein Pixel bleibt. */
  tolerance?: number;
  /** Iterationen des k-Means. */
  iterations?: number;
}

export interface QuantizeResult {
  /** Ein Index je Pixel; -1 bedeutet "ignoriert". */
  indices: Int16Array;
  palette: Rgb[];
  width: number;
  height: number;
  /** Pixelzahl je Palettenfarbe. */
  counts: number[];
}

export function quantize(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: QuantizeOptions,
): QuantizeResult {
  const { colors, pinned = [], ignored = [], tolerance = 12, iterations = 8 } = options;
  const pixelCount = width * height;

  // Pixel einlesen, Transparentes und Ignoriertes aussortieren.
  const labs: (Lab | null)[] = new Array(pixelCount).fill(null);
  const rgbs: (Rgb | null)[] = new Array(pixelCount).fill(null);
  const ignoredLabs = ignored.map(rgbToLab);

  for (let i = 0; i < pixelCount; i++) {
    const alpha = data[i * 4 + 3] as number;
    if (alpha < 128) continue;
    const rgb: Rgb = {
      r: data[i * 4] as number,
      g: data[i * 4 + 1] as number,
      b: data[i * 4 + 2] as number,
    };
    const lab = rgbToLab(rgb);
    if (ignoredLabs.some((ig) => labDistance(lab, ig) <= tolerance)) continue;
    labs[i] = lab;
    rgbs[i] = rgb;
  }

  const active: number[] = [];
  for (let i = 0; i < pixelCount; i++) if (labs[i]) active.push(i);

  const indices = new Int16Array(pixelCount).fill(-1);
  if (active.length === 0) return { indices, palette: [], width, height, counts: [] };

  // Startzentren: erst die gepinnten Farben, dann k-Means++ für den Rest.
  // Median-Cut taugt hier nicht: Bei einem dominanten Hintergrund landen
  // mehrere Startzentren in derselben Ecke, und zwei echte Motivfarben
  // teilen sich am Ende ein Zentrum.
  const pinnedLabs = pinned.slice(0, colors).map(rgbToLab);
  const sample = sampleLabs(active, labs, 20000);
  const centers: Lab[] = [
    ...pinnedLabs,
    ...kmeansPlusPlus(sample, Math.max(0, colors - pinnedLabs.length), pinnedLabs),
  ];
  if (centers.length === 0) centers.push(labs[active[0] as number] as Lab);

  const pinnedCount = pinnedLabs.length;

  for (let iter = 0; iter < iterations; iter++) {
    const sums = centers.map(() => ({ l: 0, a: 0, b: 0, n: 0 }));
    for (const i of active) {
      const lab = labs[i] as Lab;
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = labDistance(lab, centers[c] as Lab);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      indices[i] = best;
      const s = sums[best] as { l: number; a: number; b: number; n: number };
      s.l += lab.l;
      s.a += lab.a;
      s.b += lab.b;
      s.n++;
    }
    // Gepinnte Farben bleiben, wo die Pipette sie gesetzt hat.
    for (let c = pinnedCount; c < centers.length; c++) {
      const s = sums[c] as { l: number; a: number; b: number; n: number };
      if (s.n > 0) {
        centers[c] = { l: s.l / s.n, a: s.a / s.n, b: s.b / s.n };
        continue;
      }
      // Leeres Zentrum dorthin setzen, wo die Zuordnung am schlechtesten
      // passt. Sonst liefert die App weniger Farben als eingestellt.
      const far = farthestFrom(sample, centers);
      if (far) centers[c] = far;
    }
  }

  // Abschliessende Zuordnung mit den endgueltigen Zentren: Ohne sie waere
  // ein in der letzten Runde neu besetztes Zentrum leer und wuerde aus der
  // Palette fallen.
  for (const i of active) {
    const lab = labs[i] as Lab;
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < centers.length; c++) {
      const d = labDistance(lab, centers[c] as Lab);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    indices[i] = best;
  }

  // Paletteneintrag = Mittelwert der zugeordneten Original-RGB-Werte.
  const acc = centers.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
  for (const i of active) {
    const c = indices[i] as number;
    const rgb = rgbs[i] as Rgb;
    const a = acc[c] as { r: number; g: number; b: number; n: number };
    a.r += rgb.r;
    a.g += rgb.g;
    a.b += rgb.b;
    a.n++;
  }

  // Die Reihenfolge der Zentren ist ein Zufallsprodukt des k-Means: Sie
  // hängt daran, welches Pixel die Stichprobe zuerst erwischt hat. Würde
  // sie durchgereicht, stünde die Farbliste nach jeder Rechnung anders da.
  // Darum: größte Fläche zuerst, bei Gleichstand die hellere.
  const found = acc
    .map((a, c) => ({
      center: c,
      count: a.n,
      rgb: { r: Math.round(a.r / a.n), g: Math.round(a.g / a.n), b: Math.round(a.b / a.n) },
    }))
    .filter((e) => e.count > 0)
    .sort((x, y) => y.count - x.count || lightness(y.rgb) - lightness(x.rgb));

  const palette: Rgb[] = found.map((e) => e.rgb);
  const counts: number[] = found.map((e) => e.count);
  const remap = new Int16Array(centers.length).fill(-1);
  found.forEach((e, position) => {
    remap[e.center] = position;
  });
  for (const i of active) indices[i] = remap[indices[i] as number] as number;

  return { indices, palette, width, height, counts };
}

/** Nur für die Sortierung: ein Helligkeitswert, der Gleichstände eindeutig macht. */
function lightness(rgb: Rgb): number {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

/** Gleichmäßige Stichprobe, damit die Zentren auch bei großen Bildern flott sind. */
function sampleLabs(active: number[], labs: (Lab | null)[], max: number): Lab[] {
  const stride = Math.max(1, Math.floor(active.length / max));
  const out: Lab[] = [];
  for (let i = 0; i < active.length; i += stride) out.push(labs[active[i] as number] as Lab);
  return out;
}

/**
 * k-Means++ mit D²-Gewichtung: Jeder Punkt wird mit einer Wahrscheinlichkeit
 * proportional zum Quadrat seines Abstands zum nächsten bereits gewählten
 * Zentrum gezogen. Dadurch bekommt jede deutlich andere Farbe ein eigenes
 * Zentrum, auch wenn eine Fläche das Bild dominiert — und anders als bei
 * reinem "nimm den entferntesten Punkt" wird ein einzelner Ausreißerpixel
 * nicht zur Stickfarbe.
 *
 * Der Zufall ist mit festem Startwert deterministisch, damit dasselbe Bild
 * immer dieselbe Palette ergibt und die Farben beim Schieben eines Reglers
 * nicht springen.
 */
function kmeansPlusPlus(points: Lab[], k: number, seeded: Lab[]): Lab[] {
  if (k <= 0 || points.length === 0) return [];
  const random = mulberry32(0x571c4);
  const centers = [...seeded];
  const out: Lab[] = [];

  // Quadrierter Abstand jedes Punktes zum nächstgelegenen Zentrum.
  const d2 = new Float64Array(points.length).fill(Infinity);
  const absorb = (c: Lab) => {
    for (let i = 0; i < points.length; i++) {
      const d = labDistance(points[i] as Lab, c);
      const sq = d * d;
      if (sq < (d2[i] as number)) d2[i] = sq;
    }
  };
  for (const c of centers) absorb(c);

  while (out.length < k) {
    let pick: Lab;
    if (centers.length === 0) {
      pick = points[Math.floor(random() * points.length)] as Lab;
    } else {
      let total = 0;
      for (let i = 0; i < d2.length; i++) total += d2[i] as number;
      // Alle Punkte liegen auf einem Zentrum: mehr Farben gibt das Bild nicht her.
      if (total <= 1e-9) break;
      let r = random() * total;
      let idx = points.length - 1;
      for (let i = 0; i < points.length; i++) {
        r -= d2[i] as number;
        if (r <= 0) {
          idx = i;
          break;
        }
      }
      pick = points[idx] as Lab;
    }
    out.push(pick);
    centers.push(pick);
    absorb(pick);
  }

  return out;
}

/** Kleiner deterministischer Zufallsgenerator. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Der Punkt mit dem größten Abstand zu seinem nächstgelegenen Zentrum. */
function farthestFrom(points: Lab[], centers: Lab[]): Lab | null {
  if (centers.length === 0) return points[0] ?? null;
  let best: Lab | null = null;
  let bestD = -1;
  for (const p of points) {
    let d = Infinity;
    for (const c of centers) {
      const dc = labDistance(p, c);
      if (dc < d) d = dc;
    }
    if (d > bestD) {
      bestD = d;
      best = p;
    }
  }
  return bestD > 1e-6 ? best : null;
}
