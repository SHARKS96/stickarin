/** Schritt 2: Farben festlegen — Anzahl, Pipette, Toleranz, Reihenfolge. */
import { useRef } from 'react';
import type { DesignState } from '../state/useDesign.ts';

export function ColorStep({ design }: { design: DesignState }) {
  const imgRef = useRef<HTMLImageElement>(null);

  /** Pipette: Farbe an der getippten Stelle als Hintergrund ausschließen. */
  const pickIgnored = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current;
    const data = design.image?.data;
    if (!img || !data) return;
    const rect = img.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * data.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * data.height);
    const i = (y * data.width + x) * 4;
    design.addIgnoredSample({
      r: data.data[i] as number,
      g: data.data[i + 1] as number,
      b: data.data[i + 2] as number,
    });
  };

  return (
    <section className="card" aria-labelledby="schritt-farben">
      <h2 id="schritt-farben">Farben festlegen</h2>
      <p className="hint">
        Jede Farbe ist ein Garn, das eingefädelt werden muss. Weniger Farben heißt weniger Umfädeln.
      </p>

      <div className="row" style={{ gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 260px', minWidth: 240 }}>
          <label className="field">
            Anzahl Farben: <strong>{design.colorCount}</strong>
            <input
              type="range"
              min={1}
              max={8}
              step={1}
              value={design.colorCount}
              onChange={(e) => design.setColorCount(Number(e.target.value))}
            />
          </label>

          <label className="field" style={{ marginTop: 16 }}>
            Toleranz der Pipette: <strong>{design.tolerance}</strong>
            <input
              type="range"
              min={2}
              max={40}
              step={1}
              value={design.tolerance}
              onChange={(e) => design.setTolerance(Number(e.target.value))}
            />
            <span className="color-meta">
              Höher heißt: Es werden auch ähnlichere Töne mit weggelassen.
            </span>
          </label>
        </div>

        {design.image && (
          <div style={{ flex: '1 1 240px' }}>
            <p className="color-meta" style={{ margin: '0 0 8px' }}>
              Auf den Hintergrund tippen, damit er nicht gestickt wird:
            </p>
            <img
              ref={imgRef}
              src={design.image.previewUrl}
              alt="Bild antippen, um eine Farbe als Hintergrund auszuschließen"
              onClick={pickIgnored}
              style={{ maxWidth: '100%', borderRadius: 10, cursor: 'crosshair' }}
            />
            {design.ignoredSamples.length > 0 && (
              <div className="row" style={{ marginTop: 10 }}>
                <span className="color-meta">
                  {design.ignoredSamples.length} Hintergrundfarbe
                  {design.ignoredSamples.length === 1 ? '' : 'n'} ausgeschlossen
                </span>
                <button type="button" className="ghost" onClick={design.clearIgnoredSamples}>
                  Zurücksetzen
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <ul className="colors" style={{ marginTop: 24 }}>
        {design.colors.map((c, position) => (
          <li key={c.index} className="color-row" data-ignored={c.ignored}>
            <span className="swatch" style={{ background: c.hex }} aria-hidden="true" />
            <label className="name">
              <span className="visually-hidden">Name für Farbe {position + 1}</span>
              <input
                type="text"
                value={c.name}
                onChange={(e) => design.setColorName(c.index, e.target.value)}
                style={{ width: '100%' }}
              />
            </label>
            <span className="color-meta">
              {c.hex} · {c.pixels.toLocaleString('de-DE')} px
            </span>
            <button
              type="button"
              className="ghost"
              onClick={() => design.moveColor(c.index, -1)}
              disabled={position === 0}
              aria-label={`${c.name} weiter nach hinten sticken`}
            >
              ↑
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => design.moveColor(c.index, 1)}
              disabled={position === design.colors.length - 1}
              aria-label={`${c.name} weiter nach vorn sticken`}
            >
              ↓
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => design.toggleColorIgnored(c.index)}
            >
              {c.ignored ? 'Mitsticken' : 'Weglassen'}
            </button>
          </li>
        ))}
      </ul>

      {design.colors.length > 0 && (
        <p className="color-meta" style={{ marginTop: 12 }}>
          Von oben nach unten wird gestickt — was hinten liegt, zuerst.
        </p>
      )}
    </section>
  );
}
