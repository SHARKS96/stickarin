/**
 * Prüft die Writer gegen die Dateien, die an der Bernina B 590 tatsächlich
 * gestickt wurden (TEST1 vom 25.10.2026, TEST2 vom 26.10.2026).
 */
import { describe, expect, it } from 'vitest';
import { writeExp } from './exp.ts';
import { writeInf } from './inf.ts';
import { writeBmp } from './bmp.ts';
import { centerPlan, planBounds } from '../types.ts';
import type { PlanEntry, StitchPlan, ThreadColor } from '../types.ts';

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');

const plan = (entries: PlanEntry[], threads: ThreadColor[] = []): StitchPlan => ({
  entries,
  threads,
});

const stitch = (x: number, y: number): PlanEntry => ({ kind: 'stitch', x, y });
const jump = (x: number, y: number): PlanEntry => ({ kind: 'jump', x, y });
const trim = (): PlanEntry => ({ kind: 'trim', x: 0, y: 0 });
const colorChange = (): PlanEntry => ({ kind: 'colorChange', x: 0, y: 0 });

describe('writeInf', () => {
  it('erzeugt TEST1.INF Byte für Byte', () => {
    const bytes = writeInf([
      { r: 192, g: 0, b: 0, name: 'Rot', catalog: 'Unknown' },
      { r: 0, g: 80, b: 160, name: 'Blau', catalog: 'Unknown' },
    ]);
    expect(hex(bytes)).toBe(
      '00 00 00 01 00 00 00 08 00 00 00 2f 00 00 00 02 ' +
        '00 15 00 00 c0 00 00 00 01 52 6f 74 00 55 6e 6b 6e 6f 77 6e 00 ' +
        '00 16 00 01 00 50 a0 00 02 42 6c 61 75 00 55 6e 6b 6e 6f 77 6e 00',
    );
    expect(bytes.length).toBe(59);
  });

  it('erzeugt TEST2.INF Byte für Byte', () => {
    const bytes = writeInf([{ r: 0, g: 80, b: 160, name: 'Blau', catalog: 'Test' }]);
    expect(hex(bytes)).toBe(
      '00 00 00 01 00 00 00 08 00 00 00 17 00 00 00 01 ' +
        '00 13 00 00 00 50 a0 00 01 42 6c 61 75 00 54 65 73 74 00',
    );
    expect(bytes.length).toBe(35);
  });

  it('setzt die Restlänge auf Dateigröße minus 12', () => {
    const bytes = writeInf([{ r: 1, g: 2, b: 3, name: 'Ä', catalog: 'x' }]);
    const rest = new DataView(bytes.buffer).getUint32(8, false);
    expect(rest).toBe(bytes.length - 12);
  });
});

describe('writeExp', () => {
  it('schreibt Stiche relativ, in 0,1 mm, mit negiertem Y', () => {
    // 1 mm nach rechts, dann 1 mm nach unten (Y im Modell nach unten).
    const bytes = writeExp(plan([stitch(0, 0), stitch(1, 0), stitch(1, 1)]));
    expect(hex(bytes)).toBe('00 00 0a 00 00 f6');
  });

  it('schreibt Schnitt und Farbwechsel wie pyembroidery', () => {
    const bytes = writeExp(plan([stitch(0, 0), trim(), colorChange(), stitch(0, 0)]));
    expect(hex(bytes)).toBe('00 00 80 80 07 00 80 01 00 00 00 00');
  });

  it('zerlegt Wege über 12,7 mm in gleich lange Teilschritte', () => {
    const bytes = writeExp(plan([stitch(0, 0), stitch(20, 0)]));
    // 200 Einheiten > 127 -> zwei Schritte à 100.
    expect(hex(bytes)).toBe('00 00 64 00 64 00');
  });

  it('wiederholt das Sprungpräfix bei jedem Teilschritt', () => {
    const bytes = writeExp(plan([stitch(0, 0), jump(20, 0)]));
    expect(hex(bytes)).toBe('00 00 80 04 64 00 80 04 64 00 00 00');
  });

  it('setzt nach einer Sprungkette einen Nullstich', () => {
    const bytes = writeExp(plan([stitch(0, 0), jump(5, 0), stitch(5, 0)]));
    expect(hex(bytes)).toBe('00 00 80 04 32 00 00 00 00 00');
  });

  it('kann den Nullstich abschalten', () => {
    const bytes = writeExp(plan([stitch(0, 0), jump(5, 0)]), { nullStitchAfterJump: false });
    expect(hex(bytes)).toBe('00 00 80 04 32 00');
  });

  it('hängt keinen End-Befehl an', () => {
    const bytes = writeExp(plan([stitch(0, 0), stitch(1, 0)]));
    expect(hex(bytes).endsWith('80 80')).toBe(false);
  });

  it('summiert Rundungsfehler über viele Stiche nicht auf', () => {
    // 1000 Stiche à 0,37 mm: die Endposition darf nur um die halbe
    // Einheit (0,05 mm) von 370 mm abweichen.
    const entries: PlanEntry[] = [stitch(0, 0)];
    for (let i = 1; i <= 1000; i++) entries.push(stitch(i * 0.37, 0));
    const bytes = writeExp(plan(entries));
    let x = 0;
    for (let i = 0; i < bytes.length; i += 2) {
      const dx = bytes[i] as number;
      x += dx > 127 ? dx - 256 : dx;
    }
    expect(Math.abs(x / 10 - 370)).toBeLessThanOrEqual(0.05);
  });
});

describe('writeBmp', () => {
  const header = (bytes: Uint8Array) => {
    const v = new DataView(bytes.buffer);
    return {
      signature: String.fromCharCode(bytes[0] as number, bytes[1] as number),
      fileSize: v.getUint32(2, true),
      pixelOffset: v.getUint32(10, true),
      headerSize: v.getUint32(14, true),
      width: v.getInt32(18, true),
      height: v.getInt32(22, true),
      bitsPerPixel: v.getUint16(28, true),
      compression: v.getUint32(30, true),
    };
  };

  it('trifft die Vorschaugröße von TEST1 (30 × 30 mm -> 95 × 95 px)', () => {
    const bytes = writeBmp(plan([stitch(0, 0), stitch(30, 0), stitch(30, 30), stitch(0, 30)]));
    const h = header(bytes);
    expect([h.width, h.height]).toEqual([95, 95]);
    expect(h.signature).toBe('BM');
    expect(h.bitsPerPixel).toBe(24);
    expect(h.compression).toBe(0);
    expect(h.headerSize).toBe(40);
    expect(h.pixelOffset).toBe(54);
    expect(h.fileSize).toBe(bytes.length);
    expect(bytes.length).toBe(27414); // exakt die Größe von TEST1.BMP
  });

  it('trifft die Vorschaugröße von TEST2 (56,9 × 12,0 mm -> 163 × 50 px)', () => {
    const bytes = writeBmp(plan([stitch(0, 0), stitch(56.9, 0), stitch(56.9, 12), stitch(0, 12)]));
    const h = header(bytes);
    expect([h.width, h.height]).toEqual([163, 50]);
    expect(bytes.length).toBe(24654); // exakt die Größe von TEST2.BMP
  });

  it('füllt den Hintergrund weiß', () => {
    const bytes = writeBmp(plan([stitch(0, 0), stitch(10, 10)]));
    expect(hex(bytes.slice(54, 60))).toBe('ff ff ff ff ff ff');
  });
});

describe('centerPlan', () => {
  it('legt die Mitte des Motivs auf den Nullpunkt', () => {
    const p = centerPlan(plan([stitch(10, 20), stitch(30, 40)]));
    const b = planBounds(p);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(0, 9);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(0, 9);
  });

  it('hält den Anfahrtsweg vom Nullpunkt innerhalb des Motivs', () => {
    // Unzentriert fährt die Maschine von (0,0) quer über den Rahmen und
    // bläht die Ausdehnung der Datei auf.
    const far = plan([stitch(100, 100), stitch(110, 110)]);
    const b = planBounds(centerPlan(far));
    expect(Math.max(Math.abs(b.minX), Math.abs(b.maxX))).toBeLessThanOrEqual(5.001);
    expect(Math.max(Math.abs(b.minY), Math.abs(b.maxY))).toBeLessThanOrEqual(5.001);
  });

  it('verschiebt alle Farben gemeinsam und lässt Befehle in Ruhe', () => {
    const p = centerPlan(
      plan(
        [stitch(0, 0), trim(), colorChange(), stitch(10, 10)],
        [{ r: 1, g: 2, b: 3, name: 'A', catalog: 'X' }],
      ),
    );
    expect(p.threads).toHaveLength(1);
    expect(p.entries.map((e) => e.kind)).toEqual(['stitch', 'trim', 'colorChange', 'stitch']);
    expect(p.entries[0]).toEqual({ kind: 'stitch', x: -5, y: -5 });
  });
});
