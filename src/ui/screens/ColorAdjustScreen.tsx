/**
 * Schirm 3b: eine Farbe genauer anpassen.
 *
 * Links das Originalbild mit der Pipette, rechts das Ergebnis. Die
 * Toleranz bestimmt, wie weit ein Farbton von der getippten Stelle
 * abweichen darf und trotzdem noch weggelassen wird.
 */
import { useRef, useState } from 'react';
import { Minus, Pipette, Plus } from '../Icons.tsx';
import { StitchPreview } from '../StitchPreview.tsx';
import type { DesignState } from '../../state/useDesign.ts';

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

  const pick = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current;
    const work = design.image?.work;
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

  return (
    <div className="page">
      <header>
        <h1>Farbe {color ? `„${color.name}“ ` : ''}genauer anpassen</h1>
        <p>Nur nötig, wenn das Ergebnis nicht stimmt.</p>
      </header>

      <div className="split">
        <div className="stage" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <strong style={{ textAlign: 'center' }}>Ihr Bild</strong>
            <div className="canvas plain">
              {design.image && (
                <img
                  ref={imgRef}
                  src={design.image.previewUrl}
                  alt="Bild antippen, um eine Farbe auszuwählen"
                  onClick={pick}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    borderRadius: 12,
                    cursor: picking ? 'crosshair' : 'default',
                  }}
                />
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <strong style={{ textAlign: 'center' }}>So wird gestickt</strong>
            <div className="canvas">
              {design.plan ? (
                <StitchPreview plan={design.plan} />
              ) : (
                <p className="muted">{design.busy ? 'Wird berechnet …' : 'Nichts zu sticken.'}</p>
              )}
            </div>
          </div>
        </div>

        <div className="side">
          {color && (
            <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
              <span className="swatch" style={{ width: 68, height: 68, background: color.hex }} />
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="muted">Gewählte Farbe</span>
                <strong style={{ fontSize: 26 }}>{color.name}</strong>
              </span>
            </div>
          )}

          <div className="card">
            <button
              type="button"
              className={picking ? 'btn primary block' : 'btn soft block'}
              aria-pressed={picking}
              style={{ minHeight: 64, fontSize: 22 }}
              onClick={() => setPicking((p) => !p)}
            >
              <Pipette size={28} />
              Pipette
            </button>
            <p className="muted">
              {picking
                ? 'Tippen Sie jetzt im linken Bild auf die Stelle, die nicht gestickt werden soll.'
                : 'Mit der Pipette wählen Sie die Farbe direkt im Bild.'}
            </p>
            {design.ignoredSamples.length > 0 && (
              <button type="button" className="btn soft block" onClick={design.clearIgnoredSamples}>
                {design.ignoredSamples.length} Auswahl
                {design.ignoredSamples.length === 1 ? '' : 'en'} zurücksetzen
              </button>
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
                <Minus size={26} />
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
                <Plus size={26} />
              </button>
            </div>
            <div className="row between muted" style={{ padding: '0 64px' }}>
              <span>Wenig</span>
              <span>Viel</span>
            </div>
          </div>

          <div className="grid-2 spacer">
            <button type="button" className="btn soft" style={{ minHeight: 72 }} onClick={onCancel}>
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
  'Tippen Sie auf „Pipette“ und dann im linken Bild auf die Stelle mit der Farbe, die weg soll.',
  <>
    Mit <strong>−</strong> und <strong>+</strong> bestimmen Sie, ob auch hellere oder dunklere Töne
    dazugehören.
  </>,
  'Rechts sehen Sie sofort das Ergebnis. „Fertig“ übernimmt die Änderung, „Abbrechen“ lässt alles wie vorher.',
];
