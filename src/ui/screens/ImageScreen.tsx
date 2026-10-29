/**
 * Schritt 1: Vorlage wählen.
 *
 * Der Entwurf zeigt drei Wege. „Fotos“ und „Dateien“ sind dieselbe
 * Dateiauswahl, „Kamera“ setzt `capture` — auf dem iPad öffnet Safari
 * damit direkt die Kamera, auf dem Rechner ganz normal den Dateidialog.
 *
 * Angenommen werden Pixelbilder und Zeichnungen (SVG). Welcher der
 * beiden Wege es wird, entscheidet die Datei selbst; der Nutzer muss
 * nichts darüber wissen und soll hier auch nicht danach gefragt werden.
 */
import { useRef, useState } from 'react';
import { Tipp, Kamera, Dateien, Fotos } from '../Icons.tsx';
import { loadSourceFile } from '../../state/useDesign.ts';
import type { LoadedSource } from '../../state/useDesign.ts';

interface Props {
  onSource: (loaded: LoadedSource) => void;
}

export function ImageScreen({ onSource }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [capture, setCapture] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accept = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      onSource(await loadSourceFile(file));
    } catch (problem) {
      // Beim Lesen einer Zeichnung steht im Fehler, was ihr fehlt; das
      // hilft mehr als ein allgemeiner Satz.
      setError(
        problem instanceof Error && problem.message
          ? problem.message
          : 'Diese Datei konnte nicht geöffnet werden. Bitte ein JPG, PNG oder SVG wählen.',
      );
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
      icon: <Fotos size={72} />,
      title: 'Aus meinen Fotos',
      sub: 'Ein Bild aus der Fotos-App auswählen',
      camera: false,
    },
    {
      id: 'dateien',
      icon: <Dateien size={72} />,
      title: 'Aus Dateien',
      sub: 'Ein Bild oder eine Zeichnung (SVG) von iCloud, USB-Stick oder aus einer E-Mail',
      camera: false,
    },
    {
      id: 'kamera',
      icon: <Kamera size={72} />,
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
        <Tipp size={40} />
        <span>
          <strong>Tipp:</strong> Am schönsten werden einfache Bilder mit klaren Flächen und wenigen
          Farben – zum Beispiel Zeichnungen, Logos oder Schriftzüge. Noch besser ist eine Zeichnung
          als <strong>SVG</strong>: Daraus werden die Kanten glatt statt treppig, und die Farben
          stehen von vornherein fest.
        </span>
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.svg"
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
    gespeichert haben – auch für Zeichnungen im SVG-Format.
  </>,
  <>
    <strong>Foto aufnehmen:</strong> Vorlage flach hinlegen, für gutes Licht sorgen und genau von
    oben fotografieren.
  </>,
];
