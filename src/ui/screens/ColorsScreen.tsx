/**
 * Schritt 3: Farben.
 *
 * Links eine Vorschau, in der weggelassene Farben als Karomuster
 * durchscheinen; rechts die Garnliste mit Schaltern.
 */
import { ChevronRight, Minus, Pipette, Plus } from '../Icons.tsx';
import { StitchPreview } from '../StitchPreview.tsx';
import type { DesignState } from '../../state/useDesign.ts';

interface Props {
  design: DesignState;
  onAdjust: (colorIndex: number) => void;
  onNext: () => void;
}

export function ColorsScreen({ design, onAdjust, onNext }: Props) {
  const stitched = design.colors.filter((c) => !c.ignored).length;

  return (
    <div className="page">
      <header>
        <h1>Welche Farben sollen gestickt werden?</h1>
        <p>
          Den Hintergrund haben wir schon ausgeschaltet. Mit dem Schalter lassen Sie weitere Farben
          weg.
        </p>
      </header>

      <div className="split">
        <div className="stage">
          <div className="canvas">
            {design.plan ? (
              <StitchPreview plan={design.plan} />
            ) : (
              <p className="muted">{design.busy ? 'Wird berechnet …' : 'Noch keine Flächen.'}</p>
            )}
          </div>
          <p className="muted" style={{ textAlign: 'center' }}>
            Der helle Untergrund ist der Stoff — dort wird nicht gestickt.
          </p>
        </div>

        <div className="side">
          <div className="card" style={{ flex: 1, minHeight: 0 }}>
            <div className="row between">
              <h2>Anzahl Farben</h2>
              <div className="stepper compact">
                <button
                  type="button"
                  className="round small"
                  aria-label="Weniger Farben"
                  disabled={design.colorCount <= 1}
                  onClick={() => design.setColorCount(design.colorCount - 1)}
                >
                  <Minus size={28} />
                </button>
                <span className="value">{design.colorCount}</span>
                <button
                  type="button"
                  className="round small"
                  aria-label="Mehr Farben"
                  disabled={design.colorCount >= 8}
                  onClick={() => design.setColorCount(design.colorCount + 1)}
                >
                  <Plus size={28} />
                </button>
              </div>
            </div>

            <ul className="colors">
              {design.colors.map((c) => (
                <li key={c.index} className="color-row">
                  <span
                    className="swatch"
                    style={{ background: c.hex, opacity: c.ignored ? 0.35 : 1 }}
                  />
                  <span className="text">
                    <b>{c.name}</b>
                    <span>{c.ignored ? 'wird nicht gestickt' : 'wird gestickt'}</span>
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`${c.name} genauer anpassen`}
                    onClick={() => onAdjust(c.index)}
                  >
                    <Pipette size={26} />
                  </button>
                  <button
                    type="button"
                    role="switch"
                    className="switch"
                    aria-checked={!c.ignored}
                    aria-label={`${c.name} sticken`}
                    onClick={() => design.toggleColorIgnored(c.index)}
                  >
                    <span className="knob" />
                  </button>
                </li>
              ))}
              {design.colors.length === 0 && (
                <li className="muted">
                  {design.busy ? 'Farben werden gesucht …' : 'Keine Farben gefunden.'}
                </li>
              )}
            </ul>

            <p className="muted">
              {stitched === 0
                ? 'Mindestens eine Farbe muss gestickt werden.'
                : `${stitched} Garn${stitched === 1 ? '' : 'e'} — so oft hält die Maschine zum Umfädeln an.`}
            </p>
          </div>

          <button
            type="button"
            className="btn primary block"
            disabled={stitched === 0 || !design.plan}
            onClick={onNext}
          >
            Weiter
            <ChevronRight size={26} />
          </button>
        </div>
      </div>
    </div>
  );
}

export const COLORS_HELP = [
  <>
    Jede Farbe in der Liste ist später ein Garn. Mit <strong>−</strong> und <strong>+</strong> legen
    Sie fest, wie viele Farben es sein sollen.
  </>,
  <>
    Schalter <strong>grün</strong> = wird gestickt, Schalter <strong>grau</strong> = wird
    weggelassen. Den Hintergrund lassen Sie meistens aus.
  </>,
  'Stimmt eine Farbe nicht? Tippen Sie auf das Pipetten-Symbol daneben.',
];
