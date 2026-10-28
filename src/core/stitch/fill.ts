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
  PULL_COMPENSATION_MM,
  RAISED_UNDERLAY_SPACING_MM,
  UNDERLAY_SPACING_MM,
} from '../constants.ts';
import { insetShape, normalizeShape } from '../geometry/polygon.ts';
import type { Shape } from '../geometry/polygon.ts';
import { tatamiRows } from './tatami.ts';
import { coveredArea, outsetBy, staysInside } from './travel.ts';
import type { StitchBuilder } from './builder.ts';
import type { Point } from '../types.ts';

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

  // Die folgenden drei schalten je einen Bestandteil der Füllung ab. In der
  // App wird daran nicht gedreht — die Vorgaben sind die, die gestickt
  // werden sollen. Gebraucht werden sie für Probestickdateien: Nur wenn
  // sich die Bestandteile einzeln abschalten lassen, zeigt ein Versuch,
  // welcher von ihnen einen sichtbaren Unterschied macht.

  /** Kantenlauf und Querunterlage; aus = nur die Deckschicht. */
  underlay?: boolean;
  /** Die Kontur, die zuletzt außen herumläuft. */
  closingContour?: boolean;
  /** Wie weit jede Reihe über die Sollkante hinausläuft. */
  pullCompensation?: number;
}

/**
 * Stickt die Fläche in den Builder. Das Fadenstück bleibt danach offen,
 * damit der Aufrufer selbst über Schnitt oder Weiterlauf entscheidet.
 */
export function fillArea(builder: StitchBuilder, raw: Shape, options: FillOptions = {}): void {
  const {
    spacing = FILL_SPACING_MM,
    angle = 0,
    raisedLayers = 0,
    underlay = true,
    closingContour = true,
    pullCompensation = PULL_COMPENSATION_MM,
  } = options;
  // Außen im Uhrzeigersinn, Löcher dagegen — darauf verlässt sich der Versatz.
  const shape = normalizeShape(raw);

  // 1. Kantenlauf knapp innerhalb der Kontur. Er gehört zur Unterlage und
  //    hält den Stoff fest; zu sehen ist er später nicht.
  const edge = insetShape(shape, FILL_EDGE_INSET_MM);
  if (underlay && edge) {
    builder.runLoop(edge.outer);
    for (const hole of edge.holes) builder.runLoop(hole);
  }

  const inner = edge ?? shape;

  // 2. Lockere Querunterlage, quer zur Deckschicht.
  if (underlay) {
    runRows(builder, inner, {
      spacing: UNDERLAY_SPACING_MM,
      angle: angle + Math.PI / 2,
      pullCompensation,
    });
  }

  // 3. 3D: weitere Unterlagelagen, enger und abwechselnd gedreht.
  for (let i = 0; i < raisedLayers; i++) {
    runRows(builder, inner, {
      spacing: RAISED_UNDERLAY_SPACING_MM,
      angle: angle + (i % 2 === 0 ? Math.PI / 4 : -Math.PI / 4),
      pullCompensation,
    });
  }

  // 4. Deckschicht auf der **vollen** Fläche, nicht auf der versetzten.
  //    Sonst endet die Füllung einen halben Millimeter vor der Kante.
  runRows(builder, shape, { spacing, angle, pullCompensation });

  // 5. Abschlusskontur ganz außen.
  //
  //    Ohne sie bilden die Umkehrpunkte der Füllreihen den sichtbaren Rand:
  //    Jede Reihe endet für sich, nichts hält die Enden auf einer Linie, und
  //    der Rand wird weich und ausgefranst. Genau das zeigt TEST2.
  //
  //    Sie läuft auf der **Außenkante der Füllung**, also um den
  //    Zugausgleich weiter draußen als die Sollkante. Liefe sie auf der
  //    Sollkante, blieben die um 0,2 mm verlängerten Reihenenden davor
  //    stehen und der Kamm wäre weiter zu sehen. Der Kantenlauf aus
  //    Schritt 1 hilft ohnehin nicht — er liegt einen halben Millimeter
  //    weiter innen und unter der Deckschicht.
  if (closingContour) {
    const rim = outsetBy(shape, pullCompensation);
    builder.runLoop(rim.outer);
    for (const hole of rim.holes) builder.runLoop(hole);
  }
}

function runRows(
  builder: StitchBuilder,
  shape: Shape,
  options: { spacing: number; angle: number; pullCompensation: number },
): void {
  const covered = coveredArea(shape, options.pullCompensation);

  for (const row of tatamiRows(shape, options)) {
    const first = row[0];
    if (!first) continue;
    const here = builder.current;

    // Der Weg zur nächsten Teilstrecke darf nur durchgestickt werden, wenn
    // er im Material bleibt. Sonst liefe der Faden quer durch ein Loch oder
    // über die Einbuchtung einer U-Form — sichtbar und falsch.
    if (here && !staysInside(covered, here, first)) builder.moveTo(first);
    else builder.travelTo(first);

    for (const p of row) builder.stitchTo(p as Point);
  }
}
