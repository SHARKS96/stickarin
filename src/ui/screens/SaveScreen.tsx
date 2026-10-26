/**
 * Schritt 5: Speichern.
 *
 * Der Browser kann nicht direkt auf den USB-Stick schreiben — er legt die
 * Dateien dort ab, wohin iPadOS sie im Teilen-Dialog schickt. Deshalb
 * führt der Schirm durch genau diesen Weg.
 */
import { useState } from 'react';
import { sanitizeName } from '../../core/export.ts';
import type { ExportedFile } from '../../core/export.ts';
import { planThumbnail } from '../drawPlan.ts';
import { Check, UsbStick } from '../Icons.tsx';
import type { DesignState } from '../../state/useDesign.ts';

interface Props {
  design: DesignState;
  onFinish: () => void;
}

const STEPS = [
  {
    what: 'USB-Stick in das iPad stecken',
    how: 'Dort, wo sonst das Ladekabel steckt.',
  },
  {
    what: 'Auf den grünen Knopf tippen',
    how: 'Dann in der Liste den USB-Stick antippen und oben rechts auf „Sichern“ tippen.',
  },
  {
    what: 'USB-Stick in die Bernina stecken',
    how: 'Das Stickbild finden Sie dort unter seinem Namen.',
  },
];

export function SaveScreen({ design, onFinish }: Props) {
  const [saved, setSaved] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = sanitizeName(design.designName);

  const save = async () => {
    setWorking(true);
    setError(null);
    try {
      const files = await design.exportFiles(design.designName);
      for (const file of files) download(file);
      await design.remember(design.plan ? planThumbnail(design.plan) : '');
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Das Speichern hat nicht geklappt.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="page">
      <header>
        <h1>Auf den USB-Stick speichern</h1>
        <p>Fast geschafft! Nur noch drei kleine Schritte.</p>
      </header>

      <div className="split">
        <div className="stage">
          <div className="howto">
            {STEPS.map((s, i) => (
              <div key={s.what} className="step">
                <span className="num">{i + 1}</span>
                <span>
                  <span className="what" style={{ display: 'block' }}>
                    {s.what}
                  </span>
                  <span className="how">{s.how}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="side">
          {saved ? (
            <div className="done-panel">
              <span className="check">
                <Check size={64} />
              </span>
              <strong style={{ fontSize: 34 }}>Gespeichert!</strong>
              <p className="muted" style={{ fontSize: 22 }}>
                „{design.designName}“ ist gesichert. Stecken Sie den Stick in Ihre Bernina.
              </p>
              <button type="button" className="btn primary block" onClick={onFinish}>
                Fertig
              </button>
              <button type="button" className="btn soft block" onClick={() => setSaved(false)}>
                Noch einmal speichern
              </button>
            </div>
          ) : (
            <>
              <div className="card">
                <label className="field" htmlFor="motivname">
                  Name des Stickbilds
                </label>
                <input
                  id="motivname"
                  type="text"
                  value={design.designName}
                  onChange={(e) => design.setDesignName(e.target.value)}
                />
                <p className="muted">Unter diesem Namen finden Sie es an der Maschine wieder.</p>
              </div>

              <div className="card">
                <h2>Es werden 3 Dateien gespeichert:</h2>
                <span className="muted">{base}.EXP – die Stiche</span>
                <span className="muted">{base}.INF – die Farben</span>
                <span className="muted">{base}.BMP – das Vorschaubild</span>
                <strong style={{ fontSize: 18 }}>
                  Bitte alle drei zusammen auf dem Stick lassen.
                </strong>
              </div>

              {error && (
                <p className="notice" data-kind="error" role="alert">
                  {error}
                </p>
              )}

              <button
                type="button"
                className="btn go block spacer"
                disabled={!design.plan || working}
                onClick={() => void save()}
              >
                <UsbStick size={30} />
                {working ? 'Wird gespeichert …' : 'Auf USB-Stick speichern'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function download(file: ExportedFile): void {
  // Eine Kopie in einen eigenen Puffer legen, damit der Blob unabhängig
  // vom Speicher des Workers ist.
  const url = URL.createObjectURL(new Blob([new Uint8Array(file.bytes)], { type: file.type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const SAVE_HELP = [
  'Der USB-Stick erscheint nicht in der Liste? Ziehen Sie ihn kurz ab und stecken Sie ihn neu ein.',
  'Geben Sie dem Stickbild einen kurzen Namen, damit Sie es an der Maschine wiederfinden.',
  'Ziehen Sie den Stick erst ab, wenn „Gespeichert!“ angezeigt wird.',
];
