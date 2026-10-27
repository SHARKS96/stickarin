/**
 * Treibt den Rechen-Worker an.
 *
 * Anfragen werden kurz gesammelt, bevor sie losgehen: Wer am Größenregler
 * zieht, erzeugt sonst zwanzig Rechnungen, von denen neunzehn beim
 * Eintreffen schon veraltet sind. Antworten mit alter Nummer fliegen weg.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExportedFile } from '../core/export.ts';
import { fromCompactPlan } from '../core/types.ts';
import type { PlanStats, StitchPlan, ThreadColor } from '../core/types.ts';
import type { Rgb } from '../image/color.ts';
import type {
  AreaInfo,
  ComputeOptions,
  WorkerRequest,
  WorkerResponse,
  WorkImage,
} from '../worker/protocol.ts';

/** Wartezeit, bevor eine Reglerbewegung zur Rechnung wird. */
const DEBOUNCE_MS = 120;

export interface ComputeResult {
  palette: Rgb[];
  counts: number[];
  areas: AreaInfo[];
  plan: StitchPlan | null;
  stats: PlanStats | null;
  threads: ThreadColor[];
  backgroundIndex: number | null;
  /** Je neuer Farbe die alte, aus der sie hervorgegangen ist. */
  ancestors: (number | null)[];
  /** Die alte Palette, auf die sich `ancestors` bezieht. */
  ancestorsOf: Rgb[];
}

export interface StitchWorker {
  result: ComputeResult | null;
  busy: boolean;
  error: string | null;
  compute: (image: WorkImage, options: ComputeOptions) => void;
  exportFiles: (name: string) => Promise<ExportedFile[]>;
}

export function useStitchWorker(): StitchWorker {
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const latestCompute = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exports = useRef(
    new Map<number, { resolve: (f: ExportedFile[]) => void; reject: (e: Error) => void }>(),
  );

  const [result, setResult] = useState<ComputeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('../worker/stitch.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;

      if (message.type === 'computed') {
        // Eine überholte Antwort interessiert nicht mehr.
        if (message.id !== latestCompute.current) return;
        setResult({
          palette: message.palette,
          counts: message.counts,
          areas: message.areas,
          plan: message.plan ? fromCompactPlan(message.plan) : null,
          stats: message.stats,
          threads: message.threads,
          backgroundIndex: message.backgroundIndex,
          ancestors: message.ancestors,
          ancestorsOf: message.ancestorsOf,
        });
        setError(null);
        setBusy(false);
        return;
      }

      if (message.type === 'exported') {
        exports.current.get(message.id)?.resolve(message.files);
        exports.current.delete(message.id);
        return;
      }

      const pending = exports.current.get(message.id);
      if (pending) {
        pending.reject(new Error(message.message));
        exports.current.delete(message.id);
        return;
      }
      if (message.id === latestCompute.current) {
        setError(message.message);
        setBusy(false);
      }
    };

    worker.onerror = (event) => {
      setError(event.message || 'Die Berechnung ist fehlgeschlagen.');
      setBusy(false);
    };

    return () => {
      if (timer.current) clearTimeout(timer.current);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const compute = useCallback((image: WorkImage, options: ComputeOptions) => {
    setBusy(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const worker = workerRef.current;
      if (!worker) return;
      const id = ++requestId.current;
      latestCompute.current = id;
      const request: WorkerRequest = { type: 'compute', id, image, options };
      worker.postMessage(request);
    }, DEBOUNCE_MS);
  }, []);

  const exportFiles = useCallback((name: string) => {
    return new Promise<ExportedFile[]>((resolve, reject) => {
      const worker = workerRef.current;
      if (!worker) {
        reject(new Error('Der Rechenvorgang läuft noch nicht.'));
        return;
      }
      const id = ++requestId.current;
      exports.current.set(id, { resolve, reject });
      const request: WorkerRequest = { type: 'export', id, name };
      worker.postMessage(request);
    });
  }, []);

  return { result, busy, error, compute, exportFiles };
}
