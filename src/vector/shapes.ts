/**
 * Von Ringen zu Flächen mit Löchern.
 *
 * Ein SVG-Pfad kann aus vielen geschlossenen Teilstücken bestehen, und ob
 * ein Teilstück ein Loch ist oder eine eigene Insel, steht nirgends: Das
 * entscheidet die Füllregel. `evenodd` zählt die Überdeckungen, `nonzero`
 * ihre Drehrichtungen. Ein „O“ hat so ein Loch, ein „ö“ zwei Inseln dazu.
 *
 * Entschieden wird je Ring an **einer seiner Kanten**: Wenn außerhalb der
 * Kante ungefüllt ist und innerhalb gefüllt, ist der Ring eine Außenkante;
 * umgekehrt ist er ein Loch; und ist es auf beiden Seiten gleich, trennt er
 * nichts und fällt weg — so steht es in der Füllregel, und so wird aus zwei
 * gleichläufigen Ringen unter `nonzero` eine volle Fläche, unter `evenodd`
 * aber ein Loch.
 *
 * „An der Kante“ geht ohne Epsilon: Ein waagerechter Schnitt durch alle
 * Ringe ergibt eine sortierte Liste von Übergängen. Von links nach rechts
 * aufsummiert steht an jeder Stelle, wie oft überdeckt wird — die Werte
 * unmittelbar vor und nach dem ersten Übergang des eigenen Rings sind
 * genau außen und innen.
 */
import { pointInRing, ringArea, ringBounds, signedArea2 } from '../core/geometry/polygon.ts';
import { normalizeShape } from '../core/geometry/polygon.ts';
import type { Ring, Shape } from '../core/geometry/polygon.ts';
import type { Point } from '../core/types.ts';
import type { FillRule } from './paint.ts';

/** Ringe unter dieser Fläche (in Nutzereinheiten²) sind Rundungsreste. */
const MIN_RING_AREA = 1e-9;

/** Diese Höhen werden der Reihe nach probiert — Eckpunkte liegen selten auf allen. */
const PROBE_FRACTIONS = [0.5, 0.37, 0.63, 0.21, 0.79, 0.11, 0.89];

export function ringsToShapes(rings: Ring[], rule: FillRule): Shape[] {
  const usable = rings.filter((ring) => ring.length >= 3 && ringArea(ring) > MIN_RING_AREA);
  if (usable.length === 0) return [];

  const outers: { ring: Ring; area: number }[] = [];
  const holes: { ring: Ring; inside: Point }[] = [];

  for (const ring of usable) {
    const edge = probeEdge(ring, usable, rule);
    if (!edge) continue;
    if (edge.filledInside && !edge.filledOutside) outers.push({ ring, area: ringArea(ring) });
    else if (!edge.filledInside && edge.filledOutside) holes.push({ ring, inside: edge.inside });
  }

  // Große Flächen zuerst — so steht das Motiv in der Flächenliste in einer
  // Reihenfolge, die zum Stickverlauf passt.
  outers.sort((a, b) => b.area - a.area);
  const built = outers.map((o) => ({
    shape: { outer: o.ring, holes: [] as Ring[] },
    area: o.area,
  }));

  // Löcher bekommt der engste Außenring, der sie enthält — bei
  // verschachtelten Formen ist das nicht der größte.
  for (const hole of holes) {
    let best: (typeof built)[number] | null = null;
    for (const candidate of built) {
      if (best && candidate.area >= best.area) continue;
      if (pointInRing(candidate.shape.outer, hole.inside)) best = candidate;
    }
    if (best) best.shape.holes.push(hole.ring);
  }

  return built.map((b) => normalizeShape(b.shape));
}

/** Ein Übergang eines Rings auf der Schnittlinie. */
interface Transition {
  x: number;
  /** +1 für eine Kante nach unten, −1 für eine nach oben. */
  direction: number;
  own: boolean;
}

interface Edge {
  /** Ein Punkt unmittelbar innerhalb der geprüften Kante. */
  inside: Point;
  filledInside: boolean;
  filledOutside: boolean;
}

/**
 * Die Füllregel beidseitig der ersten eigenen Kante auswerten.
 *
 * `null`, wenn sich auf keiner der geprüften Höhen eine brauchbare Kante
 * findet — etwa bei einem Ring, der zu einer Strecke entartet ist.
 */
function probeEdge(ring: Ring, all: Ring[], rule: FillRule): Edge | null {
  const bounds = ringBounds(ring);
  const height = bounds.maxY - bounds.minY;
  if (!(height > 0)) return null;

  for (const fraction of PROBE_FRACTIONS) {
    const y = bounds.minY + height * fraction;
    const transitions: Transition[] = [];
    for (const other of all) collectTransitions(other, y, other === ring, transitions);
    transitions.sort((a, b) => a.x - b.x);

    const first = transitions.findIndex((t) => t.own);
    if (first < 0 || first + 1 >= transitions.length) continue;

    const left = transitions[first] as Transition;
    const right = transitions[first + 1] as Transition;
    if (right.x - left.x < 1e-12) continue;

    let count = 0;
    let winding = 0;
    for (let i = 0; i < first; i++) {
      count++;
      winding += (transitions[i] as Transition).direction;
    }
    const filledOutside = rule === 'evenodd' ? count % 2 === 1 : winding !== 0;
    const filledInside =
      rule === 'evenodd' ? (count + 1) % 2 === 1 : winding + left.direction !== 0;

    return {
      inside: { x: (left.x + right.x) / 2, y },
      filledInside,
      filledOutside,
    };
  }
  return null;
}

function collectTransitions(ring: Ring, y: number, own: boolean, out: Transition[]): void {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i] as Point;
    const b = ring[j] as Point;
    // Halboffener Vergleich: Ein Eckpunkt auf der Höhe zählt genau einmal.
    if (a.y > y === b.y > y) continue;
    out.push({
      x: a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x),
      direction: a.y > b.y ? 1 : -1,
      own,
    });
  }
}

/**
 * Ein Punkt sicher innerhalb des Rings.
 *
 * Der Schwerpunkt taugt nicht: Bei einem „C“ liegt er in der Luft. Darum
 * ein waagerechter Schnitt und die Mitte seines ersten Abschnitts — der
 * liegt immer im Material.
 */
export function interiorPoint(ring: Ring): Point | null {
  const bounds = ringBounds(ring);
  const height = bounds.maxY - bounds.minY;
  if (!(height > 0)) return null;

  for (const fraction of PROBE_FRACTIONS) {
    const y = bounds.minY + height * fraction;
    const transitions: Transition[] = [];
    collectTransitions(ring, y, true, transitions);
    if (transitions.length < 2) continue;
    transitions.sort((a, b) => a.x - b.x);
    const left = (transitions[0] as Transition).x;
    const right = (transitions[1] as Transition).x;
    if (right - left > 1e-9) return { x: (left + right) / 2, y };
  }
  return null;
}

/** Umlaufrichtung eines Rings — Y zeigt nach unten, darum ist positiv rechtsherum. */
export function isClockwise(ring: Ring): boolean {
  return signedArea2(ring) >= 0;
}
