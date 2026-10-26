/** Schritt 1: Bild auswählen. Große Fläche, Fotos und SVG erlaubt. */
import { useRef, useState } from 'react';
import type { LoadedImage } from '../state/useDesign.ts';

interface Props {
  image: LoadedImage | null;
  onImage: (img: LoadedImage) => void;
}

export function ImportStep({ image, onImage }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      onImage(await loadImage(file));
    } catch {
      setError('Das Bild konnte nicht gelesen werden. Bitte JPG, PNG oder SVG wählen.');
    }
  };

  return (
    <section className="card" aria-labelledby="schritt-bild">
      <h2 id="schritt-bild">Bild auswählen</h2>
      <p className="hint">
        Ein Foto, eine Zeichnung oder eine Grafik. Klare Formen und kräftige Farben sticken sich am
        besten.
      </p>

      <div
        className="dropzone"
        data-over={over}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void accept(e.dataTransfer.files[0]);
        }}
      >
        {image ? (
          <>
            <img
              src={image.previewUrl}
              alt={`Gewähltes Bild: ${image.name}`}
              style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 10 }}
            />
            <strong>{image.name}</strong>
            <span className="color-meta">
              {image.data.width} × {image.data.height} Pixel
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 48 }} aria-hidden="true">
              🧵
            </span>
            <strong>Bild hierher ziehen</strong>
            <span className="color-meta">oder unten auswählen</span>
          </>
        )}

        <button type="button" className="primary big" onClick={() => inputRef.current?.click()}>
          {image ? 'Anderes Bild wählen' : 'Bild vom iPad wählen'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="visually-hidden"
          onChange={(e) => void accept(e.target.files?.[0])}
        />
      </div>

      {error && (
        <p className="notice" data-kind="error" role="alert" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}
    </section>
  );
}

/** Datei -> ImageData, über ein Offscreen-Canvas. */
async function loadImage(file: File): Promise<LoadedImage> {
  const previewUrl = URL.createObjectURL(file);
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Kein 2D-Kontext verfügbar.');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return {
    name: file.name,
    data: ctx.getImageData(0, 0, canvas.width, canvas.height),
    previewUrl,
  };
}
