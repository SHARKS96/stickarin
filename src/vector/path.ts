/**
 * Pfaddaten lesen und in Polygonzüge auflösen.
 *
 * Die Maschine kann keine Kurve: Jeder Stich ist eine Gerade. Bézierkurven
 * und Bögen werden darum unterteilt, bis die Sehne weniger als `tolerance`
 * von der echten Kurve abweicht. Die Toleranz kommt von außen und hängt an
 * der späteren Stickgröße — ein Kreis von 5 mm braucht weniger Punkte als
 * derselbe Kreis in 15 cm.
 *
 * Unterteilt wird rekursiv halbierend (de Casteljau) statt mit einer festen
 * Zahl von Stücken: So bekommt eine fast gerade Kurve zwei Punkte und eine
 * scharfe Kehre zwanzig, ohne dass irgendwo geraten wird.
 */
import type { Point } from '../core/types.ts';

/** Ein Teilstück eines Pfades. Der letzte Punkt wird nie wiederholt. */
export interface SubPath {
  points: Point[];
  closed: boolean;
}

/** Notbremse gegen entartete Kurven; 2^10 Stücke sind weit jenseits des Sichtbaren. */
const MAX_DEPTH = 10;

export function parsePath(d: string, tolerance: number): SubPath[] {
  const scanner = new Scanner(d);
  const out: SubPath[] = [];
  const tol = Math.max(tolerance, 1e-6);

  let points: Point[] = [];
  let closed = false;
  let current: Point = { x: 0, y: 0 };
  /** Anfang des laufenden Teilstücks — dorthin führt `Z` zurück. */
  let start: Point = { x: 0, y: 0 };
  /** Spiegelpunkt für `S`/`T`; `null`, wenn der Vorgänger keine Kurve war. */
  let lastControl: Point | null = null;
  let command = '';

  const finish = () => {
    if (points.length >= 2) out.push({ points, closed });
    points = [];
    closed = false;
  };

  const moveTo = (p: Point) => {
    // Eine abgebrochene Zahlenfolge liefert keinen Punkt, sondern nichts:
    // Laut Norm gilt ein Pfad bis zur Fehlerstelle, nicht darüber hinaus.
    if (scanner.failed()) return;
    finish();
    current = p;
    start = p;
    points = [p];
  };

  const lineTo = (p: Point) => {
    if (scanner.failed()) return;
    if (points.length === 0) points.push(current);
    points.push(p);
    current = p;
  };

  const curveTo = (c1: Point, c2: Point, p: Point) => {
    if (scanner.failed()) return;
    if (points.length === 0) points.push(current);
    flattenCubic(current, c1, c2, p, tol, points, 0);
    current = p;
  };

  while (!scanner.done()) {
    const next = scanner.command();
    if (next) command = next;
    else if (command === '') break;
    // Nach `M x y x y` geht es als Linienzug weiter, nach `Z` nicht.
    else if (command === 'M') command = 'L';
    else if (command === 'm') command = 'l';
    else if (command === 'Z' || command === 'z') break;

    const relative = command === command.toLowerCase();
    const dx = relative ? current.x : 0;
    const dy = relative ? current.y : 0;

    switch (command.toUpperCase()) {
      case 'M':
        moveTo({ x: scanner.number() + dx, y: scanner.number() + dy });
        lastControl = null;
        break;
      case 'L':
        lineTo({ x: scanner.number() + dx, y: scanner.number() + dy });
        lastControl = null;
        break;
      case 'H':
        lineTo({ x: scanner.number() + dx, y: current.y });
        lastControl = null;
        break;
      case 'V':
        lineTo({ x: current.x, y: scanner.number() + dy });
        lastControl = null;
        break;
      case 'C': {
        const c1 = { x: scanner.number() + dx, y: scanner.number() + dy };
        const c2 = { x: scanner.number() + dx, y: scanner.number() + dy };
        const p = { x: scanner.number() + dx, y: scanner.number() + dy };
        curveTo(c1, c2, p);
        lastControl = c2;
        break;
      }
      case 'S': {
        const c1 = reflect(current, lastControl);
        const c2 = { x: scanner.number() + dx, y: scanner.number() + dy };
        const p = { x: scanner.number() + dx, y: scanner.number() + dy };
        curveTo(c1, c2, p);
        lastControl = c2;
        break;
      }
      case 'Q': {
        const c = { x: scanner.number() + dx, y: scanner.number() + dy };
        const p = { x: scanner.number() + dx, y: scanner.number() + dy };
        const [c1, c2] = quadraticToCubic(current, c, p);
        curveTo(c1, c2, p);
        lastControl = c;
        break;
      }
      case 'T': {
        const c = reflect(current, lastControl);
        const p = { x: scanner.number() + dx, y: scanner.number() + dy };
        const [c1, c2] = quadraticToCubic(current, c, p);
        curveTo(c1, c2, p);
        lastControl = c;
        break;
      }
      case 'A': {
        const rx = scanner.number();
        const ry = scanner.number();
        const rotation = scanner.number();
        const largeArc = scanner.flag();
        const sweep = scanner.flag();
        const p = { x: scanner.number() + dx, y: scanner.number() + dy };
        for (const curve of arcToCubics(current, rx, ry, rotation, largeArc, sweep, p)) {
          curveTo(curve[0], curve[1], curve[2]);
        }
        current = p;
        lastControl = null;
        break;
      }
      case 'Z':
        if (points.length >= 2) {
          closed = true;
          finish();
        }
        current = start;
        lastControl = null;
        break;
      default:
        // Unbekannter Buchstabe: Der Rest des Pfades ist nicht zu deuten.
        scanner.stop();
        break;
    }
  }

  finish();
  return out.map((sub) => ({ points: dropRepeats(sub.points, sub.closed), closed: sub.closed }));
}

/** Der am Startpunkt gespiegelte vorige Kontrollpunkt — ohne solchen der Punkt selbst. */
function reflect(p: Point, control: Point | null): Point {
  if (!control) return p;
  return { x: 2 * p.x - control.x, y: 2 * p.y - control.y };
}

function quadraticToCubic(p0: Point, c: Point, p: Point): [Point, Point] {
  return [
    { x: p0.x + (2 / 3) * (c.x - p0.x), y: p0.y + (2 / 3) * (c.y - p0.y) },
    { x: p.x + (2 / 3) * (c.x - p.x), y: p.y + (2 / 3) * (c.y - p.y) },
  ];
}

/**
 * Kubische Kurve in Geraden auflösen; `out` bekommt alle Punkte **ohne**
 * den Startpunkt, der schon drin steht.
 */
function flattenCubic(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  tolerance: number,
  out: Point[],
  depth: number,
): void {
  if (depth >= MAX_DEPTH || isFlat(p0, p1, p2, p3, tolerance)) {
    out.push(p3);
    return;
  }
  // de Casteljau bei t = 0,5.
  const m = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const a = m(p0, p1);
  const b = m(p1, p2);
  const c = m(p2, p3);
  const d = m(a, b);
  const e = m(b, c);
  const mid = m(d, e);
  flattenCubic(p0, a, d, mid, tolerance, out, depth + 1);
  flattenCubic(mid, e, c, p3, tolerance, out, depth + 1);
}

/** Flach genug, wenn beide Kontrollpunkte dicht an der Sehne liegen. */
function isFlat(p0: Point, p1: Point, p2: Point, p3: Point, tolerance: number): boolean {
  return pointLineDistance(p1, p0, p3) <= tolerance && pointLineDistance(p2, p0, p3) <= tolerance;
}

function pointLineDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

/**
 * Elliptischer Bogen als Folge kubischer Kurven.
 *
 * Nach der Mittelpunktform aus dem SVG-Anhang: Radien bei Bedarf
 * vergrößern, Mittelpunkt und Winkel bestimmen, dann in Stücke von
 * höchstens 90° zerlegen — darüber wird die Näherung durch Bézierkurven
 * sichtbar schlechter.
 */
export function arcToCubics(
  from: Point,
  rxRaw: number,
  ryRaw: number,
  rotationDeg: number,
  largeArc: number,
  sweep: number,
  to: Point,
): [Point, Point, Point][] {
  // Entartete Fälle sind laut Norm eine Gerade.
  if (rxRaw === 0 || ryRaw === 0) return [[from, to, to]];

  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let rx = Math.abs(rxRaw);
  let ry = Math.abs(ryRaw);

  // In das gedrehte, auf den Kreis gestauchte System rechnen.
  const dx2 = (from.x - to.x) / 2;
  const dy2 = (from.y - to.y) / 2;
  const x1 = cos * dx2 + sin * dy2;
  const y1 = -sin * dx2 + cos * dy2;

  // Zu kleine Radien tragen die Strecke nicht; die Norm streckt sie.
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    const grow = Math.sqrt(lambda);
    rx *= grow;
    ry *= grow;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const factor = denominator === 0 ? 0 : sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cx1 = (factor * rx * y1) / ry;
  const cy1 = (-factor * ry * x1) / rx;

  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;

  const angleOf = (x: number, y: number) => Math.atan2((y - cy1) / ry, (x - cx1) / rx);
  const theta1 = angleOf(x1, y1);
  let delta = angleOf(-x1, -y1) - theta1;
  if (sweep === 0 && delta > 0) delta -= 2 * Math.PI;
  if (sweep === 1 && delta < 0) delta += 2 * Math.PI;

  const steps = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / steps;
  // Griff-Länge, die einen Kreisbogen der Länge `step` am besten trifft.
  const k = (4 / 3) * Math.tan(step / 4);

  const at = (angle: number): Point => ({
    x: cx + cos * rx * Math.cos(angle) - sin * ry * Math.sin(angle),
    y: cy + sin * rx * Math.cos(angle) + cos * ry * Math.sin(angle),
  });
  const derivative = (angle: number): Point => ({
    x: -cos * rx * Math.sin(angle) - sin * ry * Math.cos(angle),
    y: -sin * rx * Math.sin(angle) + cos * ry * Math.cos(angle),
  });

  const out: [Point, Point, Point][] = [];
  for (let i = 0; i < steps; i++) {
    const a0 = theta1 + i * step;
    const a1 = a0 + step;
    const p0 = at(a0);
    const p1 = at(a1);
    const d0 = derivative(a0);
    const d1 = derivative(a1);
    out.push([
      { x: p0.x + k * d0.x, y: p0.y + k * d0.y },
      { x: p1.x - k * d1.x, y: p1.y - k * d1.y },
      p1,
    ]);
  }
  return out;
}

/** Doppelte Punkte wegwerfen; bei geschlossenen Zügen auch den Schlusspunkt. */
function dropRepeats(points: Point[], closed: boolean): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) continue;
    out.push(p);
  }
  if (closed && out.length > 1) {
    const first = out[0] as Point;
    const last = out[out.length - 1] as Point;
    if (Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) out.pop();
  }
  return out;
}

/**
 * Zahlenleser für Pfaddaten.
 *
 * Pfaddaten sind knapp geschrieben: `M10-5.5.25` sind drei Zahlen, und die
 * Flaggen eines Bogens stehen als einzelne Ziffern ohne Trenner
 * (`a1 1 0 011 1`). Ein Regex über die ganze Zeichenkette kann das nicht
 * auseinanderhalten, ein Leser mit Position schon.
 */
class Scanner {
  private i = 0;
  private broken = false;

  constructor(private readonly s: string) {}

  /** Stand hier etwas, das keine Zahl war? Dann ist der Rest nicht zu deuten. */
  failed(): boolean {
    return this.broken;
  }

  done(): boolean {
    this.skip();
    return this.i >= this.s.length;
  }

  /** Bricht das Lesen ab — für Pfaddaten, die nicht zu deuten sind. */
  stop(): void {
    this.i = this.s.length;
  }

  /** Der nächste Befehlsbuchstabe, oder `null` bei einer Zahl. */
  command(): string | null {
    this.skip();
    const c = this.s[this.i];
    if (c && /[a-zA-Z]/.test(c)) {
      this.i++;
      return c;
    }
    return null;
  }

  number(): number {
    this.skip();
    const start = this.i;
    if (this.s[this.i] === '+' || this.s[this.i] === '-') this.i++;
    while (this.isDigit(this.s[this.i])) this.i++;
    if (this.s[this.i] === '.') {
      this.i++;
      while (this.isDigit(this.s[this.i])) this.i++;
    }
    const exponent = this.s[this.i];
    if (exponent === 'e' || exponent === 'E') {
      const mark = this.i;
      this.i++;
      if (this.s[this.i] === '+' || this.s[this.i] === '-') this.i++;
      if (this.isDigit(this.s[this.i])) while (this.isDigit(this.s[this.i])) this.i++;
      else this.i = mark; // `10e` ohne Ziffern: das `e` gehört nicht dazu.
    }
    if (this.i === start) {
      // Hier stand keine Zahl, sondern etwas Unverständliches. Weiterlesen
      // würde endlos auf derselben Stelle drehen.
      this.broken = true;
      this.stop();
      return 0;
    }
    const value = Number(this.s.slice(start, this.i));
    return Number.isFinite(value) ? value : 0;
  }

  /** Eine Flagge des Bogenbefehls: genau eine Ziffer, 0 oder 1. */
  flag(): number {
    this.skip();
    const c = this.s[this.i];
    if (c === '0' || c === '1') {
      this.i++;
      return Number(c);
    }
    // Keine Flagge zu finden: wie 0 behandeln, statt den Pfad zu verlieren.
    return 0;
  }

  private skip(): void {
    while (this.i < this.s.length && /[\s,]/.test(this.s[this.i] as string)) this.i++;
  }

  private isDigit(c: string | undefined): boolean {
    return c !== undefined && c >= '0' && c <= '9';
  }
}
