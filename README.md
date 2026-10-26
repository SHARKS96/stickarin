# Stick-Karin

Bild auswählen, Farben festlegen, fertige Stickdatei für die **Bernina B 590**
speichern. Läuft vollständig im Browser des iPads — kein Server, keine
Installation, kein Upload.

> Grundsatz: Das Ergebnis muss **ohne** jede Einstellung direkt stickbar sein
> und ein dichtes, deckendes Stickbild ergeben. Alles Weitere liegt unter
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

Als PWA aufs iPad: Safari › Teilen › „Zum Home-Bildschirm“. Danach startet die
App im Vollbild ohne Adressleiste.

Für GitHub Pages wird der Basispfad gebraucht:
`STICK_BASE=/stick-karin/ npm run build`.

## Aufbau

```
src/
├── core/                  Alles ohne DOM — hier liegt die Stickerei
│   ├── constants.ts       Standardwerte (Dichte, Verriegelung, Rahmen …)
│   ├── types.ts           Stichplan, Garnfarbe, Kennzahlen
│   ├── geometry/          Polygone, Einwärtsversatz, Scanlines
│   ├── stitch/            Stichplan bauen: Tatami, Satin, Füllung
│   ├── format/            EXP-, INF- und BMP-Writer
│   ├── pipeline.ts        Flächen → Stichplan, Reihenfolge, Sprünge
│   └── export.ts          Das Dateitrio für den USB-Stick
├── image/                 Bild → Farbflächen
│   ├── color.ts           Lab-Farbabstand
│   ├── quantize.ts        Farbreduktion (k-Means++ im Lab-Raum)
│   └── trace.ts           Masken → Polygone
├── state/useDesign.ts     Zustand der App an einer Stelle
├── ui/                    Die vier Schritte plus Vorschau
└── styles.css             Oberfläche
```

`core/` und `image/` kennen kein DOM und sind damit einzeln testbar.

## Stand der Dinge

**Trägt schon:**

- EXP-, INF- und BMP-Writer, gegen die Maschinentests TEST1 und TEST2
  verifiziert. `writeInf` erzeugt TEST1.INF und TEST2.INF Byte für Byte;
  die BMP-Vorschau trifft deren Maße und Dateigrößen exakt.
- Farbreduktion mit Pipette, Toleranz und Hintergrund-Ausschluss.
- Vier Schritte im Frontend, PWA mit App-Icon, Download der drei Dateien.

**Noch vereinfacht:**

- Flächen sind **konvexe Polygone** (konvexe Hülle je Gebiet). Konkave
  Formen werden dadurch aufgefüllt, Löcher gibt es noch nicht.
- Die Satin-Mittellinie wird über die lange Achse der Bounding-Box geschätzt,
  nicht aus der Form abgeleitet.
- Die Rechnerei läuft im Haupt-Thread. Bei großen Motiven gehört sie in einen
  Web Worker.
- Die Stichqualität (Dichte, Unterlage, Zugausgleich) ist nach dem
  dokumentierten Stand von TEST2 eingestellt, aber noch nicht gegengestickt.

## Maschine und Format

Die Bernina B 590 liest EXP, DST, PES, PEC, JEF, SEW, PCS und XXX; EXP ist das
einfachste. Bernina-EXP ist ein **Dateitrio** mit gleichem Namen:

| Datei | Inhalt |
| --- | --- |
| `.EXP` | die Stiche |
| `.INF` | die Garnfarben — fehlt sie, zeigt die Maschine Standardfarben |
| `.BMP` | das Vorschaubild fürs Display |

Einzelheiten zum Byte-Aufbau: [`docs/format.md`](docs/format.md).

## Lizenz

Eigener Code, ohne Ink/Stitch-Übernahmen — deshalb ist die App **nicht** an die
GPL gebunden.
