/** Schritt 3: Vorschau und Größe. */
import { HOOPS } from '../core/constants.ts';
import type { HoopId } from '../core/constants.ts';
import { StitchPreview } from './StitchPreview.tsx';
import { AdvancedSettings } from './AdvancedSettings.tsx';
import type { DesignState } from '../state/useDesign.ts';

export function PreviewStep({ design }: { design: DesignState }) {
  const hoop = HOOPS.find((h) => h.id === design.hoopId) ?? HOOPS[0];

  return (
    <>
      <section className="card" aria-labelledby="schritt-vorschau">
        <h2 id="schritt-vorschau">Vorschau</h2>
        <p className="hint">So läuft die Maschine das Motiv ab. Gestrichelt sind Sprünge.</p>

        <div className="row" style={{ gap: 20, marginBottom: 16 }}>
          <label className="field">
            Breite in Millimeter
            <input
              type="number"
              min={10}
              max={400}
              step={1}
              value={Math.round(design.widthMm)}
              onChange={(e) => design.setWidthMm(Number(e.target.value))}
            />
          </label>
          <label className="field">
            Rahmen
            <select
              value={design.hoopId}
              onChange={(e) => design.setHoopId(e.target.value as HoopId)}
            >
              {HOOPS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} · {h.widthMm} × {h.heightMm} mm
                </option>
              ))}
            </select>
          </label>
          <p className="color-meta" style={{ marginTop: 'auto' }}>
            Ergibt {Math.round(design.widthMm)} × {Math.round(design.heightMm)} mm
          </p>
        </div>

        {!design.fitsHoop && (
          <p className="notice" role="alert">
            Das Motiv ist größer als der Rahmen {hoop.name} ({hoop.widthMm} × {hoop.heightMm} mm).
            Breite verkleinern oder größeren Rahmen wählen.
          </p>
        )}

        {design.plan ? (
          <>
            <div className="preview" style={{ marginTop: 16 }}>
              <StitchPreview plan={design.plan} />
            </div>

            {design.stats && (
              <dl className="stats">
                <div>
                  <dt>Stiche</dt>
                  <dd>{design.stats.stitches.toLocaleString('de-DE')}</dd>
                </div>
                <div>
                  <dt>Farbwechsel</dt>
                  <dd>{design.stats.colorChanges}</dd>
                </div>
                <div>
                  <dt>Fadenschnitte</dt>
                  <dd>{design.stats.trims}</dd>
                </div>
                <div>
                  <dt>Sprünge</dt>
                  <dd>{design.stats.jumps}</dd>
                </div>
                <div>
                  <dt>Größe</dt>
                  <dd>
                    {design.stats.widthMm.toFixed(0)} × {design.stats.heightMm.toFixed(0)} mm
                  </dd>
                </div>
                <div>
                  <dt>Stickdauer, grob</dt>
                  <dd>{Math.max(1, Math.round(design.stats.stitches / 1000))} min</dd>
                </div>
              </dl>
            )}
          </>
        ) : (
          <p className="notice">
            Noch keine Flächen gefunden. Mehr Farben zulassen oder weniger Hintergrund ausschließen.
          </p>
        )}
      </section>

      <AdvancedSettings design={design} />
    </>
  );
}
