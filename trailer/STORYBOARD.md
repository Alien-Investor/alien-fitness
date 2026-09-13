# App-Trailer Alien Fitness — Storyboard (Stand 2026-09-13)

Wortloser Trailer für die Apps-Seite, DE + EN aus einem Schnitt, nach dem Alien-Pass-Muster
(`~/projekte/alien-pass/trailer/`, Regeln in Obsidian `wissen/app-trailer.md`). Zweiter App-Trailer
der Welle. **Nur 16:9, kein Short.**

## Eckdaten

| | 16:9-Master |
|---|---|
| Einsatz | apps.html (DE-Seite nur DE-Video, en/apps.html nur EN-Video), YouTube |
| Länge | 57,2 s, 25 fps, 1920×1080 |
| Ton | Suno-Bett aus dem Fundus (Nutzerwahl), 1 s Fade-in, 3 s Fade-out, loudnorm −16 LUFS |
| Sprache | Textkarten DE/EN, App-Screenshots über den Sprachumschalter, Demo-Daten |
| Stimme | keine |

Ausgabe: `out/trailer-de-16x9.mp4`, `out/trailer-en-16x9.mp4`.

## Bildsprache

- Textkarten im Kanal-Look (`make_cards.py`): Verlauf (8,10,22)→(14,18,40), Cyan-Akzent, Ubuntu Bold.
  Aufhänger und Schlussgedanke als Band im unteren Drittel über dem Motiv, Feature-Zeilen als linker
  Textblock neben dem Handy.
- Screenshots (`make_shots.mjs`, Brave headless gegen `apk/serve-test.mjs`, 412×880 bei 3×, DE über den
  Sprachumschalter, nur Demo-Daten): Dashboard, Plan-Editor, aktives Training, HIT-Arbeits-Timer,
  Fortschritts-Chart, Übungsbibliothek, Historie mit Notiz, Backup-Panel.
- Handy-Rahmen (`make_frames.py`): Screenshot rechts (abgerundet, Glow), links Platz für die Karte.
  Motiv = App-Icon mit Glow, Titelbild = Icon + „Alien Fitness" + Unterzeile.

## Was NICHT ins Bild darf

- Keine echten Trainings-/Gesundheitsdaten, nur die Demo-Daten aus `make_shots.mjs`.
- Keine übertriebenen Versprechen (kein „Sync", nur „Backup: zusammenführen oder ersetzen").

## Szenenliste 16:9 (14 Szenen, 57 s)

| # | Szene | Bild | Karte (DE) | s |
|---|---|---|---|---|
| 1 | Aufhänger | Motiv | Wem gehören deine Trainingsdaten? | 4,5 |
| 2 | Problem | Motiv | Fitness-Apps schicken deine Gesundheitsdaten an fremde Server. | 5,5 |
| 3 | Gerät | Dashboard | Alien Fitness bleibt auf deinem Gerät. Kein Konto, kein Server. | 5 |
| 4 | Offline | Dashboard (OFFLINE-Badge) | Die App hat nicht einmal eine Internet-Berechtigung. | 5 |
| 5 | Pläne | Plan-Editor | Eigene und mitgelieferte Pläne: Kraft und HIT | 4,4 |
| 6 | Logging | Aktives Training | Live-Logging mit Pausen-Timer und Letztes-Mal-Vergleich | 4,4 |
| 7 | HIT | Arbeits-Timer | HIT-Intervalle mit Arbeits-Timer | 4,4 |
| 8 | Fortschritt | Chart | Fortschritts-Charts pro Übung | 4,4 |
| 9 | Bibliothek | Übungsbibliothek | Übungsbibliothek mit Bildern | 4,4 |
| 10 | Historie | Historie + Notiz | Historie mit Trainingsnotizen | 4,4 |
| 11 | Backup | Backup-Panel | JSON-Backup: zusammenführen oder ersetzen | 4,4 |
| 12 | Offline-Schluss | Motiv | Vollständig offline. Open Source, einsehbar. | 5,5 |
| 13 | Titel | Icon + „Alien Fitness" | — | 5 |
| 14 | Endkarte | Icon + QR | Dein Trainingstagebuch bleibt bei dir. / Zap Store, Obtainium, Codeberg. | 5 |

QR-Ziel: `apps.html` (DE) / `en/apps.html` (EN) — Alien Fitness hat keine eigene Detailseite.

## Pipeline

```bash
cd ~/projekte/fitness-app && node apk/serve-test.mjs &
cd trailer && node make_shots.mjs && python3 make_frames.py && python3 make_cards.py
export MUSIK=musik/<gewaehltes-bett>.wav
./build_trailer.sh de && ./build_trailer.sh en && python3 make_thumbs.py
fuser -k 3009/tcp   # Testserver stoppen
```

`out/`, `shots/`, `frames/`, `cards/`, `thumbs/`, `musik/` sind gitignored.
