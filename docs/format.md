# Bernina-EXP auf Byte-Ebene

Was die Writer in `src/core/format/` umsetzen. Alle Angaben sind an den
Maschinentests TEST1 (25.10.2026) und TEST2 (26.10.2026) überprüft; beide
wurden auf einer Bernina B 590 tatsächlich gestickt.

## Das Dateitrio

Drei Dateien, gleicher Name, gleicher Ordner auf dem USB-Stick:

| Datei | Inhalt |
| --- | --- |
| `.EXP` | die Stiche |
| `.INF` | die Garnfarben; fehlt sie, zeigt die Maschine Standardfarben |
| `.BMP` | das Vorschaubild fürs Display |

## EXP

Kein Header, keine Prüfsumme, keine Dateilänge — Byte 0 ist schon der erste
Stich. Danach Byte-Paare `(dx, dy)`, relativ zur letzten Position, als
vorzeichenbehaftetes 8-Bit-Zweierkomplement in Einheiten von 0,1 mm.

- Nutzbarer Bereich −127 … +127, also höchstens **12,7 mm pro Schritt**.
  `−128` (`0x80`) ist als Befehlsmarker reserviert.
- **Y zeigt nach oben.** Das Datenmodell der App zählt Y nach unten
  (Bild- und SVG-Konvention), deshalb negiert `writeExp` beim Schreiben.
- Längere Wege werden in gleich lange Teilschritte zerlegt; ein Sprung
  bekommt das Präfix bei **jedem** Teilschritt neu.

| Bytes | Bedeutung |
| --- | --- |
| `dx dy` | Stich: fahren, dann einstechen |
| `80 04 dx dy` | Sprung: fahren ohne Einstich |
| `80 01 00 00` | Farbwechsel / Stopp |
| `80 80 07 00` | Fadenschnitt |
| `80 02 dx dy` | Stich, explizit — selten, beim Lesen akzeptieren |

Nach einer Sprungkette folgt ein Nullstich `00 00`, damit die Zielposition
sicher als Einstich gesetzt wird. Einen End-Befehl schreibt pyembroidery
nicht; die Datei endet einfach. Beide Maschinentests enden auf einen
Fadenschnitt.

Umrechnung: `byte = round(mm × 10) & 0xFF`, beim Lesen
`wert = byte > 127 ? byte − 256 : byte`.

### Was in TEST2 am Dateianfang steht

```
00 00   Nullstich an der Startposition
04 00   +0,4 mm
fc 00   −0,4 mm
04 00   +0,4 mm
fc 00   −0,4 mm
```

Das ist die Verriegelung: vier Mini-Stiche à 0,4 mm, damit der Faden nicht
aufgeht.

## INF

Big-Endian. Die Reihenfolge der Farben entspricht der Reihenfolge der
Farbwechsel in der EXP.

| Feld | Typ | Inhalt |
| --- | --- | --- |
| Version | int32 | `1` |
| Offset | int32 | `8` |
| Restlänge | int32 | Bytes ab hier bis Dateiende = **Dateigröße − 12** |
| Anzahl Farben | int32 | `n` |

Je Farbe:

| Feld | Typ | Inhalt |
| --- | --- | --- |
| Satzlänge | int16 | `11 + Länge(Name) + Länge(Katalog)` |
| Index | int16 | `0, 1, 2 …` |
| R, G, B | 3 × uint8 | Farbwert |
| Nadel | int16 | `Index + 1` |
| Name | UTF-8 + `0x00` | z. B. „Isacord 1902“ |
| Katalog | UTF-8 + `0x00` | z. B. „Isacord“ |

Die Satzlänge zählt ihre eigenen zwei Bytes mit: 2 + 2 + 3 + 2 + Name + 1 +
Katalog + 1.

### Gegengerechnet

| | TEST1 | TEST2 |
| --- | --- | --- |
| Dateigröße | 59 B | 35 B |
| Restlänge im Feld | 47 | 23 |
| Dateigröße − 12 | 47 ✓ | 23 ✓ |
| Farben | 2 (Rot, Blau) | 1 (Blau) |

`writeInf` erzeugt beide Dateien Byte für Byte; die Tests in
`src/core/format/format.test.ts` prüfen das.

## BMP

Ein gewöhnliches unkomprimiertes 24-Bit-BMP: 14 Byte Dateikopf, 40 Byte
`BITMAPINFOHEADER`, Zeilen von unten nach oben, BGR, jede Zeile auf 4 Byte
aufgefüllt.

Maßstab und Rand stehen nicht in der öffentlichen Dokumentation, lassen sich
aber aus den Testdateien ableiten:

- **0,4 mm je Pixel**
- **4 mm Rand** ringsum

| | Motiv | erwartet | TEST-Datei |
| --- | --- | --- | --- |
| TEST1 | 30,0 × 30,0 mm | `ceil((30+8)/0,4)` = 95 × 95 px | 95 × 95 px ✓ |
| TEST2 | 56,9 × 12,0 mm | `ceil((56,9+8)/0,4)` = 163 × 50 px | 163 × 50 px ✓ |

Sprünge gehören nicht ins Bild — sie sind lose Fäden, die geschnitten werden.

## Quellen

- Maschinentests TEST1 und TEST2, Drive-Ordner „Sticktest Bernina“
- Wissensdokument „Stickdateien verstehen & erstellen – Bernina 590 / EXP“
- pyembroidery `ExpWriter.py` und `InfWriter.py` (MIT)
- EduTech-Wiki: Embroidery format, EXP
