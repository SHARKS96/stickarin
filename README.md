# Stickarin

Bild oder Zeichnung auswählen, Farben festlegen, fertige Stickdatei für die
**Bernina B 590** speichern. Läuft vollständig im Browser des iPads — kein
Server, keine Installation, kein Upload.

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

Als App aufs iPad: <https://sharks96.github.io/stickarin/> in Safari öffnen,
dann Teilen › „Zum Home-Bildschirm“. Danach startet Stickarin im Vollbild
ohne Adressleiste.

## Der Weg durch die App

Fünf Schritte, dazu zwei Abzweige, die nur auf Wunsch erscheinen:

Als Vorlage geht beides: ein Pixelbild (JPG, PNG, Foto) oder eine Zeichnung
(SVG). Was es ist, erkennt die App an der Datei; der Weg durch die App ist
derselbe.

```
Start ─► 1 Bild ─► 2 Größe ─► 3 Farben ─► 4 Vorschau ─► 5 Speichern
                                  │             │
                                  ▼             ▼
                          Farbe anpassen   Erweiterte
                          (Pipette,        Einstellungen
                           Toleranz)       (Stichart, Dichte,
                                            3D, Garnfarbe)
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
├── image/                 Pixelbild → Farbflächen
│   ├── color.ts           Lab-Farbabstand
│   ├── quantize.ts        Farbreduktion (k-Means++ im Lab-Raum)
│   └── trace.ts           Masken → Polygone mit Löchern
├── vector/                SVG → Farbflächen und Striche
│   ├── xml.ts             Kleiner XML-Leser (im Worker gibt es kein DOM)
│   ├── transform.ts       Affine Abbildungen
│   ├── path.ts            Pfaddaten, Kurven und Bögen zu Polygonzügen
│   ├── paint.ts           Farbe und Stil: Attribute, style, Stylesheet
│   ├── shapes.ts          Füllregeln: Loch oder Insel?
│   ├── svg.ts             Der Durchlauf durch den Baum
│   ├── plan.ts            Millimeter und Garne
│   └── preview.ts         Die gelesene Zeichnung als SVG
├── worker/                Rechnerei im eigenen Thread
├── state/                 Zustand, Worker-Anbindung, Speicher
├── ui/                    Schirme, Icons, Logo, Vorschau
└── styles.css             Oberfläche

assets/                    Quelldateien der Marke (SVG)
scripts/generate-icons.mjs assets/icons/*.svg → src/ui/Icons.tsx
```

`core/`, `image/` und `vector/` kennen kein DOM und sind damit einzeln
testbar. Die
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
- Der Vektorweg: SVG mit Pfaden, Grundformen, Gruppen, Abbildungen,
  Stylesheets, `use`/`symbol`, Füllregeln und Strichen.
- Garnfarbe je Garn frei wählbar — nötig beim Negativ-Motiv, wo nach dem
  Weglassen des schwarzen Hintergrunds weiß auf weißem Stoff gestickt würde.
- Fünf Schritte als PWA mit App-Icon, Galerie und Download der drei Dateien.

## Der Vektorweg

Ein Pixelbild zwingt zum Raten: Welche Farben sind gemeint, wo verläuft eine
Kante, war diese dünne Spur eine Linie oder eine schmale Fläche? Eine
Zeichnung beantwortet all das selbst. Stickarin nutzt das, statt sie zu
rastern und die Antworten wieder wegzuwerfen.

Was dabei anders läuft als beim Pixelbild:

| | Pixelbild | Zeichnung (SVG) |
| --- | --- | --- |
| Farben | k-Means im Lab-Raum, Pipette, Toleranz | stehen in der Datei; der Regler legt die ähnlichsten zusammen, ausgeschaltete bleiben für sich |
| Kanten | Pixeltreppe, geglättet | Kurven, so fein zerlegt, wie die Größe es verlangt |
| Striche | gibt es nicht — alles ist Fläche | bleiben Pfade: Steppstich oder Satin |
| Hintergrund | die Farbe, die den Bildrand beherrscht | die hinterste Fläche, die bis in alle vier Ecken reicht |

Drei Entscheidungen, die man beim Lesen des Codes sonst sucht:

- **Der viewBox wird nicht ausgewertet.** Er legt fest, wie eine Zeichnung in
  ein Fenster passt; hier gibt es kein Fenster, sondern einen Stickrahmen.
  Zugeschnitten wird auf das Motiv selbst — wer 8 cm einstellt, will ein 8 cm
  breites Motiv und nicht 8 cm Rand mit einem Punkt in der Mitte.
- **Transparenz wird gegen Weiß verrechnet.** Beim Sticken gibt es sie nicht;
  Weiß ist im Zweifel die Farbe des unbestickten Stoffs. Was fast ganz
  durchsichtig ist, fällt weg.
- **Verläufe werden gemittelt.** Welche Farbe ein Verlauf „ist“, lässt sich
  nicht besser beantworten. Wer es genauer will, teilt die Fläche im
  Zeichenprogramm auf.

Nicht gestickt wird Text: Schrift braucht die Schriftdatei selbst. Die App
sagt es und bittet darum, den Text im Zeichenprogramm in Pfade umzuwandeln
(„Text in Kurven“). Ebenso wenig eingebettete Pixelbilder und ein Beschnitt
(`clip-path`) — beides wird gemeldet, sobald es wirklich etwas abschneidet.

**Noch vereinfacht:**

- Die Satinrichtung wird aus zwölf Probeschnitten gewählt, nicht aus einer
  echten Mittelachse. Bei einer Form, die in verschiedenen Teilen
  verschieden läuft, gilt eine Richtung für das Ganze.
- Der Polygonversatz löst Selbstschnitte nicht auf, sondern wirft
  umgestülpte Ecken weg. Bei stark verwinkelten Formen kann der Kantenlauf
  dadurch lückenhaft werden.
- Die Stichqualität (Dichte, Unterlage, Zugausgleich) folgt dem
  dokumentierten Stand von TEST2, ist aber noch nicht gegengestickt.
- Ein Beschnitt (`clip-path`) aus der Zeichnung wird nicht angewendet,
  sondern nur gemeldet. Gestickt wird dann mehr, als in der Datei zu sehen
  ist.
- Sich überlappende Flächen werden beide voll gestickt. Was verdeckt ist,
  liegt trotzdem Garn für Garn darunter — bei vielen Lagen wird das Motiv
  dadurch dick.

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
nach <https://sharks96.github.io/stickarin/>.

Der Basispfad kommt aus dem Repository-Namen, steht also nirgends fest
verdrahtet; lokal nachstellen lässt sich das mit
`STICK_BASE=/stickarin/ npm run build`. Ohne `STICK_BASE` baut Vite für das
Wurzelverzeichnis — so, wie es jeder andere statische Hoster ausliefert.

Damit das greift, muss in den Repository-Einstellungen unter
*Settings › Pages* als Quelle **GitHub Actions** eingestellt sein.

## Lizenz

[GNU General Public License v3](LICENSE).

Der Code ist durchgehend eigener; aus Ink/Stitch wurde nichts übernommen. Die
GPL ist hier also eine Entscheidung und keine Auflage — und weil sie gefallen
ist, stünde einer späteren Übernahme von Ink/Stitch-Algorithmen auch nichts
mehr im Weg.

`reference/stickcore.mjs` gehört zum Projekt und fällt unter dieselbe Lizenz.
