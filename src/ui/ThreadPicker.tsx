/**
 * Garnfarbe wählen.
 *
 * Die App errät das Garn aus dem Bild. Das stimmt meistens — aber nicht bei
 * einem Negativ-Motiv: Ist der schwarze Hintergrund weggelassen, bleibt das
 * weiße Motiv übrig und würde weiß auf weißem Stoff gestickt. Hier lässt
 * sich das Garn deshalb von Hand setzen, ohne am Bild etwas zu ändern.
 *
 * Wichtig dabei: Die erkannte Bildfarbe bleibt daneben sichtbar. An ihr
 * erkennt man wieder, welche Fläche gemeint ist.
 */
import { THREAD_PALETTE } from '../core/threads.ts';
import type { ThreadChoice } from '../core/threads.ts';
import { fromHex, toHex } from '../image/color.ts';
import { defaultColorName } from '../state/useDesign.ts';
import type { ColorEntry } from '../state/useDesign.ts';

interface Props {
  color: ColorEntry;
  onPick: (choice: ThreadChoice | null) => void;
}

export function ThreadPicker({ color, onPick }: Props) {
  const current = color.threadHex.toLowerCase();

  return (
    <div className="thread-picker">
      <div className="threads" role="group" aria-label="Garnfarbe">
        {THREAD_PALETTE.map((t) => {
          const hex = toHex(t.rgb);
          return (
            <button
              key={t.name}
              type="button"
              className="thread"
              aria-label={t.name}
              aria-pressed={hex.toLowerCase() === current}
              title={t.name}
              style={{ background: hex }}
              onClick={() => onPick(t)}
            />
          );
        })}
      </div>

      <div className="row between">
        <label className="own">
          <input
            type="color"
            value={color.threadHex}
            aria-label="Eigene Garnfarbe"
            onChange={(e) => {
              const rgb = fromHex(e.target.value);
              onPick({ name: defaultColorName(rgb, color.index), rgb });
            }}
          />
          Eigene Farbe
        </label>

        <button
          type="button"
          className="btn soft"
          disabled={!color.threadChosen}
          onClick={() => onPick(null)}
        >
          <span className="swatch small" style={{ background: color.hex }} />
          Bildfarbe
        </button>
      </div>
    </div>
  );
}
