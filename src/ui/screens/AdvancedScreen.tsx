/**
 * Schirm 4b: erweiterte Einstellungen je Fläche.
 *
 * Standardmäßig unerreichbar hinter einem Knopf, weil die Vorgaben schon
 * stimmen sollen. Wer hier landet, hat probegestickt und will etwas ändern.
 */
import { useState } from 'react';
import { DENSITY_LEVELS, SATIN_MAX_WIDTH_MM } from '../../core/constants.ts';
import type { StitchType } from '../../core/pipeline.ts';
import { Weniger, Hinzufuegen, Fuellstich, Satinstich, Geradstich } from '../Icons.tsx';
import { ThreadPicker } from '../ThreadPicker.tsx';
import { StitchPreview } from '../StitchPreview.tsx';
import type { DesignState } from '../../state/useDesign.ts';

const STITCH_LABELS: {
  id: StitchType;
  label: string;
  hint: string;
  icon: typeof Fuellstich;
}[] = [
  { id: 'fill', label: 'Füllung', hint: 'Für Flächen – deckt gut ab.', icon: Fuellstich },
  { id: 'satin', label: 'Satin', hint: 'Glänzend – für schmale Formen.', icon: Satinstich },
  {
    id: 'outline',
    label: 'Linie',
    hint: 'Nur die Umrandung wird gestickt.',
    icon: Geradstich,
  },
];

export function AdvancedScreen({ design, onDone }: { design: DesignState; onDone: () => void }) {
  const [selected, setSelected] = useState(0);
  const area = design.areas[selected];

  const colorOf = (colorIndex: number) => design.colors.find((c) => c.index === colorIndex);
  const color = area ? colorOf(area.colorIndex) : undefined;

  return (
    <div className="page">
      <header>
        <h1>Erweiterte Einstellungen</h1>
        <p>Erst einen Teil des Motivs antippen, dann rechts einstellen.</p>
      </header>

      <div className="split">
        <div className="stage">
          <div className="canvas">
            {design.plan ? (
              <StitchPreview plan={design.plan} />
            ) : (
              <p className="muted">Nichts zu zeigen.</p>
            )}
          </div>

          <div className="row">
            {design.areas.map((a, i) => {
              const c = colorOf(a.colorIndex);
              return (
                <button
                  key={a.index}
                  type="button"
                  role="radio"
                  aria-checked={i === selected}
                  className="btn"
                  style={{
                    minHeight: 52,
                    fontSize: 19,
                    background: i === selected ? 'var(--accent)' : 'var(--bg)',
                    color: i === selected ? '#fff' : 'var(--ink)',
                  }}
                  onClick={() => setSelected(i)}
                >
                  <span
                    className="swatch small"
                    style={{ background: c?.threadHex ?? '#888', width: 22, height: 22 }}
                  />
                  {i + 1}. Fläche · {Math.round(a.areaMm2)} mm²
                </button>
              );
            })}
            {design.areas.length === 0 && <span className="muted">Keine Flächen gefunden.</span>}
          </div>
        </div>

        <div className="side">
          {area ? (
            <>
              <div className="card">
                <h2>Stichart</h2>
                <div className="segments">
                  {STITCH_LABELS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={area.stitchType === s.id}
                      onClick={() => design.setAreaSetting(area.index, { stitchType: s.id })}
                    >
                      <s.icon size={24} />
                      {s.label}
                    </button>
                  ))}
                </div>
                <p className="muted">
                  {STITCH_LABELS.find((s) => s.id === area.stitchType)?.hint}
                  {area.stitchType === 'satin' && (
                    <>
                      {' '}
                      Diese Fläche ist quer dazu im Mittel{' '}
                      <strong>{area.satinWidthMm.toFixed(1).replace('.', ',')} mm</strong> breit
                      {area.satinWidthMm > SATIN_MAX_WIDTH_MM
                        ? ' — mehr, als ein Satinstich am Stück tragen kann. Die Stiche werden unterteilt; meist sieht „Füllung“ hier besser aus.'
                        : '.'}
                    </>
                  )}
                </p>
              </div>

              <div className="card">
                <h2>Dichte</h2>
                <div className="stepper compact">
                  <button
                    type="button"
                    className="round small"
                    aria-label="Lockerer"
                    disabled={area.densityLevel <= 0}
                    onClick={() =>
                      design.setAreaSetting(area.index, { densityLevel: area.densityLevel - 1 })
                    }
                  >
                    <Weniger size={26} />
                  </button>
                  <span className="value" style={{ fontSize: 24 }}>
                    {DENSITY_LEVELS[area.densityLevel]?.label}
                  </span>
                  <button
                    type="button"
                    className="round small"
                    aria-label="Dichter"
                    disabled={area.densityLevel >= DENSITY_LEVELS.length - 1}
                    onClick={() =>
                      design.setAreaSetting(area.index, { densityLevel: area.densityLevel + 1 })
                    }
                  >
                    <Hinzufuegen size={26} />
                  </button>
                </div>
                <p className="muted">
                  Dichter deckt besser, braucht aber mehr Garn und zieht den Stoff stärker zusammen.
                </p>
              </div>

              {color && (
                <div className="card">
                  <h2>Garnfarbe</h2>
                  <ThreadPicker
                    color={color}
                    onPick={(choice) => design.setThreadColor(color.index, choice)}
                  />
                  <p className="muted">
                    {color.threadChosen
                      ? `Wird in „${color.name}“ gestickt statt in der Farbe aus dem Bild.`
                      : 'Gestickt wird in der Farbe, die im Bild erkannt wurde.'}{' '}
                    Die Farbe gilt für alle Flächen dieses Garns — die Maschine fädelt pro Garn nur
                    einmal um.
                  </p>
                </div>
              )}

              <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <span style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: 21 }}>Erhaben (3D-Effekt)</strong>
                  <span className="muted">Fläche wird etwas dicker gestickt</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  className="switch"
                  aria-checked={area.raised}
                  aria-label="3D-Effekt"
                  onClick={() => design.setAreaSetting(area.index, { raised: !area.raised })}
                >
                  <span className="knob" />
                </button>
              </div>

              <div className="grid-2 spacer">
                <button
                  type="button"
                  className="btn soft"
                  style={{ minHeight: 72 }}
                  onClick={design.resetAreaSettings}
                >
                  Zurücksetzen
                </button>
                <button type="button" className="btn primary" onClick={onDone}>
                  Fertig
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="empty">
                Erst ein Motiv erzeugen, dann lässt sich hier etwas einstellen.
              </p>
              <button type="button" className="btn primary block spacer" onClick={onDone}>
                Fertig
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export const ADVANCED_HELP = [
  'Tippen Sie unten auf einen Teil des Motivs.',
  'Stellen Sie rechts Stichart, Dichte oder den 3D-Effekt nur für diesen Teil ein.',
  'Unter „Garnfarbe“ wählen Sie, mit welchem Garn gestickt wird — unabhängig davon, welche Farbe im Bild stand.',
  'Unsicher? „Zurücksetzen“ stellt die empfohlenen Werte wieder her.',
];
