/** Startseite: ein großer Knopf und die zuletzt erstellten Stickbilder. */
import { ChevronRight, Needle, Trash } from '../Icons.tsx';
import { formatSavedAt } from '../../state/storage.ts';
import type { SavedDesignSummary } from '../../state/storage.ts';

interface Props {
  gallery: SavedDesignSummary[];
  onNew: () => void;
  onOpen: (id: string) => void;
  onForget: (id: string) => void;
}

export function StartScreen({ gallery, onNew, onOpen, onForget }: Props) {
  return (
    <div className="page">
      <header>
        <p>Guten Tag!</p>
        <h1>Stickbilder</h1>
      </header>

      <div className="home">
        <button type="button" className="cta" onClick={onNew}>
          <span className="mark">
            <Needle size={72} />
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span className="title">Neues Stickbild erstellen</span>
            <span className="sub">
              Ein Bild auswählen und in eine Stickdatei für Ihre Bernina umwandeln.
            </span>
          </span>
          <span className="go-pill">
            Los geht’s
            <ChevronRight />
          </span>
        </button>

        <section className="gallery" aria-labelledby="zuletzt">
          <div className="row between">
            <h2 id="zuletzt">Zuletzt erstellt</h2>
            {gallery.length > 0 && <span className="muted">Antippen zum Bearbeiten</span>}
          </div>

          {gallery.length === 0 ? (
            <p className="empty">
              <strong>Noch nichts gespeichert.</strong>
              <span>Ihre Stickbilder erscheinen hier, sobald Sie das erste gespeichert haben.</span>
            </p>
          ) : (
            <ul className="tiles">
              {gallery.map((d) => (
                <li key={d.id} style={{ position: 'relative' }}>
                  <button type="button" className="tile" onClick={() => onOpen(d.id)}>
                    <span className="thumb">
                      <img src={d.thumbnail} alt="" />
                    </span>
                    <span className="name">{d.name}</span>
                    <span className="when">{formatSavedAt(d.savedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="tile-remove"
                    aria-label={`${d.name} aus der Liste entfernen`}
                    onClick={() => onForget(d.id)}
                  >
                    <Trash size={22} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export const START_HELP = [
  'Tippen Sie auf den blauen Knopf „Neues Stickbild erstellen“.',
  'Die App führt Sie in 5 Schritten zum Ziel. Oben sehen Sie immer, bei welchem Schritt Sie gerade sind.',
  'Ein älteres Stickbild ändern? Tippen Sie rechts unter „Zuletzt erstellt“ darauf.',
];
