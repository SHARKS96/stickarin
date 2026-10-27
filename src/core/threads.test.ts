import { describe, expect, it } from 'vitest';
import { THREAD_PALETTE } from './threads.ts';
import type { ThreadChoice } from './threads.ts';
import { toHex } from '../image/color.ts';

describe('Garnfarben', () => {
  it('haben eindeutige Namen', () => {
    const names = THREAD_PALETTE.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('sind gültige Farbwerte', () => {
    for (const t of THREAD_PALETTE) {
      for (const v of [t.rgb.r, t.rgb.g, t.rgb.b]) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
    }
  });

  it('enthalten Schwarz und Weiß', () => {
    // Der Fall, für den es die Auswahl gibt: Negativ-Motiv, Hintergrund weg,
    // übrig bleibt Weiß auf weißem Stoff.
    expect(THREAD_PALETTE.find((t) => t.name === 'Schwarz')).toBeDefined();
    const weiss = THREAD_PALETTE.find((t) => t.name === 'Weiß') as ThreadChoice;
    expect(toHex(weiss.rgb)).toBe('#ffffff');
  });
});
