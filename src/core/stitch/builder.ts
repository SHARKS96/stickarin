/**
 * Baut die Stichfolge auf: teilt lange Stiche, verriegelt Fadenstücke,
 * setzt Sprünge und Schnitte.
 */
import {
  MAX_STITCH_MM,
  MIN_STITCH_MM,
  TIE_STITCH_COUNT,
  TIE_STITCH_MM,
  TRAVEL_MAX_MM,
} from '../constants.ts';
import type { PlanEntry, Point } from '../types.ts';

export class StitchBuilder {
  private readonly entries: PlanEntry[] = [];
  private pos: Point | null = null;
  /** Richtung des zuletzt gestickten Stichs; die Verriegelung folgt ihr. */
  private dir: Point = { x: 1, y: 0 };
  /** Läuft gerade ein Fadenstück, das noch verriegelt werden muss? */
  private threadOpen = false;

  get current(): Point | null {
    return this.pos;
  }

  build(): PlanEntry[] {
    return [...this.entries];
  }

  /**
   * Setzt die Nadel an eine neue Stelle: schneidet das laufende Fadenstück
   * ab und springt hin. Das nächste `stitchTo` verriegelt neu.
   */
  moveTo(p: Point): void {
    this.endThread();
    if (this.pos && dist(this.pos, p) < 1e-6) return;
    this.entries.push({ kind: 'jump', x: p.x, y: p.y });
    this.pos = p;
  }

  /** Stich zur Zielposition, bei Bedarf in Teilstiche zerlegt. */
  stitchTo(p: Point, maxLength = MAX_STITCH_MM): void {
    if (!this.pos) {
      this.entries.push({ kind: 'stitch', x: p.x, y: p.y });
      this.pos = p;
      // Verriegelt wird erst, wenn die Nahtrichtung feststeht.
      return;
    }

    const d = dist(this.pos, p);
    if (d < 1e-9) return;
    this.dir = { x: (p.x - this.pos.x) / d, y: (p.y - this.pos.y) / d };

    // Jetzt ist bekannt, wohin die Naht läuft — also kann verriegelt werden.
    if (!this.threadOpen) {
      this.threadOpen = true;
      this.tie(this.pos, this.dir);
    }

    const steps = Math.max(1, Math.ceil(d / maxLength));
    const from = this.pos;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const q = { x: from.x + (p.x - from.x) * t, y: from.y + (p.y - from.y) * t };
      this.entries.push({ kind: 'stitch', x: q.x, y: q.y });
    }
    this.pos = p;
  }

  /**
   * Fährt zum Punkt. Liegt er nah genug, läuft das Garn durch; sonst wird
   * abgeschnitten und gesprungen. Das spart Schnitte überall dort, wo die
   * nächste Lage ohnehin dicht daneben anfängt — etwa zwischen Füllung
   * und Abschlusskontur.
   */
  travelTo(p: Point, maxTravel = TRAVEL_MAX_MM): void {
    if (this.pos && this.threadOpen && dist(this.pos, p) <= maxTravel) {
      this.stitchTo(p);
      return;
    }
    this.moveTo(p);
  }

  /** Reihe von Punkten als Geradstich. */
  runPath(points: Point[], maxLength = MAX_STITCH_MM): void {
    if (points.length === 0) return;
    this.travelTo(points[0] as Point);
    for (const p of points) this.stitchTo(p, maxLength);
  }

  /**
   * Geschlossener Rundlauf.
   *
   * Ein Ring hat keinen vorgegebenen Anfang, also wird dort begonnen, wo
   * die Nadel gerade steht. Das spart den Weg quer über die eben
   * fertiggestellte Fläche — und damit einen Fadenschnitt oder einen
   * sichtbaren Laufstich obendrauf.
   */
  runLoop(points: Point[], maxLength = MAX_STITCH_MM): void {
    if (points.length === 0) return;
    const start = this.pos ? nearestIndex(points, this.pos) : 0;
    const ordered = [...points.slice(start), ...points.slice(0, start)];
    this.runPath([...ordered, ordered[0] as Point], maxLength);
  }

  colorChange(): void {
    this.endThread();
    this.entries.push({ kind: 'colorChange', x: 0, y: 0 });
  }

  /**
   * Verriegelt das laufende Fadenstück und schneidet ab. Ohne offenes
   * Fadenstück passiert nichts.
   */
  endThread(): void {
    if (!this.threadOpen || !this.pos) return;
    // Zurück in die Naht hinein, nicht quer heraus.
    this.tie(this.pos, { x: -this.dir.x, y: -this.dir.y });
    this.entries.push({ kind: 'trim', x: this.pos.x, y: this.pos.y });
    this.threadOpen = false;
  }

  /** Schließt alles ab; danach darf nichts mehr angehängt werden. */
  finish(): PlanEntry[] {
    this.endThread();
    return this.build();
  }

  /**
   * Verriegelung: ein paar Mini-Stiche hin und zurück, damit der Faden
   * nicht aufgeht.
   *
   * Sie läuft **entlang** der Naht, nicht quer dazu — so verschwindet sie
   * unter der Deckschicht, statt seitlich herauszustehen. In TEST2 steht
   * sie als `04 00 fc 00 04 00 fc 00` am Dateianfang: vier Records, die
   * auf dem Ausgangspunkt enden.
   */
  private tie(p: Point, dir: Point): void {
    const a = { x: p.x + dir.x * TIE_STITCH_MM, y: p.y + dir.y * TIE_STITCH_MM };
    for (let i = 0; i < TIE_STITCH_COUNT; i++) {
      const q = i % 2 === 0 ? a : p;
      this.entries.push({ kind: 'stitch', x: q.x, y: q.y });
    }
  }
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Stiche unter der Mindestlänge am Rand vermeiden. */
export function isTooShort(a: Point, b: Point): boolean {
  return dist(a, b) < MIN_STITCH_MM;
}

/** Index des Punktes, der `to` am nächsten liegt. */
function nearestIndex(points: Point[], to: Point): number {
  let best = 0;
  let bestD = Infinity;
  points.forEach((p, i) => {
    const d = dist(p, to);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
