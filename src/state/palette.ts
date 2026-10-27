/**
 * Einstellungen an der Farbe festmachen, nicht an ihrer Position.
 *
 * Die Farbreduktion läuft nach jeder Änderung komplett neu. Ihre Palette
 * kommt in anderer Reihenfolge zurück — aus `Gelb, Rot, Weiß, Blau, Grün`
 * wird `Blau, Grün, Rot, Gelb` — und manchmal auch anders aufgeteilt.
 *
 * Alles, was die App am Index festhält (ausgeschaltete Farben, eigene Namen,
 * die Stickreihenfolge), gehörte danach zur falschen Farbe. Ein Tipp mit der
 * Pipette schaltete so ein Garn aus, das niemand angefasst hatte.
 *
 * Gerechnet wird in einer Richtung: Jede **neue** Farbe nennt die alte, aus
 * der sie hervorgegangen ist. So kann eine alte Farbe auch zwei neue
 * bedienen, wenn sie zerfallen ist. Woher diese Herkunft stammt — aus den
 * Pixeln (`paletteAncestors`) oder ersatzweise aus dem Farbabstand
 * (`matchPalette`) — ist hier gleichgültig.
 */
import { labDistance, rgbToLab } from '../image/color.ts';
import type { Rgb } from '../image/color.ts';

/**
 * Ab diesem Lab-Abstand sind es zwei verschiedene Farben.
 *
 * Großzügig gewählt: Eine Farbe verschiebt sich durch das Neurechnen leicht,
 * weil ihr Mittelwert nun aus anderen Pixeln stammt. Zu knapp bemessen,
 * verlöre sie ihre Einstellungen bei jedem Tipp.
 */
const MAX_MATCH_DISTANCE = 25;

/**
 * Ersatzweiser Abgleich über den Farbabstand: für jede **neue** Farbe die
 * alte, die ihr am nächsten liegt — oder `null`.
 *
 * Zugeordnet wird paarweise vom kleinsten Abstand aufwärts, damit nicht
 * zwei neue Farben dieselbe alte beanspruchen. Das trifft die
 * Umnummerierung; einen Zerfall in zwei Farben kann es nicht auflösen,
 * dafür gibt es `paletteAncestors`.
 */
export function matchPalette(before: Rgb[], after: Rgb[]): (number | null)[] {
  const oldLabs = before.map(rgbToLab);
  const newLabs = after.map(rgbToLab);

  const pairs: { from: number; to: number; d: number }[] = [];
  oldLabs.forEach((a, from) => {
    newLabs.forEach((b, to) => {
      const d = labDistance(a, b);
      if (d <= MAX_MATCH_DISTANCE) pairs.push({ from, to, d });
    });
  });
  // Bei gleichem Abstand entscheidet die Position, damit das Ergebnis
  // nicht von der Sortierreihenfolge der Laufzeit abhängt.
  pairs.sort((p, q) => p.d - q.d || p.from - q.from || p.to - q.to);

  const ancestors: (number | null)[] = after.map(() => null);
  const used = new Set<number>();
  for (const { from, to } of pairs) {
    if (ancestors[to] !== null || used.has(from)) continue;
    ancestors[to] = from;
    used.add(from);
  }
  return ancestors;
}

/**
 * Schreibt einen index-adressierten Satz auf die neue Palette um.
 *
 * Ändert sich nichts, kommt dasselbe Objekt zurück. Darauf verlässt sich
 * der Aufrufer: React rechnet sonst wegen eines neuen, aber gleichen
 * Objekts eine Runde umsonst.
 */
export function inheritKeys<T>(
  record: Record<number, T>,
  ancestors: (number | null)[],
): Record<number, T> {
  const next: Record<number, T> = {};
  ancestors.forEach((from, to) => {
    if (from === null) return;
    const value = record[from];
    if (value !== undefined) next[to] = value;
  });

  const before = Object.keys(record);
  const after = Object.keys(next);
  const same =
    before.length === after.length && before.every((k) => next[Number(k)] === record[Number(k)]);
  return same ? record : next;
}

/**
 * Dasselbe für die selbst gewählte Stickreihenfolge.
 *
 * Zerfällt eine Farbe, stehen ihre Nachfolger an ihrer Stelle nebeneinander;
 * neu hinzugekommene Farben hängen hinten an.
 */
export function inheritOrder(
  order: number[] | null,
  ancestors: (number | null)[],
): number[] | null {
  if (!order) return order;
  const next: number[] = [];
  for (const from of order) {
    ancestors.forEach((a, to) => {
      if (a === from) next.push(to);
    });
  }
  for (let to = 0; to < ancestors.length; to++) if (!next.includes(to)) next.push(to);

  const same = next.length === order.length && next.every((v, i) => v === order[i]);
  return same ? order : next;
}

/** Sind das dieselben Farben an denselben Stellen? */
export function samePalette(a: Rgb[], b: Rgb[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((c, i) => {
    const d = b[i] as Rgb;
    return c.r === d.r && c.g === d.g && c.b === d.b;
  });
}
