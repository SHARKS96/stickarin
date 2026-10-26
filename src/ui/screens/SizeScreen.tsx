/** Schritt 2: Größe und Rahmen. Das Motiv bleibt immer im Rahmen. */
import { HOOPS } from '../../core/constants.ts';
import { SIZE_STEP_MM } from '../../core/constants.ts';
import type { HoopId } from '../../core/constants.ts';
import { Weiter, Weniger, Hinzufuegen, Drehen } from '../Icons.tsx';
import type { DesignState } from '../../state/useDesign.ts';

/** Millimeter als „8,0 cm“. */
export function cm(mm: number): string {
  return `${cmNumber(mm)} cm`;
}

/** Nur die Zahl — für „8,0 × 6,0 cm“, wo die Einheit einmal reicht. */
export function cmNumber(mm: number): string {
  return (mm / 10).toFixed(1).replace('.', ',');
}

/** Die Darstellung des Rahmens soll in diesen Kasten passen. */
const STAGE_W = 560;
const STAGE_H = 330;

export function SizeScreen({ design, onNext }: { design: DesignState; onNext: () => void }) {
  const { hoop, outerWidth, outerHeight } = design;
  const scale = Math.min(STAGE_W / hoop.widthMm, STAGE_H / hoop.heightMm);
  const atMax = design.widthMm >= design.maxWidthMm;
  const atMin = design.widthMm <= 20;

  return (
    <div className="page">
      <header>
        <h1>Wie groß soll das Motiv werden?</h1>
        <p>So sieht es später im Stickrahmen aus.</p>
      </header>

      <div className="split">
        <div className="stage">
          <div className="canvas plain">
            <div
              className="hoop"
              style={{
                width: Math.round(hoop.widthMm * scale),
                height: Math.round(hoop.heightMm * scale),
              }}
            >
              <div
                className="motif"
                style={{
                  width: Math.round(outerWidth * scale),
                  height: Math.round(outerHeight * scale),
                }}
              >
                {design.image && (
                  <img
                    src={design.image.previewUrl}
                    alt="Motiv im Stickrahmen"
                    style={{ transform: `rotate(${design.rotationDeg}deg)` }}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="row between">
            <span className="muted">
              Motiv {cm(outerWidth)} × {cm(outerHeight)} · Rahmen {hoop.name}
            </span>
            <button type="button" className="btn soft" onClick={design.rotate}>
              <Drehen size={26} />
              Drehen
            </button>
          </div>
        </div>

        <div className="side">
          <div className="card">
            <h2>Größe</h2>
            <div className="stepper">
              <button
                type="button"
                className="round"
                aria-label="Kleiner"
                disabled={atMin}
                onClick={() => design.setWidthMm(design.widthMm - SIZE_STEP_MM)}
              >
                <Weniger size={34} />
              </button>
              <span className="value">{cm(design.widthMm)}</span>
              <button
                type="button"
                className="round"
                aria-label="Größer"
                disabled={atMax}
                onClick={() => design.setWidthMm(design.widthMm + SIZE_STEP_MM)}
              >
                <Hinzufuegen size={34} />
              </button>
            </div>
            <p className="muted">
              {atMax
                ? 'Größer passt nicht in diesen Rahmen. Wählen Sie einen größeren Rahmen.'
                : 'Breite und Höhe ändern sich gemeinsam.'}
            </p>
          </div>

          <div className="card" role="radiogroup" aria-label="Stickrahmen">
            <h2>Stickrahmen</h2>
            {HOOPS.map((h) => (
              <button
                key={h.id}
                type="button"
                role="radio"
                className="choice"
                aria-checked={h.id === design.hoopId}
                onClick={() => design.setHoopId(h.id as HoopId)}
              >
                <span className="radio" />
                {h.name}
                <span className="trail">
                  {h.widthMm} × {h.heightMm} mm
                </span>
              </button>
            ))}
          </div>

          <button type="button" className="btn primary block spacer" onClick={onNext}>
            Weiter
            <Weiter size={26} />
          </button>
        </div>
      </div>
    </div>
  );
}

export const SIZE_HELP = [
  'Wählen Sie rechts den Rahmen, den Sie an der Maschine einspannen.',
  <>
    Mit <strong>−</strong> und <strong>+</strong> machen Sie das Motiv kleiner oder größer. Es
    bleibt immer innerhalb der gestrichelten Linie.
  </>,
  '„Drehen“ dreht das Motiv jedes Mal um eine Vierteldrehung.',
];
