/** Schritt 4: Speichern. Drei Dateien mit gleichem Namen auf den USB-Stick. */
import { useState } from 'react';
import { exportDesign, sanitizeName } from '../core/export.ts';
import type { ExportedFile } from '../core/export.ts';
import type { DesignState } from '../state/useDesign.ts';

export function ExportStep({ design }: { design: DesignState }) {
  const [saved, setSaved] = useState<string[]>([]);
  const name = sanitizeName(design.designName);

  if (!design.plan) {
    return (
      <section className="card">
        <h2>Speichern</h2>
        <p className="notice">Erst ein Motiv erzeugen, dann lässt sich speichern.</p>
      </section>
    );
  }

  const files = exportDesign(design.plan, design.designName);

  const saveAll = () => {
    for (const file of files) download(file);
    setSaved(files.map((f) => f.name));
  };

  return (
    <section className="card" aria-labelledby="schritt-speichern">
      <h2 id="schritt-speichern">Speichern</h2>
      <p className="hint">
        Die Bernina braucht alle drei Dateien mit demselben Namen im selben Ordner auf dem
        USB-Stick.
      </p>

      <label className="field" style={{ maxWidth: 320 }}>
        Dateiname
        <input
          type="text"
          value={design.designName}
          onChange={(e) => design.setDesignName(e.target.value)}
        />
        <span className="color-meta">
          Wird gespeichert als {name}.EXP, {name}.INF, {name}.BMP
        </span>
      </label>

      <ul className="colors" style={{ marginTop: 20 }}>
        {files.map((f) => (
          <li key={f.name} className="color-row">
            <strong className="name">{f.name}</strong>
            <span className="color-meta">{formatBytes(f.bytes.length)}</span>
            <span className="color-meta">{describe(f.name)}</span>
            <button type="button" className="ghost" onClick={() => download(f)}>
              Einzeln speichern
            </button>
          </li>
        ))}
      </ul>

      <div className="row" style={{ marginTop: 20 }}>
        <button type="button" className="primary big" onClick={saveAll}>
          Alle drei Dateien speichern
        </button>
      </div>

      {saved.length > 0 && (
        <p className="notice" role="status" style={{ marginTop: 16 }}>
          Gespeichert. Auf dem iPad in „Dateien“ auf den USB-Stick verschieben, dann an der Maschine
          öffnen.
        </p>
      )}
    </section>
  );
}

function describe(fileName: string): string {
  if (fileName.endsWith('.EXP')) return 'die Stiche';
  if (fileName.endsWith('.INF')) return 'die Garnfarben';
  return 'das Vorschaubild';
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} kB`;
}

function download(file: ExportedFile): void {
  // Eine Kopie in einen eigenen ArrayBuffer legen, damit der Blob
  // unabhängig vom ursprünglichen Puffer ist.
  const copy = new Uint8Array(file.bytes);
  const url = URL.createObjectURL(new Blob([copy], { type: file.type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Erst freigeben, wenn der Download angestoßen ist.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
