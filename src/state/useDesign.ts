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
import type { AreaSettings, LineSettings, StitchType } from '../core/pipeline.ts';
import type { ThreadChoice } from '../core/threads.ts';
import type { ExportedFile } from '../core/export.ts';
import type { PlanStats, StitchPlan } from '../core/types.ts';
import { toHex } from '../image/color.ts';
import type { Rgb } from '../image/color.ts';
import type { AreaInfo, LineInfo, SourceInput, WorkImage } from '../worker/protocol.ts';
import { colorCountOf } from '../vector/plan.ts';
import { toPreviewUrl } from '../vector/preview.ts';
import { parseSvg } from '../vector/svg.ts';
import { useStitchWorker } from './useStitchWorker.ts';
import { inheritKeys, inheritOrder, matchPalette, samePalette } from './palette.ts';
import { deleteDesign, listDesigns, loadDesign, saveDesign } from './storage.ts';
import type { SavedDesign, SavedDesignSummary } from './storage.ts';

/** Oberhalb dieser Breite wird das Bild vor dem Rechnen verkleinert. */
const WORK_WIDTH = 360;

/**
 * Eine geladene Vorlage — ein Pixelbild oder eine Vektorzeichnung.
 *
 * Alles, was die Oberfläche von einer Vorlage braucht, steht hier; welcher
 * der beiden Wege es ist, muss nur an den wenigen Stellen bekannt sein, an
 * denen es wirklich einen Unterschied macht (die Pipette etwa gibt es nur
 * beim Pixelbild).
 */
export interface LoadedSource {
  name: string;
  /** Das, womit der Worker rechnet. */
  source: SourceInput;
  /** Für die Anzeige; beim Vektorweg die gelesene Zeichnung selbst. */
  previewUrl: string;
  /** Höhe geteilt durch Breite — Rahmen und Vorschau hängen daran. */
  aspect: number;
  /** Die Arbeitskopie für die Pipette; bei einer Vektorzeichnung `null`. */
  work: WorkImage | null;
  /** Was an der Datei nicht stickbar war, in Worten für den Nutzer. */
  warnings: string[];
}

export interface ColorEntry {
  index: number;
  /** Die im Bild erkannte Farbe — daran erkennt man die Fläche wieder. */
  rgb: Rgb;
  hex: string;
  pixels: number;
  name: string;
  catalog: string;
  ignored: boolean;
  /** Das Garn, mit dem gestickt wird. Ohne eigene Wahl die erkannte Farbe. */
  thread: Rgb;
  threadHex: string;
  /** Wurde das Garn von Hand gewählt? */
  threadChosen: boolean;
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
  threads: Record<number, ThreadChoice>;
  order: number[] | null;
}

/** Einstellungen einer Fläche, wie sie der Schirm „Erweitert“ zeigt. */
export interface AreaView extends AreaInfo {
  index: number;
  stitchType: StitchType;
  densityLevel: number;
  raised: boolean;
}

/** Einstellungen eines Strichs, wie sie der Schirm „Erweitert“ zeigt. */
export interface LineView extends LineInfo {
  index: number;
  stitchType: LineSettings['stitchType'];
}

export function useDesign() {
  const worker = useStitchWorker();

  const [source, setSourceRaw] = useState<LoadedSource | null>(null);
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
  const [threads, setThreads] = useState<Record<number, ThreadChoice>>({});
  const [order, setOrder] = useState<number[] | null>(null);
  const [areaOverrides, setAreaOverrides] = useState<Record<number, AreaSettings>>({});
  const [lineOverrides, setLineOverrides] = useState<Record<number, LineSettings>>({});

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
    setThreads({});
    setOrder(null);
    setAreaOverrides({});
    setLineOverrides({});
    setIgnoredSamples([]);
  }, []);

  // Der Hintergrund wird je Bild genau einmal automatisch ausgeschaltet.
  // Danach gehört die Entscheidung dem Nutzer, auch wenn er ihn wieder
  // anschaltet und an den Reglern dreht.
  const autoBackgroundDone = useRef(false);

  const setSource = useCallback(
    (next: LoadedSource | null) => {
      setSourceRaw((prev) => {
        releasePreview(prev);
        return next;
      });
      setDesignId(null);
      autoBackgroundDone.current = false;
      resetDerived();
      // Eine Vektorzeichnung sagt ihre Farben selbst; die Vorgabe ist
      // darum genau das, was in der Datei steht. Beim Pixelbild bleibt
      // es bei der eingestellten Zahl, dort gibt es nichts zu übernehmen.
      if (next?.source.kind === 'vector') {
        setColorCountRaw(clamp(colorCountOf(next.source.doc), 1, MAX_COLORS));
      }
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
    setThreads((m) => inheritKeys(m, ancestors));
    setOrder((o) => inheritOrder(o, ancestors));
  }, [computed]);

  // --- Farbliste ------------------------------------------------------
  const colors = useMemo<ColorEntry[]>(() => {
    const palette = worker.result?.palette ?? [];
    const counts = worker.result?.counts ?? [];
    const base = palette.map((rgb, index) => {
      const chosen = threads[index];
      const thread = chosen?.rgb ?? rgb;
      return {
        index,
        rgb,
        hex: toHex(rgb),
        pixels: counts[index] ?? 0,
        // Der Name steht beim Umfädeln im Display der Maschine, gehört also
        // zum Garn — nicht zu der Farbe, die einmal im Bild war.
        name: colorNames[index] ?? chosen?.name ?? defaultColorName(rgb, index),
        catalog: 'Stick-Karin',
        ignored: ignoredColors[index] ?? false,
        thread,
        threadHex: toHex(thread),
        threadChosen: chosen !== undefined,
      };
    });
    if (!order) return base;
    const byIndex = new Map(base.map((c) => [c.index, c]));
    const sorted = order.map((i) => byIndex.get(i)).filter((c): c is ColorEntry => Boolean(c));
    return [...sorted, ...base.filter((c) => !order.includes(c.index))];
  }, [worker.result, colorNames, ignoredColors, threads, order]);

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

  // --- Striche ---------------------------------------------------------
  const lines = useMemo<LineView[]>(() => {
    const infos = worker.result?.lines ?? [];
    return infos
      .map((info, index) => ({ info, index }))
      .filter(({ info }) => !ignoredColors[info.colorIndex])
      .map(({ info, index }) => ({
        ...info,
        index,
        stitchType: lineOverrides[index]?.stitchType ?? info.defaults.stitchType,
      }));
  }, [worker.result, lineOverrides, ignoredColors]);

  // --- Rechnung anstoßen ----------------------------------------------
  // Der Worker bekommt immer den vollständigen Satz Einstellungen; was
  // sich geändert hat, muss hier niemand wissen.
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  useEffect(() => {
    if (!source) return;
    worker.compute(source.source, {
      colorCount,
      tolerance,
      ignoredSamples,
      widthMm,
      colors: colorsRef.current.map((c) => ({
        index: c.index,
        rgb: c.rgb,
        name: c.name,
        catalog: c.catalog,
        ignored: c.ignored,
        ...(c.threadChosen ? { thread: c.thread } : {}),
      })),
      areaSettings: areaOverrides,
      lineSettings: lineOverrides,
    });
    // `colors` hängt am Ergebnis des Workers; es hier mitzuhorchen würde
    // jede Antwort sofort eine neue Anfrage auslösen. Darum über die Ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    source,
    colorCount,
    tolerance,
    ignoredSamples,
    widthMm,
    areaOverrides,
    lineOverrides,
    colorNames,
    ignoredColors,
    threads,
    order,
  ]);

  // --- Abgeleitete Größen ---------------------------------------------
  /**
   * Mehr Garne als Farben in der Datei kann es beim Vektorweg nicht geben:
   * Dort wird nichts gefunden, sondern nur zusammengelegt.
   *
   * Gemerkt, weil die Antwort das Bündeln der Farben voraussetzt — das
   * bei jedem Neuzeichnen zu wiederholen, wäre bei einer bunten Zeichnung
   * teurer als die ganze übrige Oberfläche.
   */
  const maxColorCount = useMemo(() => {
    if (source?.source.kind !== 'vector') return MAX_COLORS;
    return Math.min(MAX_COLORS, Math.max(1, colorCountOf(source.source.doc)));
  }, [source]);

  const hoop = hoopById(hoopId);
  const aspect = source ? source.aspect : 1;
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
      if (!source) return;
      const id = designId ?? crypto.randomUUID();
      setDesignId(id);
      const saved: SavedDesign = {
        id,
        name: designName,
        savedAt: Date.now(),
        thumbnail,
        ...(source.source.kind === 'image'
          ? {
              image: {
                data: source.source.image.data,
                width: source.source.image.width,
                height: source.source.image.height,
              },
            }
          : { vector: source.source.doc }),
        settings: {
          widthMm,
          hoopId,
          rotationDeg,
          colorCount,
          tolerance,
          ignoredSamples,
          colorNames,
          ignoredColors,
          threads,
          order,
          areaSettings: areaOverrides,
          lineSettings: lineOverrides,
        },
      };
      if (await saveDesign(saved)) refreshGallery();
    },
    [
      source,
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
      threads,
      order,
      areaOverrides,
      lineOverrides,
      refreshGallery,
    ],
  );

  const open = useCallback(async (id: string) => {
    const saved = await loadDesign(id);
    if (!saved) return false;
    const restored = sourceOf(saved);
    if (!restored) return false;
    setSourceRaw((prev) => {
      releasePreview(prev);
      return restored;
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
    // Ältere Stickbilder kennen noch keine eigenen Garnfarben.
    setThreads(s.threads ?? {});
    setOrder(s.order);
    setAreaOverrides(s.areaSettings);
    // Striche gibt es erst seit dem Vektorweg; ältere Stickbilder kennen
    // das Feld nicht.
    setLineOverrides(s.lineSettings ?? {});
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
    // Vorlage
    source,
    setSource,
    /** Kommt das Motiv aus einer Vektorzeichnung? */
    isVector: source?.source.kind === 'vector',
    /** Die Arbeitskopie des Pixelbildes — die Pipette braucht sie. */
    workImage: source?.work ?? null,
    /** Was an der Vorlage nicht stickbar war. */
    warnings: source?.warnings ?? [],
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
    maxColorCount,
    setColorCount: (n: number) => setColorCountRaw(clamp(n, 1, maxColorCount)),
    tolerance,
    setTolerance: (n: number) => setTolerance(clamp(n, 0, 100)),
    ignoredSamples,
    addIgnoredSample: (rgb: Rgb) => setIgnoredSamples((s) => [...s, rgb]),
    undoIgnoredSample: () => setIgnoredSamples((s) => s.slice(0, -1)),
    clearIgnoredSamples: () => setIgnoredSamples([]),
    snapshotColors,
    restoreColors,
    colors,
    /** Ein Garn von Hand wählen; `null` nimmt die erkannte Bildfarbe zurück. */
    setThreadColor: (index: number, choice: ThreadChoice | null) =>
      setThreads((m) => {
        if (choice) return { ...m, [index]: choice };
        if (m[index] === undefined) return m;
        const next = { ...m };
        delete next[index];
        return next;
      }),
    threadsChosen: Object.keys(threads).length,
    resetThreadColors: () => setThreads({}),
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

    // Flächen und Striche
    areas,
    setAreaSetting,
    lines,
    setLineSetting,
    resetAreaSettings: () => {
      setAreaOverrides({});
      setLineOverrides({});
    },

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
      threads,
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
    setThreads(snapshot.threads);
    setOrder(snapshot.order);
  }

  /** Stichart eines Strichs ändern: Steppstich oder Satin. */
  function setLineSetting(index: number, patch: { stitchType?: LineSettings['stitchType'] }) {
    setLineOverrides((m) => {
      const info = worker.result?.lines[index];
      if (!info) return m;
      const base = m[index] ?? info.defaults;
      return { ...m, [index]: { ...base, ...patch } };
    });
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

/** Mehr Garne verlangt niemand, und die Maschine hält sonst zu oft an. */
const MAX_COLORS = 8;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Die Vorschau freigeben, wenn sie eine ist.
 *
 * Ein Pixelbild zeigt sich über eine Objektadresse, die das Dokument am
 * Leben hält, bis sie zurückgegeben wird; die Vorschau einer
 * Vektorzeichnung steht dagegen als Datenadresse für sich.
 */
function releasePreview(loaded: LoadedSource | null): void {
  if (loaded?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(loaded.previewUrl);
}

/** Ein gespeichertes Stickbild zurück in eine Vorlage verwandeln. */
function sourceOf(saved: SavedDesign): LoadedSource | null {
  if (saved.vector) {
    const doc = saved.vector;
    if (doc.width <= 0) return null;
    return {
      name: saved.name,
      source: { kind: 'vector', doc },
      previewUrl: toPreviewUrl(doc),
      aspect: doc.height / doc.width,
      work: null,
      warnings: doc.warnings,
    };
  }
  if (!saved.image) return null;
  const work: WorkImage = {
    data: new Uint8ClampedArray(saved.image.data),
    width: saved.image.width,
    height: saved.image.height,
  };
  return {
    name: saved.name,
    source: { kind: 'image', image: work },
    previewUrl: saved.thumbnail,
    aspect: work.height / work.width,
    work,
    warnings: [],
  };
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

/**
 * Eine gewählte Datei öffnen — als Vektorzeichnung oder als Pixelbild.
 *
 * Die Entscheidung fällt an der Datei selbst. Ein SVG durch den
 * Bildzweig zu schicken wäre naheliegend (der Browser kann es ja
 * anzeigen), hieße aber, es zu rastern und alles wieder zu raten, was
 * darin ausdrücklich steht.
 */
export async function loadSourceFile(file: File): Promise<LoadedSource> {
  return isSvg(file) ? loadVectorFile(file) : loadImageFile(file);
}

function isSvg(file: File): boolean {
  return file.type === 'image/svg+xml' || /\.svgz?$/i.test(file.name);
}

/**
 * Den Text einer Zeichnung lesen, auch wenn sie gepackt ist.
 *
 * Inkscape bietet „Komprimiertes SVG“ als Standardformat an; so eine Datei
 * beginnt mit den zwei Bytes 1f 8b und ist sonst dasselbe. Erkannt wird sie
 * am Inhalt und nicht an der Endung, denn die ist oft trotzdem `.svg`.
 */
async function svgText(file: File): Promise<string> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (head[0] !== 0x1f || head[1] !== 0x8b) return file.text();
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      'Diese Zeichnung ist gepackt (SVGZ). Speichern Sie sie als einfaches SVG und versuchen Sie es noch einmal.',
    );
  }
  return new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

/** Der Dateiname ohne Endung — der Vorschlag für den Namen des Stickbilds. */
function baseName(file: File): string {
  return file.name.replace(/\.[^.]+$/, '');
}

async function loadVectorFile(file: File): Promise<LoadedSource> {
  const doc = parseSvg(await svgText(file));
  if (doc.width <= 0 || doc.height <= 0 || doc.elements.length === 0) {
    throw new Error(
      doc.warnings[0] ?? 'In dieser Zeichnung ist nichts zu finden, was sich sticken ließe.',
    );
  }
  return {
    name: baseName(file),
    source: { kind: 'vector', doc },
    // Gezeigt wird die gelesene Zeichnung, nicht die Datei: So sieht der
    // Nutzer schon hier, was hinterher wirklich in den Rahmen kommt.
    previewUrl: toPreviewUrl(doc),
    aspect: doc.height / doc.width,
    work: null,
    warnings: doc.warnings,
  };
}

/** Pixelbild -> verkleinerte Arbeitskopie plus Vorschau-Adresse. */
async function loadImageFile(file: File): Promise<LoadedSource> {
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
  const work: WorkImage = { data: data.data, width: canvas.width, height: canvas.height };
  return {
    name: baseName(file),
    source: { kind: 'image', image: work },
    previewUrl,
    aspect: work.height / work.width,
    work,
    warnings: [],
  };
}
