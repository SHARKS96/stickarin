/**
 * Erweiterte Einstellungen je Fläche. Standardmäßig zugeklappt: Die App
 * soll ohne jede Einstellung ein stickbares Ergebnis liefern.
 */
import { defaultSettingsFor } from '../core/pipeline.ts';
import type { StitchType } from '../core/pipeline.ts';
import type { DesignState } from '../state/useDesign.ts';

const STITCH_LABELS: Record<StitchType, string> = {
  fill: 'Füllstich (Fläche)',
  satin: 'Satin (schmale Form)',
  outline: 'Kontur (nur Linie)',
};

export function AdvancedSettings({ design }: { design: DesignState }) {
  if (design.areas.length === 0) return null;

  return (
    <details className="advanced">
      <summary>Erweiterte Einstellungen ({design.areas.length} Flächen)</summary>
      <div className="advanced-body">
        <p className="color-meta" style={{ margin: 0 }}>
          Nur anfassen, wenn das Probesticken etwas anderes verlangt. Die Vorgaben sind so gewählt,
          dass das Stickbild dicht und deckend wird.
        </p>

        {design.areas.map((area, i) => {
          const s = design.areaSettings[i] ?? defaultSettingsFor(area.shape);
          const color = design.colors.find((c) => c.index === area.colorIndex);
          return (
            <div key={i} className="card" style={{ padding: 16 }}>
              <div className="row spread">
                <div className="row" style={{ gap: 10 }}>
                  <span
                    className="swatch"
                    style={{ background: color?.hex ?? '#888', width: 28, height: 28 }}
                    aria-hidden="true"
                  />
                  <strong>
                    Fläche {i + 1} · {area.areaMm2.toFixed(0)} mm²
                  </strong>
                </div>
                <label
                  className="field"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <span>Stichart</span>
                  <select
                    value={s.stitchType}
                    onChange={(e) =>
                      design.setAreaSetting(i, { stitchType: e.target.value as StitchType })
                    }
                  >
                    {(Object.keys(STITCH_LABELS) as StitchType[]).map((t) => (
                      <option key={t} value={t}>
                        {STITCH_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {s.stitchType === 'fill' && (
                <div className="row" style={{ gap: 24, marginTop: 12 }}>
                  <label className="field" style={{ flex: '1 1 200px' }}>
                    Dichte: <strong>{s.spacing.toFixed(2)} mm</strong>{' '}
                    <span className="color-meta">(klein = dicht)</span>
                    <input
                      type="range"
                      min={0.25}
                      max={0.8}
                      step={0.05}
                      value={s.spacing}
                      onChange={(e) =>
                        design.setAreaSetting(i, { spacing: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="field" style={{ flex: '1 1 200px' }}>
                    3D-Effekt: <strong>{s.raisedLayers} Zusatzlagen</strong>
                    <input
                      type="range"
                      min={0}
                      max={3}
                      step={1}
                      value={s.raisedLayers}
                      onChange={(e) =>
                        design.setAreaSetting(i, { raisedLayers: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="field" style={{ flex: '1 1 200px' }}>
                    Winkel: <strong>{Math.round((s.angle * 180) / Math.PI)}°</strong>
                    <input
                      type="range"
                      min={0}
                      max={175}
                      step={5}
                      value={Math.round((s.angle * 180) / Math.PI)}
                      onChange={(e) =>
                        design.setAreaSetting(i, {
                          angle: (Number(e.target.value) * Math.PI) / 180,
                        })
                      }
                    />
                  </label>
                </div>
              )}
            </div>
          );
        })}

        <button type="button" className="ghost" onClick={design.resetAreaSettings}>
          Alle Flächen auf die Vorgabe zurücksetzen
        </button>
      </div>
    </details>
  );
}
