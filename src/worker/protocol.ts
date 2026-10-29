/**
 * Nachrichten zwischen Oberfläche und Rechen-Worker.
 *
 * Jede Anfrage trägt eine laufende Nummer. Trifft eine Antwort ein, deren
 * Nummer nicht mehr die neueste ist, war der Nutzer schneller als die
 * Rechnung — die Antwort fliegt weg.
 */
import type { AreaSettings, LineSettings } from '../core/pipeline.ts';
import type { CompactPlan, PlanStats, ThreadColor } from '../core/types.ts';
import type { Rgb } from '../image/color.ts';
import type { ExportedFile } from '../core/export.ts';
import type { VectorDocument } from '../vector/types.ts';

/** Die verkleinerte Arbeitskopie des Bildes. */
export interface WorkImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Woraus das Motiv entsteht.
 *
 * Zwei Wege münden in denselben Stichplan: Beim Pixelbild müssen die
 * Farben gefunden und die Konturen verfolgt werden, bei der
 * Vektorzeichnung steht beides schon in der Datei. Welcher Weg es ist,
 * entscheidet allein diese Unterscheidung — der Rest der Anwendung
 * rechnet mit Farben, Flächen und Strichen und muss es nicht wissen.
 */
export type SourceInput =
  | { kind: 'image'; image: WorkImage }
  | { kind: 'vector'; doc: VectorDocument };

export interface ComputeOptions {
  colorCount: number;
  /** Nur beim Pixelbild: Spielraum der Pipette. */
  tolerance: number;
  /** Nur beim Pixelbild: die mit der Pipette weggenommenen Farben. */
  ignoredSamples: Rgb[];
  widthMm: number;
  /**
   * Farben in Stickreihenfolge; `ignored` lässt eine Farbe weg.
   *
   * `thread` ist das von Hand gewählte Garn. Fehlt es, wird in der aus dem
   * Bild erkannten Farbe gestickt.
   */
  colors: {
    index: number;
    name: string;
    catalog: string;
    ignored: boolean;
    thread?: Rgb;
  }[];
  /** Abweichende Einstellungen je Fläche, über den Flächenindex. */
  areaSettings: Record<number, AreaSettings>;
  /** Abweichende Einstellungen je Strich, über den Strichindex. */
  lineSettings: Record<number, LineSettings>;
}

/** Was die Oberfläche über eine erkannte Fläche wissen muss. */
export interface AreaInfo {
  colorIndex: number;
  areaMm2: number;
  /** Kürzeste Breite — entscheidet über die automatische Stichart. */
  widthMm: number;
  /**
   * Wie breit die Fläche quer zur Satinrichtung im Mittel ist.
   *
   * Nicht dasselbe wie `widthMm`: Das umschließende Rechteck einer „7“ ist
   * in beide Richtungen vierzig Millimeter, der Strich selbst acht. Daran
   * sieht der Nutzer, ob sich Satin für diese Fläche überhaupt eignet.
   */
  satinWidthMm: number;
  defaults: AreaSettings;
}

/** Was die Oberfläche über einen erkannten Strich wissen muss. */
export interface LineInfo {
  colorIndex: number;
  /** Länge des Pfades in mm. */
  lengthMm: number;
  /** Strichbreite in mm — entscheidet über Steppstich oder Satin. */
  widthMm: number;
  closed: boolean;
  defaults: LineSettings;
}

export type WorkerRequest =
  | { type: 'compute'; id: number; source: SourceInput; options: ComputeOptions }
  | { type: 'export'; id: number; name: string };

export type WorkerResponse =
  | {
      type: 'computed';
      id: number;
      palette: Rgb[];
      counts: number[];
      areas: AreaInfo[];
      lines: LineInfo[];
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
