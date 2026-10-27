/**
 * EXP-Writer (Melco / Bernina).
 *
 * Das Format hat keinen Header: Byte 0 ist schon der erste Stich. Jedes
 * Byte-Paar ist (dx, dy) relativ zur letzten Position, signed 8 Bit in
 * 0,1 mm. Beginnt ein Paar mit 0x80, ist es ein Befehl.
 *
 * Gegen die Maschinentests TEST1/TEST2 (Bernina B 590) verifiziert; die
 * erzeugten Bytes sind strukturgleich zu pyembroidery.
 */
import { MAX_STEP_UNITS } from '../constants.ts';
import type { StitchPlan } from '../types.ts';

const CMD = 0x80;

export interface ExpOptions {
  /**
   * Nach einer Sprungkette einen Nullstich `00 00` setzen, damit die
   * Zielposition sicher als Einstich gesetzt wird. Entspricht dem,
   * was in TEST1/TEST2 in der Datei steht.
   */
  nullStitchAfterJump?: boolean;
}

/** mm -> 0,1-mm-Einheiten. */
function toUnits(mm: number): number {
  return mm * 10;
}

/** Zweierkomplement-Byte aus einem Wert in −127…+127. */
function signedByte(v: number): number {
  return v & 0xff;
}

/**
 * Schreibt den Stichplan als EXP.
 *
 * Wege über 12,7 mm werden in gleich lange Teilschritte zerlegt; ein Sprung
 * bekommt das Präfix `80 04` bei **jedem** Teilschritt neu. Y wird beim
 * Schreiben negiert, weil die Maschine Y nach oben zählt.
 */
export function writeExp(plan: StitchPlan, options: ExpOptions = {}): Uint8Array {
  const { nullStitchAfterJump = true } = options;
  const out: number[] = [];

  // Position in ganzen 0,1-mm-Einheiten mitführen, damit sich Rundungsfehler
  // nicht über tausende Stiche aufaddieren.
  let curX = 0;
  let curY = 0;
  let started = false;
  let inJumpChain = false;

  const closeJumpChain = () => {
    if (inJumpChain && nullStitchAfterJump) out.push(0x00, 0x00);
    inJumpChain = false;
  };

  for (const entry of plan.entries) {
    if (entry.kind === 'trim') {
      closeJumpChain();
      out.push(CMD, 0x80, 0x07, 0x00);
      continue;
    }
    if (entry.kind === 'colorChange') {
      closeJumpChain();
      out.push(CMD, 0x01, 0x00, 0x00);
      continue;
    }

    const isJump = entry.kind === 'jump';
    if (!isJump) closeJumpChain();

    const targetX = Math.round(toUnits(entry.x));
    const targetY = Math.round(toUnits(entry.y));

    // Der erste Punkt **ist** der Ursprung: Dort steht die Nadel, wenn die
    // Maschine anfängt. Würde der Writer stattdessen vom Nullpunkt dorthin
    // fahren, gehörte dieser Anfahrtsweg zur Ausdehnung der Datei — ein
    // 40-mm-Motiv käme als 47 mm breit heraus. So macht es auch
    // `reference/stickcore.mjs`, mit der TEST2 erzeugt wurde.
    if (!started) {
      started = true;
      curX = targetX;
      curY = targetY;
      out.push(0x00, 0x00);
      continue;
    }
    const totalX = targetX - curX;
    const totalY = targetY - curY;
    if (totalX === 0 && totalY === 0 && !isJump) {
      out.push(0x00, 0x00);
      continue;
    }

    const steps = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(totalX), Math.abs(totalY)) / MAX_STEP_UNITS),
    );
    const startX = curX;
    const startY = curY;
    for (let i = 1; i <= steps; i++) {
      const stepX = Math.round(startX + (totalX * i) / steps) - curX;
      const stepY = Math.round(startY + (totalY * i) / steps) - curY;
      if (isJump) out.push(CMD, 0x04);
      // Y negieren: Datenmodell zählt Y nach unten, die Maschine nach oben.
      out.push(signedByte(stepX), signedByte(-stepY));
      curX += stepX;
      curY += stepY;
    }

    if (isJump) inJumpChain = true;
  }

  closeJumpChain();
  // pyembroidery schreibt keinen End-Befehl, die Datei endet einfach.
  return Uint8Array.from(out);
}
