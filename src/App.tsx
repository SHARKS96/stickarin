/**
 * Vier Schritte, immer nur einer sichtbar: Bild, Farben, Vorschau, Speichern.
 * Zurück und Weiter liegen unten als feste Leiste — auf dem iPad gut erreichbar.
 */
import { useState } from 'react';
import { useDesign } from './state/useDesign.ts';
import { ImportStep } from './ui/ImportStep.tsx';
import { ColorStep } from './ui/ColorStep.tsx';
import { PreviewStep } from './ui/PreviewStep.tsx';
import { ExportStep } from './ui/ExportStep.tsx';

const STEPS = [
  { id: 'bild', label: 'Bild' },
  { id: 'farben', label: 'Farben' },
  { id: 'vorschau', label: 'Vorschau' },
  { id: 'speichern', label: 'Speichern' },
] as const;

export function App() {
  const design = useDesign();
  const [step, setStep] = useState(0);

  const canAdvance =
    (step === 0 && design.image !== null) ||
    (step === 1 && design.colors.length > 0) ||
    (step === 2 && design.plan !== null);

  return (
    <div className="app">
      <header className="topbar">
        <h1>Stick-Karin</h1>
        <nav aria-label="Arbeitsschritte">
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.id} aria-current={i === step ? 'step' : undefined} data-done={i < step}>
                <span className="step-number">{i + 1}</span>
                <span>{s.label}</span>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <main>
        {step === 0 && <ImportStep image={design.image} onImage={design.setImage} />}
        {step === 1 && <ColorStep design={design} />}
        {step === 2 && <PreviewStep design={design} />}
        {step === 3 && <ExportStep design={design} />}
      </main>

      <div className="actions">
        <button
          type="button"
          className="ghost"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
        >
          Zurück
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => setStep((s) => s + 1)}
          disabled={step === STEPS.length - 1 || !canAdvance}
        >
          Weiter
        </button>
      </div>
    </div>
  );
}
