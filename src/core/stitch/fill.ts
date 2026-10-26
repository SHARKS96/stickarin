/**
 * Fläche füllen: Kantenlauf, Unterlage, Deckschicht — in dieser Reihenfolge.
 *
 * Die Unterlage ist der Unterschied zwischen TEST1 (licht, streifig) und
 * einem deckenden Stickbild. Sie fixiert den Stoff und verhindert, dass die
 * Deckschicht einsinkt.
 */
import {
  FILL_EDGE_INSET_MM,
  FILL_SPACING_MM,
  RAISED_UNDERLAY_SPACING_MM,
  UNDERLAY_SPACING_MM,
} from '../constants.ts';
import { insetConvex } from '../geometry/polygon.ts';
import type { Polygon } from '../geometry/polygon.ts';
import { tatamiRows } from './tatami.ts';
import type { StitchBuilder } from './builder.ts';

export interface FillOptions {
  /** Reihenabstand der Deckschicht; kleiner = dichter. */
  spacing?: number;
  /** Winkel der Deckschicht im Bogenmaß. */
  angle?: number;
  /**
   * 3D-Effekt: zusätzliche Unterlagelagen, die die Fläche erhaben machen.
   * 0 = aus. Keine 3D-Folie, nur mehr Garn darunter.
   */
  raisedLayers?: number;
}

/**
 * Stickt die Fläche in den Builder. Das Fadenstück bleibt danach offen,
 * damit der Aufrufer selbst über Schnitt oder Weiterlauf entscheidet.
 */
export function fillArea(builder: StitchBuilder, poly: Polygon, options: FillOptions = {}): void {
  const { spacing = FILL_SPACING_MM, angle = 0, raisedLayers = 0 } = options;

  // 1. Kantenlauf knapp innerhalb der Kontur — hält den Rand sauber.
  const edge = insetConvex(poly, FILL_EDGE_INSET_MM);
  if (edge) builder.runLoop(edge);

  const inner = edge ?? poly;

  // 2. Lockere Querunterlage, quer zur Deckschicht.
  runRows(builder, inner, { spacing: UNDERLAY_SPACING_MM, angle: angle + Math.PI / 2 });

  // 3. 3D: weitere Unterlagelagen, enger und abwechselnd gedreht.
  for (let i = 0; i < raisedLayers; i++) {
    runRows(builder, inner, {
      spacing: RAISED_UNDERLAY_SPACING_MM,
      angle: angle + (i % 2 === 0 ? Math.PI / 4 : -Math.PI / 4),
    });
  }

  // 4. Deckschicht.
  runRows(builder, inner, { spacing, angle });
}

function runRows(
  builder: StitchBuilder,
  poly: Polygon,
  options: { spacing: number; angle: number },
): void {
  const rows = tatamiRows(poly, options);
  rows.forEach((row, i) => {
    if (row.length === 0) return;
    // Erste Reihe anfahren, danach läuft der Faden durch.
    if (i === 0) builder.stitchTo(row[0]!);
    for (const p of row) builder.stitchTo(p);
  });
}
