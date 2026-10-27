/**
 * „Zuletzt erstellt“: gespeicherte Stickbilder im Browser des iPads.
 *
 * IndexedDB statt localStorage, weil die Arbeitskopie des Bildes als
 * Binärdaten mitgespeichert wird — damit lässt sich ein Stickbild später
 * wirklich wieder öffnen und nicht nur sein Name anzeigen.
 *
 * Alles hier ist Bequemlichkeit, kein Verlass: Im privaten Modus oder bei
 * gelöschten Website-Daten ist die Liste leer. Jeder Zugriff darf daher
 * fehlschlagen, ohne dass die App stehen bleibt.
 */
import type { HoopId } from '../core/constants.ts';
import type { AreaSettings } from '../core/pipeline.ts';
import type { ThreadChoice } from '../core/threads.ts';

const DB_NAME = 'stickarin';
const DB_VERSION = 1;
const STORE = 'designs';

/** Ein gespeichertes Stickbild, so wie es die Startseite zeigt und lädt. */
export interface SavedDesign {
  id: string;
  name: string;
  savedAt: number;
  /** Kleines PNG für die Kachel. */
  thumbnail: string;
  /** Arbeitskopie des Bildes, damit sich alles neu berechnen lässt. */
  image: { data: Uint8ClampedArray; width: number; height: number };
  settings: {
    widthMm: number;
    hoopId: HoopId;
    rotationDeg: number;
    colorCount: number;
    tolerance: number;
    ignoredSamples: { r: number; g: number; b: number }[];
    colorNames: Record<number, string>;
    ignoredColors: Record<number, boolean>;
    /** Von Hand gewählte Garne; fehlt bei Stickbildern aus früheren Fassungen. */
    threads?: Record<number, ThreadChoice>;
    order: number[] | null;
    areaSettings: Record<number, AreaSettings>;
  };
}

/** Eintrag ohne die schweren Felder — reicht für die Kachelansicht. */
export type SavedDesignSummary = Pick<SavedDesign, 'id' | 'name' | 'savedAt' | 'thumbnail'>;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('savedAt', 'savedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB nicht verfügbar.'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Zugriff fehlgeschlagen.'));
    });
  } finally {
    db.close();
  }
}

/** Die zuletzt gespeicherten Stickbilder, neuestes zuerst. */
export async function listDesigns(limit = 8): Promise<SavedDesignSummary[]> {
  try {
    const all = await withStore<SavedDesign[]>('readonly', (store) => store.getAll());
    return all
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, limit)
      .map(({ id, name, savedAt, thumbnail }) => ({ id, name, savedAt, thumbnail }));
  } catch {
    return [];
  }
}

export async function loadDesign(id: string): Promise<SavedDesign | null> {
  try {
    return (await withStore<SavedDesign | undefined>('readonly', (s) => s.get(id))) ?? null;
  } catch {
    return null;
  }
}

export async function saveDesign(design: SavedDesign): Promise<boolean> {
  try {
    await withStore('readwrite', (store) => store.put(design));
    return true;
  } catch {
    return false;
  }
}

export async function deleteDesign(id: string): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(id));
  } catch {
    // Verschwindet eben nicht aus der Liste; kein Grund, den Nutzer zu stören.
  }
}

/** Datum für die Kachel: „Heute“, „Gestern“ oder der Tag. */
export function formatSavedAt(timestamp: number): string {
  const then = new Date(timestamp);
  const today = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(today) - startOfDay(then)) / 86_400_000);
  if (days <= 0) return 'Heute';
  if (days === 1) return 'Gestern';
  return then.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
}
