/**
 * Woraus ist eine Farbe hervorgegangen?
 *
 * Die Farbreduktion läuft nach jeder Änderung von vorn. Ihre Palette kommt
 * dabei nicht nur in anderer Reihenfolge zurück — sie kann anders aufgeteilt
 * sein. Nimmt die Pipette den Hintergrund weg, wird ein Clusterplatz frei,
 * und eine Sammelfarbe zerfällt: Aus einem blassen Mittelwert aus Weiß und
 * Grün werden Weiß-weg und reines Grün.
 *
 * Über Farbabstände ist das nicht aufzulösen — der Mittelwert liegt weit von
 * beiden. Über die Pixel schon: Die neue Fläche besteht aus denselben
 * Pixeln wie vorher ein Teil der alten. Wer die Sammelfarbe weggelassen hat,
 * meinte diese Pixel.
 *
 * Gezählt wird deshalb nur, keine Farbe wird verglichen. Ein Pixel, das
 * vorher gar nicht gestickt wurde, zählt nicht mit — sonst erbte ein
 * zurückgenommener Pipettentipp die Einstellung der nächstbesten Farbe.
 */

/**
 * Für jede Farbe der neuen Palette die Stelle in der alten, aus deren Pixeln
 * sie überwiegend besteht — oder `null`.
 *
 * @param indices  Zuordnung der neuen Rechnung, `-1` für ignorierte Pixel.
 * @param size     Länge der neuen Palette.
 * @param previous Zuordnung der vorigen Rechnung, gleich lang wie `indices`.
 * @param previousSize Länge der vorigen Palette.
 */
export function paletteAncestors(
  indices: Int16Array,
  size: number,
  previous: Int16Array,
  previousSize: number,
): (number | null)[] {
  const none = new Array<number | null>(size).fill(null);
  if (size === 0 || previousSize === 0 || previous.length !== indices.length) return none;

  // Je neuer Farbe eine Strichliste über die alten.
  const tally = Array.from({ length: size }, () => new Int32Array(previousSize));
  for (let i = 0; i < indices.length; i++) {
    const to = indices[i] as number;
    const from = previous[i] as number;
    if (to < 0 || from < 0) continue;
    const row = tally[to] as Int32Array;
    row[from] = (row[from] as number) + 1;
  }

  return tally.map((counts) => {
    let best: number | null = null;
    let bestN = 0;
    counts.forEach((n, from) => {
      if (n > bestN) {
        bestN = n;
        best = from;
      }
    });
    return best;
  });
}
