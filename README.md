# Stickarin

Bild auswählen, Farben festlegen, fertige Stickdatei für die **Bernina B 590**
speichern. Läuft vollständig im Browser des iPads — kein Server, keine
Installation, kein Upload.

> Grundsatz: Das Ergebnis muss **ohne** jede Einstellung direkt stickbar sein
> und ein dichtes, deckendes Stickbild ergeben. Alles Weitere liegt hinter
> „Erweiterte Einstellungen“.

## Loslegen

```bash
npm install
npm run dev        # http://localhost:5173
```

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver mit Hot Reload |
| `npm run build` | Produktionsbuild nach `dist/` |
| `npm run preview` | Produktionsbuild lokal ansehen |
| `npm test` | Tests einmalig |
| `npm run test:watch` | Tests im Watch-Modus |
| `npm run typecheck` | TypeScript prüfen |
| `npm run lint` | ESLint |
| `npm run format` | Prettier schreiben |
| `npm run icons` | `src/ui/Icons.tsx` aus `assets/icons/` neu erzeugen |

Als App aufs iPad: Safari › Teilen › „Zum Home-Bildschirm“. Danach startet
Stickarin im Vollbild ohne Adressleiste.

## Der Weg durch die App

Fünf Schritte, dazu zwei Abzweige, die nur auf Wunsch erscheinen:

```
Start ─► 1 Bild ─► 2 Größe ─► 3 Farben ─► 4 Vorschau ─► 5 Speichern
                                  │             │
                                  ▼             ▼
                          Farbe anpassen   Erweiterte
                          (Pipette,        Einstellungen
                           Toleranz)       (Stichart, Dichte, 3D)
```

Gespeicherte Stickbilder liegen in IndexedDB und lassen sich von der
Startseite wieder öffnen.

## Aufbau

```
src/
├── core/                  Alles ohne DOM — hier liegt die Stickerei
│   ├── constants.ts       Standardwerte (Dichte, Verriegelung, Rahmen …)
│   ├── types.ts           Stichplan, Garnfarbe, Kennzahlen
│   ├── geometry/          Ringe, Löcher, Versatz, Scanlines, Glättung
│   ├── stitch/            Stichplan bauen: Tatami, Satin, Füllung
│   ├── format/            EXP-, INF- und BMP-Writer
│   ├── pipeline.ts        Flächen → Stichplan, Reihenfolge, Sprünge
│   └── export.ts          Das Dateitrio für den USB-Stick
├── image/                 Bild → Farbflächen
│   ├── color.ts           Lab-Farbabstand
│   ├── quantize.ts        Farbreduktion (k-Means++ im Lab-Raum)
│   └── trace.ts           Masken → Polygone mit Löchern
├── worker/                Rechnerei im eigenen Thread
├── state/                 Zustand, Worker-Anbindung, Speicher
├── ui/                    Schirme, Icons, Logo, Vorschau
└── styles.css             Oberfläche

assets/                    Quelldateien der Marke (SVG)
scripts/generate-icons.mjs assets/icons/*.svg → src/ui/Icons.tsx
```

`core/` und `image/` kennen kein DOM und sind damit einzeln testbar. Die
Rechnerei läuft im Worker, damit die Regler auf dem iPad flüssig bleiben;
der Stichplan geht als typisierte Felder über die Grenze und wird
übertragen statt kopiert.

## Stand der Dinge

**Trägt schon:**

- EXP-, INF- und BMP-Writer, gegen die Maschinentests TEST1 und TEST2
  verifiziert. `writeInf` erzeugt TEST1.INF und TEST2.INF Byte für Byte;
  die BMP-Vorschau trifft deren Maße und Dateigrößen exakt.
- Konturen mit Löchern und konkaven Formen, nicht mehr nur konvexe Hüllen.
- Farbreduktion mit Pipette, Toleranz und automatisch erkanntem Hintergrund.
- Fünf Schritte als PWA mit App-Icon, Galerie und Download der drei Dateien.

**Noch vereinfacht:**

- Die Satin-Mittellinie wird über die lange Achse der Bounding-Box
  geschätzt, nicht aus der Form abgeleitet.
- Der Polygonversatz löst Selbstschnitte nicht auf, sondern wirft
  umgestülpte Ecken weg. Bei stark verwinkelten Formen kann der Kantenlauf
  dadurch lückenhaft werden.
- Die Stichqualität (Dichte, Unterlage, Zugausgleich) folgt dem
  dokumentierten Stand von TEST2, ist aber noch nicht gegengestickt.

## Maschine und Format

Die Bernina B 590 liest EXP, DST, PES, PEC, JEF, SEW, PCS und XXX; EXP ist das
einfachste. Bernina-EXP ist ein **Dateitrio** mit gleichem Namen:

| Datei | Inhalt |
| --- | --- |
| `.EXP` | die Stiche |
| `.INF` | die Garnfarben — fehlt sie, zeigt die Maschine Standardfarben |
| `.BMP` | das Vorschaubild fürs Display |

Einzelheiten zum Byte-Aufbau: [`docs/format.md`](docs/format.md).

## Veröffentlichen

`.github/workflows/pages.yml` baut und veröffentlicht jeden Push auf `main`
nach GitHub Pages. Der Basispfad kommt aus dem Repository-Namen; lokal
nachstellen lässt sich das mit `STICK_BASE=/stick-karin/ npm run build`.

Damit das greift, muss in den Repository-Einstellungen unter
*Settings › Pages* als Quelle **GitHub Actions** eingestellt sein.

## Lizenz

Eigener Code, ohne Ink/Stitch-Übernahmen — deshalb ist die App **nicht** an die
GPL gebunden.
