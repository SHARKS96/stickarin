# Referenzimplementierung

`stickcore.mjs` ist der JavaScript-Kern, mit dem **TEST2** erzeugt wurde —
die Datei, die am 26.10.2026 auf der Bernina B 590 gestickt wurde. Sie
liegt hier **unverändert**.

Sie wird nicht von der App benutzt. Sie dient als Gegenprobe: Die Tests in
`src/core/format/compat.test.ts` lassen beide Implementierungen dieselben
Befehlsfolgen schreiben und vergleichen die Bytes. Weicht etwas ab, fällt
es beim nächsten `npm test` auf.

Dabei gilt: Wo die beiden sich uneinig sind, hat `stickcore.mjs` erst
einmal recht — sie hat den Maschinentest hinter sich, der neue Kern nicht.

## Unterschiede im Datenmodell

| | `stickcore.mjs` | `src/core/` |
| --- | --- | --- |
| Einheit | 0,1 mm (ganzzahlig) | Millimeter (Gleitkomma) |
| Punkt | `[x, y]` | `{ x, y }` |
| Befehl | `{ t, x, y }` mit `t` = stitch/jump/trim/color | `{ kind, x, y }` |
| Fläche | ein konvexes Polygon | äußerer Ring + Löcher |
| Satin | zwei Schienen | Mittellinie + Breite |

Die Tests rechnen zwischen beiden um; das ist ihr einziger Eingriff.
