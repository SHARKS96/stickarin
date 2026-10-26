/**
 * INF-Writer: die Farbdatei neben der EXP.
 *
 * Big-Endian. Ohne sie zeigt die B 590 nur Standardfarben an. Die Reihenfolge
 * der Farben entspricht der Reihenfolge der Farbwechsel in der EXP.
 *
 * Gegen TEST1.INF und TEST2.INF verifiziert.
 */
import type { ThreadColor } from '../types.ts';

/**
 * Bytes, die laut Feld "Restlänge" ab dort bis zum Dateiende folgen.
 * In den Maschinentests entspricht das exakt `Dateigröße − 12`, also allem
 * ab dem Feld "Anzahl Farben".
 */
const REST_LENGTH_OFFSET = 12;

const utf8 = new TextEncoder();

export function writeInf(threads: ThreadColor[]): Uint8Array {
  const encoded = threads.map((t) => ({
    thread: t,
    name: utf8.encode(t.name),
    catalog: utf8.encode(t.catalog),
  }));

  // Satzlänge = 2 (Länge) + 2 (Index) + 3 (RGB) + 2 (Nadel)
  //           + Name + 0x00 + Katalog + 0x00  =  11 + Name + Katalog
  const recordLengths = encoded.map((e) => 11 + e.name.length + e.catalog.length);
  const total = 16 + recordLengths.reduce((a, b) => a + b, 0);

  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);
  let p = 0;

  view.setUint32(p, 1, false); // Version
  p += 4;
  view.setUint32(p, 8, false); // Offset
  p += 4;
  view.setUint32(p, total - REST_LENGTH_OFFSET, false); // Restlänge
  p += 4;
  view.setUint32(p, threads.length, false); // Anzahl Farben
  p += 4;

  encoded.forEach((e, i) => {
    view.setUint16(p, recordLengths[i] as number, false);
    p += 2;
    view.setUint16(p, i, false); // Index
    p += 2;
    buf[p++] = e.thread.r & 0xff;
    buf[p++] = e.thread.g & 0xff;
    buf[p++] = e.thread.b & 0xff;
    view.setUint16(p, i + 1, false); // Nadel = Index + 1
    p += 2;
    buf.set(e.name, p);
    p += e.name.length;
    buf[p++] = 0;
    buf.set(e.catalog, p);
    p += e.catalog.length;
    buf[p++] = 0;
  });

  return buf;
}
