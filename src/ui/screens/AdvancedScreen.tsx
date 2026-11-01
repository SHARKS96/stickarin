/**
 * Schirm 4b: erweiterte Einstellungen je Teil des Motivs.
 *
 * Standardmäßig unerreichbar hinter einem Knopf, weil die Vorgaben schon
 * stimmen sollen. Wer hier landet, hat probegestickt und will etwas ändern.
 *
 * Ein Teil ist entweder eine **Fläche** oder ein **Strich**. Flächen gibt
 * es auf beiden Wegen, Striche nur aus einer Zeichnung: Aus Pixeln lässt
 * sich nicht ablesen, ob eine dünne Spur als Linie gemeint war. Darum
 * stehen für Striche auch andere Sticharten zur Wahl — ein Strich wird
 * entlang seines Pfades gestickt und nicht gefüllt.
 */
import { useState } from 'react';
import {
  DENSITY_LEVELS,
  LINE_SATIN_MIN_WIDTH_MM,
  SATIN_MAX_WIDTH_MM,
} from '../../core/constants.ts';
import type { LineSettings, StitchType } from '../../core/pipeline.ts';
import { Weniger, Hinzufuegen, Fuellstich, Satinstich, Geradstich } from '../Icons.tsx';
import { ThreadPicker } from '../ThreadPicker.tsx';
import { StitchPreview } from '../StitchPreview.tsx';
import type { AreaView, DesignState, LineView } from '../../state/useDesign.ts';

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

const LINE_LABELS: {
  id: LineSettings['stitchType'];
  label: string;
  hint: string;
  icon: typeof Fuellstich;
}[] = [
  {
    id: 'run',
    label: 'Steppstich',
    hint: 'Eine Reihe Stiche auf der Linie – für dünne Striche.',
    icon: Geradstich,
  },
  {
    id: 'satin',
    label: 'Satin',
    hint: 'Zickzack in Strichbreite – glänzend, aber erst ab etwa einem Millimeter sinnvoll.',
    icon: Satinstich,
  },
];

/** Ein auswählbarer Teil des Motivs. */
type Part = { kind: 'area'; view: AreaView } | { kind: 'line'; view: LineView };

/** Millimeter mit einer Stelle, deutsch geschrieben. */
function mm(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

export function AdvancedScreen({ design, onDone }: { design: DesignState; onDone: () => void }) {
  const [selected, setSelected] = useState(0);

  const parts: Part[] = [
    ...design.areas.map((view): Part => ({ kind: 'area', view })),
    ...design.lines.map((view): Part => ({ kind: 'line', view })),
  ];
  const part = parts[selected];

  const colorOf = (colorIndex: number) => design.colors.find((c) => c.index === colorIndex);
  const color = part ? colorOf(part.view.colorIndex) : undefined;

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
            {parts.map((p, i) => {
              const c = colorOf(p.view.colorIndex);
              return (
                <button
                  key={`${p.kind}-${p.view.index}`}
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
                  {p.kind === 'area'
                    ? `${i + 1}. Fläche · ${Math.round(p.view.areaMm2)} mm²`
                    : `${i + 1}. Strich · ${Math.round(p.view.lengthMm)} mm lang`}
                </button>
              );
            })}
            {parts.length === 0 && <span className="muted">Keine Teile gefunden.</span>}
          </div>
        </div>

        <div className="side">
          {part ? (
            <>
              {part.kind === 'area' ? (
                <AreaCards design={design} area={part.view} />
              ) : (
                <LineCards design={design} line={part.view} />
              )}

              {color && (
                <div className="card">
                  <h2>Garnfarbe</h2>
                  <ThreadPicker
                    color={color}
                    onPick={(choice) => design.setThreadColor(color.index, choice)}
                  />
                  <p className="muted">
                    {color.threadChosen
                      ? `Wird in „${color.name}“ gestickt statt in der Farbe aus der Vorlage.`
                      : 'Gestickt wird in der Farbe, die in der Vorlage erkannt wurde.'}{' '}
                    Die Farbe gilt für alle Teile dieses Garns — die Maschine fädelt pro Garn nur
                    einmal um.
                  </p>
                </div>
              )}

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

/** Stichart, Dichte und 3D — alles, was nur eine Fläche hat. */
function AreaCards({ design, area }: { design: DesignState; area: AreaView }) {
  return (
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
              Diese Fläche ist quer dazu im Mittel <strong>{mm(area.satinWidthMm)} mm</strong> breit
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
    </>
  );
}

/**
 * Stichart eines Strichs.
 *
 * Dichte und 3D-Effekt fehlen hier mit Absicht: Der Abstand der Stiche ist
 * beim Steppstich die Stichlänge und beim Satin der Reihenabstand — beides
 * steckt in der Stichart. Eine Unterlage hat ein Strich ohnehin.
 */
function LineCards({ design, line }: { design: DesignState; line: LineView }) {
  return (
    <div className="card">
      <h2>Stichart</h2>
      <div className="segments">
        {LINE_LABELS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={line.stitchType === s.id}
            onClick={() => design.setLineSetting(line.index, { stitchType: s.id })}
          >
            <s.icon size={24} />
            {s.label}
          </button>
        ))}
      </div>
      <p className="muted">
        {LINE_LABELS.find((s) => s.id === line.stitchType)?.hint} Dieser Strich ist{' '}
        <strong>{mm(line.widthMm)} mm</strong> breit und <strong>{mm(line.lengthMm)} mm</strong>{' '}
        lang.
        {line.stitchType === 'satin' && line.widthMm < LINE_SATIN_MIN_WIDTH_MM && (
          <>
            {' '}
            So dünn besteht ein Satinstich fast nur aus Einstichlöchern — „Steppstich“ sieht hier
            besser aus und löchert den Stoff nicht.
          </>
        )}
      </p>
    </div>
  );
}

export const ADVANCED_HELP = [
  'Tippen Sie unten auf einen Teil des Motivs.',
  'Stellen Sie rechts Stichart, Dichte oder den 3D-Effekt nur für diesen Teil ein.',
  'Striche aus einer Zeichnung werden entlang ihrer Linie gestickt: dünne als Steppstich, breitere als Satin.',
  'Unter „Garnfarbe“ wählen Sie, mit welchem Garn gestickt wird — unabhängig davon, welche Farbe in der Vorlage stand.',
  'Unsicher? „Zurücksetzen“ stellt die empfohlenen Werte wieder her.',
];
