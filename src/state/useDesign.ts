/**
 * Der gesamte Zustand der App an einer Stelle.
 *
 * Die schwere Rechnerei (Farbreduktion, Vektorisieren, Stiche) hängt an
 * `useMemo`. Für große Motive gehört das später in einen Web Worker —
 * solange es ruckelt, merkt man es nur beim Schieben der Regler.
 */
import { useCallback, useMemo, useState } from 'react';
import { HOOPS } from '../core/constants.ts';
import type { HoopId } from '../core/constants.ts';
import { buildPlan, defaultSettingsFor } from '../core/pipeline.ts';
import type { AreaSettings, ColorPlanInput } from '../core/pipeline.ts';
import { planStats } from '../core/types.ts';
import type { StitchPlan, ThreadColor } from '../core/types.ts';
import { toHex } from '../image/color.ts';
import type { Rgb } from '../image/color.ts';
import { quantize } from '../image/quantize.ts';
import { traceAreas } from '../image/trace.ts';
import type { TracedArea } from '../image/trace.ts';

/** Oberhalb dieser Breite wird das Bild vor dem Rechnen verkleinert. */
const WORK_WIDTH = 360;

export interface LoadedImage {
  name: string;
  data: ImageData;
  /** Vorschau fürs Anzeigen, unabhängig von der verkleinerten Arbeitskopie. */
  previewUrl: string;
}

export interface ColorEntry {
  index: number;
  rgb: Rgb;
  hex: string;
  pixels: number;
  name: string;
  catalog: string;
  ignored: boolean;
}

export interface DesignState {
  image: LoadedImage | null;
  setImage: (img: LoadedImage | null) => void;

  colorCount: number;
  setColorCount: (n: number) => void;
  tolerance: number;
  setTolerance: (n: number) => void;

  ignoredSamples: Rgb[];
  addIgnoredSample: (rgb: Rgb) => void;
  clearIgnoredSamples: () => void;

  widthMm: number;
  setWidthMm: (mm: number) => void;
  hoopId: HoopId;
  setHoopId: (id: HoopId) => void;
  heightMm: number;
  fitsHoop: boolean;

  designName: string;
  setDesignName: (s: string) => void;

  colors: ColorEntry[];
  setColorName: (index: number, name: string) => void;
  toggleColorIgnored: (index: number) => void;
  moveColor: (index: number, direction: -1 | 1) => void;

  areas: TracedArea[];
  areaSettings: Record<number, AreaSettings>;
  setAreaSetting: (areaIndex: number, patch: Partial<AreaSettings>) => void;
  resetAreaSettings: () => void;

  plan: StitchPlan | null;
  stats: ReturnType<typeof planStats> | null;
}

export function useDesign(): DesignState {
  const [image, setImageRaw] = useState<LoadedImage | null>(null);
  const [colorCount, setColorCount] = useState(4);
  const [tolerance, setTolerance] = useState(12);
  const [ignoredSamples, setIgnoredSamples] = useState<Rgb[]>([]);
  const [widthMm, setWidthMm] = useState(100);
  const [hoopId, setHoopId] = useState<HoopId>('midi');
  const [designName, setDesignName] = useState('STICK');
  const [nameOverrides, setNameOverrides] = useState<Record<number, string>>({});
  const [ignoredColors, setIgnoredColors] = useState<Record<number, boolean>>({});
  const [order, setOrder] = useState<number[] | null>(null);
  const [areaSettings, setAreaSettings] = useState<Record<number, AreaSettings>>({});

  const setImage = useCallback((img: LoadedImage | null) => {
    setImageRaw((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return img;
    });
    // Ein neues Bild setzt alle Ableitungen zurück.
    setNameOverrides({});
    setIgnoredColors({});
    setOrder(null);
    setAreaSettings({});
    setIgnoredSamples([]);
  }, []);

  // --- Farbreduktion -------------------------------------------------
  const quantized = useMemo(() => {
    if (!image) return null;
    const small = downscale(image.data, WORK_WIDTH);
    return quantize(small.data, small.width, small.height, {
      colors: colorCount,
      ignored: ignoredSamples,
      tolerance,
    });
  }, [image, colorCount, tolerance, ignoredSamples]);

  // --- Vektorisieren --------------------------------------------------
  const areas = useMemo(() => {
    if (!quantized || quantized.palette.length === 0) return [];
    const mmPerPixel = widthMm / quantized.width;
    return traceAreas(quantized, { mmPerPixel });
  }, [quantized, widthMm]);

  // --- Farbliste ------------------------------------------------------
  const colors = useMemo<ColorEntry[]>(() => {
    if (!quantized) return [];
    const base = quantized.palette.map((rgb, index) => ({
      index,
      rgb,
      hex: toHex(rgb),
      pixels: quantized.counts[index] ?? 0,
      name: nameOverrides[index] ?? `Farbe ${index + 1}`,
      catalog: 'Stick-Karin',
      ignored: ignoredColors[index] ?? false,
    }));
    if (!order) return base;
    // Eine gespeicherte Reihenfolge anwenden, unbekannte Indizes hinten anhängen.
    const byIndex = new Map(base.map((c) => [c.index, c]));
    const sorted = order.map((i) => byIndex.get(i)).filter((c): c is ColorEntry => Boolean(c));
    const missing = base.filter((c) => !order.includes(c.index));
    return [...sorted, ...missing];
  }, [quantized, nameOverrides, ignoredColors, order]);

  // --- Stichplan ------------------------------------------------------
  const plan = useMemo<StitchPlan | null>(() => {
    if (areas.length === 0 || colors.length === 0) return null;
    const inputs: ColorPlanInput[] = [];
    colors.forEach((color) => {
      if (color.ignored) return;
      const own = areas.filter((a) => a.colorIndex === color.index);
      if (own.length === 0) return;
      const thread: ThreadColor = {
        r: color.rgb.r,
        g: color.rgb.g,
        b: color.rgb.b,
        name: color.name,
        catalog: color.catalog,
      };
      inputs.push({
        thread,
        areas: own,
        settings: own.map((a) => areaSettings[areas.indexOf(a)] ?? defaultSettingsFor(a.shape)),
      });
    });
    if (inputs.length === 0) return null;
    return buildPlan(inputs);
  }, [areas, colors, areaSettings]);

  const stats = useMemo(() => (plan ? planStats(plan) : null), [plan]);

  const heightMm = useMemo(() => {
    if (!quantized) return 0;
    return (widthMm * quantized.height) / quantized.width;
  }, [quantized, widthMm]);

  const hoop = HOOPS.find((h) => h.id === hoopId) ?? HOOPS[0];
  const fitsHoop = widthMm <= hoop.widthMm && heightMm <= hoop.heightMm;

  return {
    image,
    setImage,
    colorCount,
    setColorCount,
    tolerance,
    setTolerance,
    ignoredSamples,
    addIgnoredSample: (rgb) => setIgnoredSamples((s) => [...s, rgb]),
    clearIgnoredSamples: () => setIgnoredSamples([]),
    widthMm,
    setWidthMm,
    hoopId,
    setHoopId,
    heightMm,
    fitsHoop,
    designName,
    setDesignName,
    colors,
    setColorName: (index, name) => setNameOverrides((m) => ({ ...m, [index]: name })),
    toggleColorIgnored: (index) => setIgnoredColors((m) => ({ ...m, [index]: !m[index] })),
    moveColor: (index, direction) =>
      setOrder(() => {
        const current = colors.map((c) => c.index);
        const at = current.indexOf(index);
        const to = at + direction;
        if (at < 0 || to < 0 || to >= current.length) return current;
        const next = [...current];
        next.splice(at, 1);
        next.splice(to, 0, index);
        return next;
      }),
    areas,
    areaSettings,
    setAreaSetting: (areaIndex, patch) =>
      setAreaSettings((m) => {
        const area = areas[areaIndex];
        if (!area) return m;
        const base = m[areaIndex] ?? defaultSettingsFor(area.shape);
        return { ...m, [areaIndex]: { ...base, ...patch } };
      }),
    resetAreaSettings: () => setAreaSettings({}),
    plan,
    stats,
  };
}

/** Verkleinert die Arbeitskopie, damit die Regler flüssig bleiben. */
function downscale(src: ImageData, maxWidth: number): ImageData {
  if (src.width <= maxWidth) return src;
  const scale = maxWidth / src.width;
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x / scale));
      const si = (sy * src.width + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = src.data[si] as number;
      out[di + 1] = src.data[si + 1] as number;
      out[di + 2] = src.data[si + 2] as number;
      out[di + 3] = src.data[si + 3] as number;
    }
  }
  return new ImageData(out, w, h);
}
