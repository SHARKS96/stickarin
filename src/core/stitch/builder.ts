/**
 * Baut die Stichfolge auf: teilt lange Stiche, verriegelt Fadenstücke,
 * setzt Sprünge und Schnitte.
 */
import { MAX_STITCH_MM, MIN_STITCH_MM, TIE_STITCH_COUNT, TIE_STITCH_MM } from '../constants.ts';
import type { PlanEntry, Point } from '../types.ts';

export class StitchBuilder {
  private readonly entries: PlanEntry[] = [];
  private pos: Point | null = null;
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
      this.startThread();
      return;
    }
    this.startThread();

    const d = dist(this.pos, p);
    if (d < 1e-9) return;
    const steps = Math.max(1, Math.ceil(d / maxLength));
    const from = this.pos;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const q = { x: from.x + (p.x - from.x) * t, y: from.y + (p.y - from.y) * t };
      this.entries.push({ kind: 'stitch', x: q.x, y: q.y });
    }
    this.pos = p;
  }

  /** Reihe von Punkten als Geradstich. */
  runPath(points: Point[], maxLength = MAX_STITCH_MM): void {
    if (points.length === 0) return;
    this.moveTo(points[0] as Point);
    for (const p of points) this.stitchTo(p, maxLength);
  }

  /** Geschlossener Rundlauf. */
  runLoop(points: Point[], maxLength = MAX_STITCH_MM): void {
    if (points.length === 0) return;
    this.runPath([...points, points[0] as Point], maxLength);
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
    this.tie();
    this.entries.push({ kind: 'trim', x: this.pos.x, y: this.pos.y });
    this.threadOpen = false;
  }

  /** Schließt alles ab; danach darf nichts mehr angehängt werden. */
  finish(): PlanEntry[] {
    this.endThread();
    return this.build();
  }

  private startThread(): void {
    if (this.threadOpen) return;
    this.threadOpen = true;
    this.tie();
  }

  /**
   * Verriegelung: ein paar Mini-Stiche vor und zurück, damit der Faden
   * nicht aufgeht. In TEST2 steht das als `04 00 fc 00 04 00 fc 00`
   * am Anfang der Datei.
   */
  private tie(): void {
    const p = this.pos;
    if (!p) return;
    // Richtung des nächsten/letzten Stichs ist hier nicht bekannt,
    // deshalb entlang X — so macht es auch stickcore.mjs.
    for (let i = 0; i < TIE_STITCH_COUNT; i++) {
      const dx = i % 2 === 0 ? TIE_STITCH_MM : -TIE_STITCH_MM;
      this.entries.push({ kind: 'stitch', x: p.x + dx, y: p.y });
    }
    this.entries.push({ kind: 'stitch', x: p.x, y: p.y });
  }
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Stiche unter der Mindestlänge am Rand vermeiden. */
export function isTooShort(a: Point, b: Point): boolean {
  return dist(a, b) < MIN_STITCH_MM;
}
