/**
 * Nachrichten zwischen Oberfläche und Rechen-Worker.
 *
 * Jede Anfrage trägt eine laufende Nummer. Trifft eine Antwort ein, deren
 * Nummer nicht mehr die neueste ist, war der Nutzer schneller als die
 * Rechnung — die Antwort fliegt weg.
 */
import type { AreaSettings } from '../core/pipeline.ts';
import type { CompactPlan, PlanStats, ThreadColor } from '../core/types.ts';
import type { Rgb } from '../image/color.ts';
import type { ExportedFile } from '../core/export.ts';

/** Die verkleinerte Arbeitskopie des Bildes. */
export interface WorkImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ComputeOptions {
  colorCount: number;
  tolerance: number;
  ignoredSamples: Rgb[];
  widthMm: number;
  /** Farben in Stickreihenfolge; `ignored` lässt eine Farbe weg. */
  colors: { index: number; name: string; catalog: string; ignored: boolean }[];
  /** Abweichende Einstellungen je Fläche, über den Flächenindex. */
  areaSettings: Record<number, AreaSettings>;
}

/** Was die Oberfläche über eine erkannte Fläche wissen muss. */
export interface AreaInfo {
  colorIndex: number;
  areaMm2: number;
  /** Kürzeste Breite — entscheidet über die automatische Stichart. */
  widthMm: number;
  defaults: AreaSettings;
}

export type WorkerRequest =
  | { type: 'compute'; id: number; image: WorkImage; options: ComputeOptions }
  | { type: 'export'; id: number; name: string };

export type WorkerResponse =
  | {
      type: 'computed';
      id: number;
      palette: Rgb[];
      counts: number[];
      areas: AreaInfo[];
      plan: CompactPlan | null;
      stats: PlanStats | null;
      threads: ThreadColor[];
      /** Die Farbe, die den Bildrand beherrscht — fast immer der Hintergrund. */
      backgroundIndex: number | null;
      /**
       * Je neuer Palettenfarbe die Stelle in der vorigen Palette, aus deren
       * Pixeln sie überwiegend besteht; `null`, wenn es keine gibt.
       *
       * Die Farbreduktion läuft jedes Mal neu und teilt die Farben dabei
       * anders auf. Hierüber nimmt die Oberfläche ihre Entscheidungen mit:
       * Zerfällt eine Sammelfarbe in zwei, zeigen beide auf dieselbe alte
       * Stelle.
       */
      ancestors: (number | null)[];
      /**
       * Die vorige Palette, auf die sich `ancestors` bezieht — das Ergebnis
       * der letzten Rechnung dieses Workers. War eine Antwort überholt, ist
       * das nicht die Palette, die die Oberfläche hält; sie prüft das nach.
       */
      ancestorsOf: Rgb[];
    }
  | { type: 'exported'; id: number; files: ExportedFile[] }
  | { type: 'failed'; id: number; message: string };
