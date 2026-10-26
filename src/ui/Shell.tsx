/**
 * Kopfleiste und Hilfe — auf jedem Schirm gleich.
 *
 * Die Hilfe ist ein echtes `<dialog>`: Der Browser übernimmt damit
 * Fokusfalle, Escape und das Abdunkeln des Hintergrunds.
 */
import { useEffect, useRef } from 'react';
import { Fertig, Zurueck, Hilfe } from './Icons.tsx';

export const STEPS = ['Bild', 'Größe', 'Farben', 'Vorschau', 'Speichern'] as const;

interface TopBarProps {
  /** 0-basiert; `null` auf der Startseite. */
  step: number | null;
  onBack?: (() => void) | undefined;
  backLabel?: string;
  onHelp: () => void;
}

export function TopBar({ step, onBack, backLabel = 'Zurück', onHelp }: TopBarProps) {
  return (
    <div className="topbar">
      {onBack ? (
        <button type="button" className="btn" onClick={onBack}>
          <Zurueck />
          {backLabel}
        </button>
      ) : (
        <span />
      )}

      {step !== null && (
        <nav aria-label="Fortschritt">
          <ol className="steps">
            {STEPS.map((label, i) => {
              const state = i === step ? 'current' : i < step ? 'done' : 'todo';
              return (
                <li
                  key={label}
                  data-state={state}
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  {state === 'done' ? <Fertig size={20} /> : <span>{i + 1}</span>}
                  {label}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <button type="button" className="btn" onClick={onHelp}>
        <Hilfe />
        Hilfe
      </button>
    </div>
  );
}

interface HelpProps {
  open: boolean;
  title: string;
  steps: React.ReactNode[];
  onClose: () => void;
}

export function HelpDialog({ open, title, steps, onClose }: HelpProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="help" onClose={onClose} aria-labelledby="hilfe-titel">
      <div className="head">
        <span className="mark">
          <Hilfe size={32} />
        </span>
        <h2 id="hilfe-titel">{title}</h2>
      </div>
      <ol>
        {steps.map((s, i) => (
          <li key={i}>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="btn primary block" onClick={onClose}>
        Verstanden
      </button>
    </dialog>
  );
}
