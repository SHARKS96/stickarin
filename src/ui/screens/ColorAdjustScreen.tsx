/**
 * Schirm 3b: eine Farbe genauer anpassen.
 *
 * Links die Vorlage, rechts das Ergebnis — was dazwischen einzustellen
 * ist, hängt davon ab, woher das Motiv kommt.
 *
 * **Pixelbild:** Die Farben sind geraten. Mit der Pipette wird eine Stelle
 * im Bild angetippt, die nicht gestickt werden soll; die Toleranz
 * bestimmt, wie weit ein Farbton davon abweichen darf und trotzdem noch
 * wegfällt.
 *
 * **Zeichnung:** Da ist nichts zu raten — die Farben stehen in der Datei.
 * Eine Pipette wäre hier sinnlos. Einzustellen bleibt das Garn, mit dem
 * diese Farbe gestickt wird.
 *
 * Alle Farbentscheidungen werden beim Betreten festgehalten, damit
 * „Abbrechen“ wirklich alles so lässt, wie es war.
 */
import { useRef, useState } from 'react';
import { Weniger, Pipette, Hinzufuegen, Zurueck } from '../Icons.tsx';
import { StitchPreview } from '../StitchPreview.tsx';
import { ThreadPicker } from '../ThreadPicker.tsx';
import { toHex } from '../../image/color.ts';
import type { ColorSnapshot, DesignState } from '../../state/useDesign.ts';

interface Props {
  design: DesignState;
  colorIndex: number;
  onDone: () => void;
  onCancel: () => void;
}

export function ColorAdjustScreen({ design, colorIndex, onDone, onCancel }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [picking, setPicking] = useState(true);
  const color = design.colors.find((c) => c.index === colorIndex);
  const vector = design.isVector;

  // Einmal beim Betreten, nicht bei jeder Rechnung: Der Anfangszustand ist
  // das, was „Abbrechen“ wiederherstellt.
  const entryState = useRef<ColorSnapshot | null>(null);
  if (entryState.current === null) entryState.current = design.snapshotColors();

  const cancel = () => {
    design.restoreColors(entryState.current as ColorSnapshot);
    onCancel();
  };

  const pick = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current;
    const work = design.workImage;
    if (!picking || !img || !work) return;
    const rect = img.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * work.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * work.height);
    if (x < 0 || y < 0 || x >= work.width || y >= work.height) return;
    const i = (y * work.width + x) * 4;
    design.addIgnoredSample({
      r: work.data[i] as number,
      g: work.data[i + 1] as number,
      b: work.data[i + 2] as number,
    });
  };

  const picked = design.ignoredSamples;

  return (
    <div className="page">
      <header>
        <h1>Farbe {color ? `„${color.name}“ ` : ''}genauer anpassen</h1>
        <p>
          {vector
            ? 'Hier wählen Sie das Garn, mit dem diese Farbe gestickt wird.'
            : 'Nur nötig, wenn das Ergebnis nicht stimmt.'}
        </p>
      </header>

      <div className="split">
        <div className="stage" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <strong style={{ textAlign: 'center' }}>
              {vector ? 'Ihre Zeichnung' : 'Ihr Bild'}
            </strong>
            <div className="canvas plain">
              {design.source && (
                <img
                  ref={imgRef}
                  className={picking && !vector ? 'armed' : undefined}
                  src={design.source.previewUrl}
                  alt={vector ? 'Ihre Zeichnung' : 'Bild antippen, um eine Farbe auszuwählen'}
                  onClick={pick}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    borderRadius: 12,
                    cursor: picking && !vector ? 'crosshair' : 'default',
                  }}
                />
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <strong style={{ textAlign: 'center' }}>So wird gestickt</strong>
            <div className="canvas">
              {/* Der alte Plan bleibt stehen, solange gerechnet wird — er
                  verschwinden zu lassen, ließe die Hälfte des Schirms
                  zusammenklappen. Der Hinweis sagt, dass das Bild gleich
                  noch wechselt. */}
              {design.plan ? (
                <div className={design.busy ? 'stale' : undefined}>
                  <StitchPreview plan={design.plan} />
                </div>
              ) : (
                <p className="muted">{design.busy ? 'Wird berechnet …' : 'Nichts zu sticken.'}</p>
              )}
              {design.busy && design.plan && <span className="busy overlay">Wird berechnet …</span>}
            </div>
          </div>
        </div>

        <div className="side">
          <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <span
              className="swatch"
              style={{
                width: 68,
                height: 68,
                background: color ? color.hex : 'var(--sunken)',
              }}
            />
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="muted">Gewählte Farbe</span>
              <strong style={{ fontSize: 26 }}>
                {color ? color.name : 'kommt nicht mehr vor'}
              </strong>
            </span>
          </div>

          {vector ? (
            <div className="card">
              <h2>Garnfarbe</h2>
              {color ? (
                <>
                  <ThreadPicker
                    color={color}
                    onPick={(choice) => design.setThreadColor(color.index, choice)}
                  />
                  <p className="muted">
                    {color.threadChosen
                      ? `Wird in „${color.name}“ gestickt statt in der Farbe aus der Zeichnung.`
                      : 'Gestickt wird in der Farbe, die in der Zeichnung steht.'}{' '}
                    In einer Zeichnung sind die Farben festgelegt — es gibt hier nichts zu suchen,
                    nur zu entscheiden, welches Garn dafür auf die Maschine kommt.
                  </p>
                </>
              ) : (
                <p className="muted">Diese Farbe kommt nicht mehr vor.</p>
              )}
            </div>
          ) : (
            <>
              <div className="card">
                <button
                  type="button"
                  className="btn tool block"
                  aria-pressed={picking}
                  onClick={() => setPicking((p) => !p)}
                >
                  <Pipette size={28} />
                  <span className="label">Pipette</span>
                  <span className="state">{picking ? 'an' : 'aus'}</span>
                </button>
                <p className="muted">
                  {picking
                    ? 'Tippen Sie jetzt im linken Bild auf die Stelle, die nicht gestickt werden soll.'
                    : 'Schalten Sie die Pipette an, um eine Farbe direkt im Bild zu wählen.'}
                </p>

                {picked.length > 0 && (
                  <>
                    <div className="picked">
                      <span className="muted">
                        Weggelassen ({picked.length}
                        {picked.length === 1 ? ' Tipp' : ' Tipps'}):
                      </span>
                      <span className="dots">
                        {picked.map((rgb, i) => (
                          <span
                            key={`${toHex(rgb)}-${i}`}
                            className="swatch dot"
                            style={{ background: toHex(rgb) }}
                            title={toHex(rgb)}
                          />
                        ))}
                      </span>
                    </div>
                    <div className="grid-2">
                      <button type="button" className="btn soft" onClick={design.undoIgnoredSample}>
                        <Zurueck size={24} />
                        Letzten
                      </button>
                      <button
                        type="button"
                        className="btn soft"
                        onClick={design.clearIgnoredSamples}
                      >
                        Alle zurück
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="card">
                <label className="field" htmlFor="toleranz">
                  Ähnliche Farbtöne mitnehmen
                </label>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button
                    type="button"
                    className="round small"
                    aria-label="Weniger"
                    onClick={() => design.setTolerance(design.tolerance - 10)}
                  >
                    <Weniger size={26} />
                  </button>
                  <input
                    id="toleranz"
                    type="range"
                    min={0}
                    max={100}
                    step={10}
                    value={design.tolerance}
                    onChange={(e) => design.setTolerance(Number(e.target.value))}
                  />
                  <button
                    type="button"
                    className="round small"
                    aria-label="Mehr"
                    onClick={() => design.setTolerance(design.tolerance + 10)}
                  >
                    <Hinzufuegen size={26} />
                  </button>
                </div>
                <div className="row between muted" style={{ padding: '0 64px' }}>
                  <span>Wenig</span>
                  <span>Viel</span>
                </div>
              </div>
            </>
          )}

          <div className="grid-2 spacer">
            <button type="button" className="btn soft" style={{ minHeight: 72 }} onClick={cancel}>
              Abbrechen
            </button>
            <button type="button" className="btn primary" onClick={onDone}>
              Fertig
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const ADJUST_HELP = [
  'Bei einem Pixelbild: Die Pipette ist an, solange neben ihr „an“ steht. Tippen Sie dann im linken Bild auf die Stelle mit der Farbe, die weg soll.',
  <>
    Mit <strong>−</strong> und <strong>+</strong> bestimmen Sie, ob auch hellere oder dunklere Töne
    dazugehören.
  </>,
  'Ein Tipp zu viel? „Letzten“ nimmt nur den letzten zurück, „Alle“ fängt von vorn an.',
  'Bei einer Zeichnung gibt es nichts zu suchen: Die Farben stehen in der Datei. Hier wählen Sie nur das Garn, mit dem diese Farbe gestickt wird.',
  'Rechts sehen Sie sofort das Ergebnis. „Fertig“ übernimmt die Änderung, „Abbrechen“ lässt alles wie vorher.',
];
