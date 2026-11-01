/** Schritt 4: Vorschau, Kennzahlen und die Reihenfolge der Garne. */
import { useState } from 'react';
import { Weiter, Einstellungen, Garn } from '../Icons.tsx';
import { ThreadPicker } from '../ThreadPicker.tsx';
import { StitchPreview } from '../StitchPreview.tsx';
import { cm, cmNumber } from './SizeScreen.tsx';
import type { DesignState } from '../../state/useDesign.ts';

interface Props {
  design: DesignState;
  onAdvanced: () => void;
  onNext: () => void;
}

/** Die B 590 schafft 1.000 Stiche je Minute; mit Umfädeln etwas weniger. */
function minutes(stitches: number, colorChanges: number): number {
  return Math.max(1, Math.round(stitches / 900 + colorChanges * 0.75));
}

export function PreviewScreen({ design, onAdvanced, onNext }: Props) {
  const [view, setView] = useState<'stick' | 'orig'>('stick');
  // Welche Garnfarbe gerade zur Auswahl aufgeklappt ist; `null` = keine.
  const [picking, setPicking] = useState<number | null>(null);
  const stitched = design.colors.filter((c) => !c.ignored);

  return (
    <div className="page">
      <header>
        <h1>So wird Ihr Stickbild aussehen</h1>
        <p>Alles ist bereits eingestellt. Gefällt es Ihnen, tippen Sie auf „Weiter“.</p>
      </header>

      <div className="split">
        <div className="stage" style={{ alignItems: 'center' }}>
          <div className="segments" role="tablist" aria-label="Ansicht">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'stick'}
              onClick={() => setView('stick')}
            >
              Stickbild
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'orig'}
              onClick={() => setView('orig')}
            >
              Original
            </button>
          </div>

          <div className="canvas" style={{ width: '100%' }}>
            {view === 'stick' ? (
              design.plan ? (
                <>
                  {/* Der alte Plan bleibt blass stehen, solange gerechnet
                      wird. Ein Garnwechsel wirkte sonst eine Sekunde lang
                      folgenlos. */}
                  <div className={design.busy ? 'stale' : undefined}>
                    <StitchPreview plan={design.plan} />
                  </div>
                  {design.busy && <span className="busy overlay">Wird berechnet …</span>}
                </>
              ) : (
                <p className="muted">
                  {design.busy ? 'Wird berechnet …' : 'Es gibt noch nichts zu sticken.'}
                </p>
              )
            ) : (
              design.source && (
                <img
                  src={design.source.previewUrl}
                  alt={design.isVector ? 'Ihre Zeichnung' : 'Ihr Originalbild'}
                  style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12 }}
                />
              )
            )}
          </div>
        </div>

        <div className="side">
          <dl className="facts">
            <div>
              <dt>Größe</dt>
              <dd>
                {cmNumber(design.outerWidth)} × {cm(design.outerHeight)}
              </dd>
            </div>
            <div>
              <dt>Dauer</dt>
              <dd>
                {design.stats
                  ? `ca. ${minutes(design.stats.stitches, design.stats.colorChanges)} Min.`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Stiche</dt>
              <dd>{design.stats ? `ca. ${design.stats.stitches.toLocaleString('de-DE')}` : '—'}</dd>
            </div>
            <div>
              <dt>Rahmen</dt>
              <dd>{design.hoop.name}</dd>
            </div>
          </dl>

          {!design.fitsHoop && (
            <p className="notice" role="alert">
              Das Motiv passt nicht in den Rahmen {design.hoop.name}. Gehen Sie zurück zu „Größe“.
            </p>
          )}

          <div className="card">
            <h2>Reihenfolge der Garne</h2>
            <ol className="order-list">
              {stitched.map((c, i) => (
                <li key={c.index} className={picking === c.index ? 'open' : undefined}>
                  <button
                    type="button"
                    className="thread-row"
                    aria-expanded={picking === c.index}
                    onClick={() => setPicking((p) => (p === c.index ? null : c.index))}
                  >
                    <span className="num">{i + 1}</span>
                    <span className="swatch small" style={{ background: c.threadHex }} />
                    <span className="text">
                      <strong>{c.name}</strong>
                      {c.threadChosen && <span className="muted">statt der Bildfarbe</span>}
                    </span>
                    <span className="pick">
                      <Garn size={24} />
                    </span>
                  </button>
                  {picking === c.index && (
                    <ThreadPicker
                      color={c}
                      onPick={(choice) => design.setThreadColor(c.index, choice)}
                    />
                  )}
                </li>
              ))}
            </ol>
            <p className="muted">
              Die Maschine hält vor jeder neuen Farbe an. Tippen Sie auf ein Garn, um eine andere
              Farbe zu sticken — das Motiv selbst ändert sich dadurch nicht.
            </p>
            {design.threadsChosen > 0 && (
              <button type="button" className="btn soft block" onClick={design.resetThreadColors}>
                Wieder die Farben aus dem Bild
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn block"
            style={{ justifyContent: 'flex-start', minHeight: 64, color: 'var(--ink)' }}
            onClick={onAdvanced}
          >
            <span style={{ color: 'var(--accent)', display: 'flex' }}>
              <Einstellungen size={26} />
            </span>
            <span style={{ flex: 1, textAlign: 'left', fontSize: 21, fontWeight: 400 }}>
              Erweiterte Einstellungen
            </span>
            <span style={{ color: 'var(--ink-mute)', display: 'flex' }}>
              <Weiter size={24} />
            </span>
          </button>

          <button
            type="button"
            className="btn primary block spacer"
            disabled={!design.plan}
            onClick={onNext}
          >
            Weiter zum Speichern
            <Weiter size={26} />
          </button>
        </div>
      </div>
    </div>
  );
}

export const PREVIEW_HELP = [
  'So sieht das Stickbild ungefähr aus. Mit „Original“ vergleichen Sie es mit Ihrem Bild.',
  'Rechts steht, wie lange die Maschine stickt und in welcher Reihenfolge Sie die Garne einfädeln.',
  'Soll eine Fläche in einer anderen Farbe gestickt werden als im Bild — etwa Schwarz statt Weiß —, tippen Sie in der Liste auf das Garn.',
  'Gefällt Ihnen etwas nicht, gehen Sie mit „Zurück“ einfach einen Schritt zurück. Es geht nichts verloren.',
];
