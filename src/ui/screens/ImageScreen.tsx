/**
 * Schritt 1: Bild wählen.
 *
 * Der Entwurf zeigt drei Wege. „Fotos“ und „Dateien“ sind dieselbe
 * Dateiauswahl mit unterschiedlichem `accept`, „Kamera“ setzt `capture` —
 * auf dem iPad öffnet Safari damit direkt die Kamera, auf dem Rechner
 * ganz normal den Dateidialog.
 */
import { useRef, useState } from 'react';
import { Bulb, Camera, Folder, Photo } from '../Icons.tsx';
import { loadImageFile } from '../../state/useDesign.ts';
import type { LoadedImage } from '../../state/useDesign.ts';

interface Props {
  onImage: (img: LoadedImage) => void;
}

export function ImageScreen({ onImage }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [capture, setCapture] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accept = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      onImage(await loadImageFile(file));
    } catch {
      setError('Dieses Bild konnte nicht geöffnet werden. Bitte ein JPG oder PNG wählen.');
    }
  };

  const pick = (useCamera: boolean) => {
    setCapture(useCamera);
    // Erst im nächsten Tick klicken, damit das geänderte Attribut greift.
    requestAnimationFrame(() => inputRef.current?.click());
  };

  const sources = [
    {
      id: 'fotos',
      icon: <Photo size={72} />,
      title: 'Aus meinen Fotos',
      sub: 'Ein Bild aus der Fotos-App auswählen',
      camera: false,
    },
    {
      id: 'dateien',
      icon: <Folder size={72} />,
      title: 'Aus Dateien',
      sub: 'Eine Grafik von iCloud, USB-Stick oder aus einer E-Mail',
      camera: false,
    },
    {
      id: 'kamera',
      icon: <Camera size={72} />,
      title: 'Foto aufnehmen',
      sub: 'Eine Zeichnung oder Vorlage mit der Kamera fotografieren',
      camera: true,
    },
  ];

  return (
    <div className="page">
      <header>
        <h1>Welches Bild möchten Sie sticken?</h1>
        <p>Tippen Sie auf eine der drei Möglichkeiten.</p>
      </header>

      <div className="sources">
        {sources.map((s) => (
          <button
            key={s.id}
            type="button"
            className="source"
            data-over={over === s.id}
            onClick={() => pick(s.camera)}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(s.id);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              void accept(e.dataTransfer.files[0]);
            }}
          >
            <span className="mark">{s.icon}</span>
            <span className="title">{s.title}</span>
            <span className="sub">{s.sub}</span>
          </button>
        ))}
      </div>

      {error && (
        <p className="notice" data-kind="error" role="alert">
          {error}
        </p>
      )}

      <p className="tip">
        <Bulb size={40} />
        <span>
          <strong>Tipp:</strong> Am schönsten werden einfache Bilder mit klaren Flächen und wenigen
          Farben – zum Beispiel Zeichnungen, Logos oder Schriftzüge.
        </span>
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        {...(capture ? { capture: 'environment' as const } : {})}
        className="visually-hidden"
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export const IMAGE_HELP = [
  <>
    <strong>Aus meinen Fotos:</strong> für Bilder, die schon in der Fotos-App auf dem iPad sind.
  </>,
  <>
    <strong>Aus Dateien:</strong> für Grafiken, die Sie per E-Mail bekommen oder in iCloud
    gespeichert haben.
  </>,
  <>
    <strong>Foto aufnehmen:</strong> Vorlage flach hinlegen, für gutes Licht sorgen und genau von
    oben fotografieren.
  </>,
];
