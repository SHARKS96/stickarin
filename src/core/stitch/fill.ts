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
import { insetShape } from '../geometry/polygon.ts';
import type { Shape } from '../geometry/polygon.ts';
import { tatamiRows } from './tatami.ts';
import type { StitchBuilder } from './builder.ts';
import { dist } from './builder.ts';
import type { Point } from '../types.ts';

/** Ab dieser Lücke zwischen zwei Teilstrecken lohnt ein Sprung. */
const SPAN_JUMP_MM = 6;

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
export function fillArea(builder: StitchBuilder, shape: Shape, options: FillOptions = {}): void {
  const { spacing = FILL_SPACING_MM, angle = 0, raisedLayers = 0 } = options;

  // 1. Kantenlauf knapp innerhalb der Kontur — hält den Rand sauber.
  //    Löcher bekommen ihren eigenen Lauf.
  const edge = insetShape(shape, FILL_EDGE_INSET_MM);
  if (edge) {
    builder.runLoop(edge.outer);
    for (const hole of edge.holes) builder.runLoop(hole);
  }

  const inner = edge ?? shape;

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
  shape: Shape,
  options: { spacing: number; angle: number },
): void {
  for (const row of tatamiRows(shape, options)) {
    const first = row[0];
    if (!first) continue;
    const here = builder.current;
    // Zwischen weit auseinander liegenden Teilstrecken lieber springen
    // als quer über die Fläche zu sticken.
    if (here && dist(here, first) > SPAN_JUMP_MM) builder.moveTo(first);
    for (const p of row) builder.stitchTo(p as Point);
  }
}
