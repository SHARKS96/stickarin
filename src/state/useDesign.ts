/**
 * Der gesamte Zustand der App an einer Stelle.
 *
 * Gerechnet wird im Worker: Dieser Hook sammelt die Einstellungen, schickt
 * sie los und hält das Ergebnis. Die Oberfläche kennt nur noch Werte und
 * Setter.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_DENSITY_LEVEL,
  DENSITY_LEVELS,
  hoopById,
  MIN_SIZE_MM,
  SIZE_STEP_MM,
} from '../core/constants.ts';
import type { HoopId } from '../core/constants.ts';
import type { AreaSettings, StitchType } from '../core/pipeline.ts';
import type { ExportedFile } from '../core/export.ts';
import type { PlanStats, StitchPlan } from '../core/types.ts';
import { toHex } from '../image/color.ts';
import type { Rgb } from '../image/color.ts';
import type { AreaInfo, WorkImage } from '../worker/protocol.ts';
import { useStitchWorker } from './useStitchWorker.ts';
import { inheritKeys, inheritOrder, matchPalette, samePalette } from './palette.ts';
import { deleteDesign, listDesigns, loadDesign, saveDesign } from './storage.ts';
import type { SavedDesign, SavedDesignSummary } from './storage.ts';

/** Oberhalb dieser Breite wird das Bild vor dem Rechnen verkleinert. */
const WORK_WIDTH = 360;

export interface LoadedImage {
  name: string;
  /** Verkleinerte Arbeitskopie; alles rechnet darauf. */
  work: WorkImage;
  /** Für die Anzeige, inklusive Pipette. */
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

/**
 * Alle Farbentscheidungen auf einen Schlag — für „Abbrechen“.
 *
 * Die Palette gehört dazu: Die übrigen Felder sind über Palettenindizes
 * adressiert und ohne sie nicht zu deuten.
 */
export interface ColorSnapshot {
  palette: Rgb[];
  tolerance: number;
  ignoredSamples: Rgb[];
  colorNames: Record<number, string>;
  ignoredColors: Record<number, boolean>;
  order: number[] | null;
}

/** Einstellungen einer Fläche, wie sie der Schirm „Erweitert“ zeigt. */
export interface AreaView extends AreaInfo {
  index: number;
  stitchType: StitchType;
  densityLevel: number;
  raised: boolean;
}

export function useDesign() {
  const worker = useStitchWorker();

  const [image, setImageRaw] = useState<LoadedImage | null>(null);
  const [designId, setDesignId] = useState<string | null>(null);
  const [designName, setDesignName] = useState('Stickbild');

  const [widthMm, setWidthMmRaw] = useState(80);
  const [hoopId, setHoopId] = useState<HoopId>('midi');
  const [rotationDeg, setRotationDeg] = useState(0);

  const [colorCount, setColorCountRaw] = useState(4);
  const [tolerance, setTolerance] = useState(30);
  const [ignoredSamples, setIgnoredSamples] = useState<Rgb[]>([]);
  const [colorNames, setColorNames] = useState<Record<number, string>>({});
  const [ignoredColors, setIgnoredColors] = useState<Record<number, boolean>>({});
  const [order, setOrder] = useState<number[] | null>(null);
  const [areaOverrides, setAreaOverrides] = useState<Record<number, AreaSettings>>({});

  const [gallery, setGallery] = useState<SavedDesignSummary[]>([]);
  const refreshGallery = useCallback(() => {
    void listDesigns().then(setGallery);
  }, []);
  useEffect(refreshGallery, [refreshGallery]);

  // Die Palette, auf die sich die index-adressierten Einstellungen beziehen.
  const knownPalette = useRef<Rgb[] | null>(null);

  const resetDerived = useCallback(() => {
    knownPalette.current = null;
    setColorNames({});
    setIgnoredColors({});
    setOrder(null);
    setAreaOverrides({});
    setIgnoredSamples([]);
  }, []);

  // Der Hintergrund wird je Bild genau einmal automatisch ausgeschaltet.
  // Danach gehört die Entscheidung dem Nutzer, auch wenn er ihn wieder
  // anschaltet und an den Reglern dreht.
  const autoBackgroundDone = useRef(false);

  const setImage = useCallback(
    (img: LoadedImage | null) => {
      setImageRaw((prev) => {
        if (prev) URL.revokeObjectURL(prev.previewUrl);
        return img;
      });
      setDesignId(null);
      autoBackgroundDone.current = false;
      resetDerived();
    },
    [resetDerived],
  );

  const backgroundIndex = worker.result?.backgroundIndex ?? null;
  useEffect(() => {
    if (autoBackgroundDone.current || backgroundIndex === null) return;
    autoBackgroundDone.current = true;
    setIgnoredColors((m) => ({ ...m, [backgroundIndex]: true }));
  }, [backgroundIndex]);

  // --- Einstellungen an die neue Palette heften ------------------------
  //
  // Die Farbreduktion läuft nach jeder Änderung neu, und ihre Palette
  // kommt dabei in anderer Reihenfolge und anderer Länge zurück. Ohne
  // diesen Schritt gehörte „Rot wird nicht gestickt“ nach einem Tipp mit
  // der Pipette plötzlich zu Blau.
  const computed = worker.result;

  useEffect(() => {
    if (!computed) return;
    const before = knownPalette.current;
    knownPalette.current = computed.palette;
    if (!before || before.length === 0 || samePalette(before, computed.palette)) return;

    // Der Worker sagt aus den Pixeln heraus, aus welcher alten Farbe jede
    // neue hervorgegangen ist. Das gilt nur, wenn er von derselben alten
    // Palette ausging wie wir; war eine Antwort überholt, bleibt der
    // Abgleich über den Farbabstand. Der trifft die Umnummerierung — nur
    // einen Zerfall in zwei Farben kann er nicht auflösen.
    const ancestors = samePalette(computed.ancestorsOf, before)
      ? computed.ancestors
      : matchPalette(before, computed.palette);

    // Die Setter geben dasselbe Objekt zurück, wenn sich nichts ändert.
    // React bricht dann ab, und es folgt keine Rechnung umsonst.
    setColorNames((m) => inheritKeys(m, ancestors));
    setIgnoredColors((m) => inheritKeys(m, ancestors));
    setOrder((o) => inheritOrder(o, ancestors));
  }, [computed]);

  // --- Farbliste ------------------------------------------------------
  const colors = useMemo<ColorEntry[]>(() => {
    const palette = worker.result?.palette ?? [];
    const counts = worker.result?.counts ?? [];
    const base = palette.map((rgb, index) => ({
      index,
      rgb,
      hex: toHex(rgb),
      pixels: counts[index] ?? 0,
      name: colorNames[index] ?? defaultColorName(rgb, index),
      catalog: 'Stick-Karin',
      ignored: ignoredColors[index] ?? false,
    }));
    if (!order) return base;
    const byIndex = new Map(base.map((c) => [c.index, c]));
    const sorted = order.map((i) => byIndex.get(i)).filter((c): c is ColorEntry => Boolean(c));
    return [...sorted, ...base.filter((c) => !order.includes(c.index))];
  }, [worker.result, colorNames, ignoredColors, order]);

  // --- Flächen --------------------------------------------------------
  const areas = useMemo<AreaView[]>(() => {
    const infos = worker.result?.areas ?? [];
    return (
      infos
        // Flächen einer weggelassenen Farbe werden nicht gestickt und haben
        // in den erweiterten Einstellungen nichts verloren. Der Index bleibt
        // der der vollständigen Liste, weil der Worker danach adressiert.
        .map((info, index) => ({ info, index }))
        .filter(({ info }) => !ignoredColors[info.colorIndex])
        .map(({ info, index }) => {
          const override = areaOverrides[index];
          const spacing = override?.spacing ?? info.defaults.spacing;
          return {
            ...info,
            index,
            stitchType: override?.stitchType ?? info.defaults.stitchType,
            densityLevel: override ? nearestDensityLevel(spacing) : DEFAULT_DENSITY_LEVEL,
            raised: (override?.raisedLayers ?? 0) > 0,
          };
        })
    );
  }, [worker.result, areaOverrides, ignoredColors]);

  // --- Rechnung anstoßen ----------------------------------------------
  // Der Worker bekommt immer den vollständigen Satz Einstellungen; was
  // sich geändert hat, muss hier niemand wissen.
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  useEffect(() => {
    if (!image) return;
    worker.compute(image.work, {
      colorCount,
      tolerance,
      ignoredSamples,
      widthMm,
      colors: colorsRef.current.map((c) => ({
        index: c.index,
        name: c.name,
        catalog: c.catalog,
        ignored: c.ignored,
      })),
      areaSettings: areaOverrides,
    });
    // `colors` hängt am Ergebnis des Workers; es hier mitzuhorchen würde
    // jede Antwort sofort eine neue Anfrage auslösen. Darum über die Ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    image,
    colorCount,
    tolerance,
    ignoredSamples,
    widthMm,
    areaOverrides,
    colorNames,
    ignoredColors,
    order,
  ]);

  // --- Abgeleitete Größen ---------------------------------------------
  const hoop = hoopById(hoopId);
  const aspect = image ? image.work.height / image.work.width : 1;
  const rotated = rotationDeg % 180 !== 0;
  const heightMm = widthMm * aspect;
  const outerWidth = rotated ? heightMm : widthMm;
  const outerHeight = rotated ? widthMm : heightMm;
  const fitsHoop = outerWidth <= hoop.widthMm && outerHeight <= hoop.heightMm;

  /** Größte Breite, die in den gewählten Rahmen passt. */
  const maxWidthMm = useMemo(() => {
    const byWidth = rotated ? hoop.heightMm : hoop.widthMm;
    const byHeight = (rotated ? hoop.widthMm : hoop.heightMm) / aspect;
    return Math.floor(Math.min(byWidth, byHeight) / SIZE_STEP_MM) * SIZE_STEP_MM;
  }, [hoop, aspect, rotated]);

  const setWidthMm = useCallback(
    (mm: number) => setWidthMmRaw(clamp(mm, MIN_SIZE_MM, Math.max(MIN_SIZE_MM, maxWidthMm))),
    [maxWidthMm],
  );

  // Rahmenwechsel oder Drehung kann das Motiv zu groß machen.
  useEffect(() => {
    setWidthMmRaw((w) => clamp(w, MIN_SIZE_MM, Math.max(MIN_SIZE_MM, maxWidthMm)));
  }, [maxWidthMm]);

  // --- Speichern ------------------------------------------------------
  const exportFiles = useCallback((name: string) => worker.exportFiles(name), [worker]);

  const remember = useCallback(
    async (thumbnail: string) => {
      if (!image) return;
      const id = designId ?? crypto.randomUUID();
      setDesignId(id);
      const saved: SavedDesign = {
        id,
        name: designName,
        savedAt: Date.now(),
        thumbnail,
        image: { data: image.work.data, width: image.work.width, height: image.work.height },
        settings: {
          widthMm,
          hoopId,
          rotationDeg,
          colorCount,
          tolerance,
          ignoredSamples,
          colorNames,
          ignoredColors,
          order,
          areaSettings: areaOverrides,
        },
      };
      if (await saveDesign(saved)) refreshGallery();
    },
    [
      image,
      designId,
      designName,
      widthMm,
      hoopId,
      rotationDeg,
      colorCount,
      tolerance,
      ignoredSamples,
      colorNames,
      ignoredColors,
      order,
      areaOverrides,
      refreshGallery,
    ],
  );

  const open = useCallback(async (id: string) => {
    const saved = await loadDesign(id);
    if (!saved) return false;
    const work: WorkImage = {
      data: new Uint8ClampedArray(saved.image.data),
      width: saved.image.width,
      height: saved.image.height,
    };
    setImageRaw((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return { name: saved.name, work, previewUrl: saved.thumbnail };
    });
    setDesignId(saved.id);
    setDesignName(saved.name);
    // Die gespeicherten Einstellungen hängen an der Palette von damals.
    // Dieselben Eingaben ergeben sie wieder; bis dahin darf nichts
    // umgeschrieben werden.
    knownPalette.current = null;
    const s = saved.settings;
    setWidthMmRaw(s.widthMm);
    setHoopId(s.hoopId);
    setRotationDeg(s.rotationDeg);
    setColorCountRaw(s.colorCount);
    setTolerance(s.tolerance);
    setIgnoredSamples(s.ignoredSamples);
    setColorNames(s.colorNames);
    setIgnoredColors(s.ignoredColors);
    setOrder(s.order);
    setAreaOverrides(s.areaSettings);
    return true;
  }, []);

  const forget = useCallback(
    async (id: string) => {
      await deleteDesign(id);
      refreshGallery();
    },
    [refreshGallery],
  );

  return {
    // Bild
    image,
    setImage,
    designName,
    setDesignName,

    // Größe
    widthMm,
    setWidthMm,
    heightMm,
    outerWidth,
    outerHeight,
    maxWidthMm,
    hoopId,
    setHoopId,
    hoop,
    rotationDeg,
    rotate: () => setRotationDeg((d) => (d + 90) % 360),
    fitsHoop,

    // Farben
    colorCount,
    setColorCount: (n: number) => setColorCountRaw(clamp(n, 1, 8)),
    tolerance,
    setTolerance: (n: number) => setTolerance(clamp(n, 0, 100)),
    ignoredSamples,
    addIgnoredSample: (rgb: Rgb) => setIgnoredSamples((s) => [...s, rgb]),
    undoIgnoredSample: () => setIgnoredSamples((s) => s.slice(0, -1)),
    clearIgnoredSamples: () => setIgnoredSamples([]),
    snapshotColors,
    restoreColors,
    colors,
    setColorName: (index: number, name: string) => setColorNames((m) => ({ ...m, [index]: name })),
    toggleColorIgnored: (index: number) => setIgnoredColors((m) => ({ ...m, [index]: !m[index] })),
    moveColor: (index: number, direction: -1 | 1) =>
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

    // Flächen
    areas,
    setAreaSetting,
    resetAreaSettings: () => setAreaOverrides({}),

    // Ergebnis
    plan: worker.result?.plan ?? null,
    stats: worker.result?.stats ?? null,
    busy: worker.busy,
    error: worker.error,

    // Speichern und Galerie
    exportFiles,
    remember,
    gallery,
    open,
    forget,
  };

  /** Den jetzigen Stand aller Farbentscheidungen festhalten. */
  function snapshotColors(): ColorSnapshot {
    return {
      palette: knownPalette.current ?? [],
      tolerance,
      ignoredSamples,
      colorNames,
      ignoredColors,
      order,
    };
  }

  /** Genau diesen Stand wiederherstellen — „Abbrechen“. */
  function restoreColors(snapshot: ColorSnapshot): void {
    // Zuerst die Palette: Die übrigen Felder sind über ihre Indizes
    // adressiert. Ohne diese Zeile hielte die Umschreibung oben die
    // wiederhergestellten Einstellungen für solche der verworfenen
    // Palette und zöge sie ein zweites Mal um.
    knownPalette.current = snapshot.palette;
    setTolerance(snapshot.tolerance);
    setIgnoredSamples(snapshot.ignoredSamples);
    setColorNames(snapshot.colorNames);
    setIgnoredColors(snapshot.ignoredColors);
    setOrder(snapshot.order);
  }

  function setAreaSetting(
    index: number,
    patch: { stitchType?: StitchType; densityLevel?: number; raised?: boolean },
  ) {
    setAreaOverrides((m) => {
      const info = worker.result?.areas[index];
      if (!info) return m;
      const base = m[index] ?? info.defaults;
      const level =
        patch.densityLevel ??
        (m[index] ? nearestDensityLevel(base.spacing) : DEFAULT_DENSITY_LEVEL);
      const raised = patch.raised ?? base.raisedLayers > 0;
      return {
        ...m,
        [index]: {
          stitchType: patch.stitchType ?? base.stitchType,
          spacing: (
            DENSITY_LEVELS[clamp(level, 0, DENSITY_LEVELS.length - 1)] as { spacingMm: number }
          ).spacingMm,
          angle: base.angle,
          // Zwei Zusatzlagen, so wie in TEST2 Feld 3.
          raisedLayers: raised ? 2 : 0,
        },
      };
    });
  }
}

export type DesignState = ReturnType<typeof useDesign>;
export type { StitchPlan, PlanStats, ExportedFile };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function nearestDensityLevel(spacingMm: number): number {
  let best = DEFAULT_DENSITY_LEVEL;
  let bestD = Infinity;
  DENSITY_LEVELS.forEach((l, i) => {
    const d = Math.abs(l.spacingMm - spacingMm);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Ein Name, mit dem man am Garnschrank etwas anfangen kann. */
export function defaultColorName(rgb: Rgb, index: number): string {
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = max / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;

  if (saturation < 0.12) {
    if (light > 0.9) return 'Weiß';
    if (light > 0.65) return 'Hellgrau';
    if (light > 0.35) return 'Grau';
    if (light > 0.12) return 'Dunkelgrau';
    return 'Schwarz';
  }

  const hue = hueOf(r, g, b);
  const names: [number, string][] = [
    [15, 'Rot'],
    [40, 'Orange'],
    [70, 'Gelb'],
    [160, 'Grün'],
    [200, 'Türkis'],
    [255, 'Blau'],
    [290, 'Violett'],
    [340, 'Pink'],
    [360, 'Rot'],
  ];
  const base = names.find(([limit]) => hue < limit)?.[1] ?? `Farbe ${index + 1}`;
  if (light < 0.4) return `Dunkel${base.toLowerCase()}`;
  if (light > 0.85 && saturation < 0.45) return `Hell${base.toLowerCase()}`;
  return base;
}

function hueOf(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Datei -> verkleinerte Arbeitskopie plus Vorschau-URL. */
export async function loadImageFile(file: File): Promise<LoadedImage> {
  const previewUrl = URL.createObjectURL(file);
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, WORK_WIDTH / bitmap.width);
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Kein 2D-Kontext verfügbar.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    name: file.name.replace(/\.[^.]+$/, ''),
    work: { data: data.data, width: canvas.width, height: canvas.height },
    previewUrl,
  };
}
