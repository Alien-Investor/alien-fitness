#!/usr/bin/env bash
# Ansagen der Alien-Fitness-App erzeugen (seit v2.10). Lokal und ohne Netz: Piper → WAV → ffmpeg → Opus.
#
#   bash apk/make-voice.sh                  → public/audio/<stimme>/<sprache>/<cue>-<n>.ogg + public/audio/manifest.json
#   bash apk/make-voice.sh --probe <ordner> → nur Hörproben: WAV je Ansage + je Stimme/Sprache eine Gesamtdatei mit Liste
#   --cues <datei>                          → andere Textdatei (Standard apk/voice/cues.json)
#
# Piper-Ordner $PIPER_DIR (Standard ~/Programme/piper/piper), Modelle unter $PIPER_DIR/voices/<model>.onnx.
# Stimme: Thorsten (Thorsten-Voice, Datensatz CC0). Kerstin (kerstin-low) klang in kurzen Rufen abgehackt (Hörprobe
# 10.11.2026) und bleibt bei Text und Porträt.
# In den Texten steht {name} für den Namen der Stimme („Hier ist {name}.“).
# Je Stimme: model, length_scale (größer = langsamer), optional noise_scale (Piper-Standard 0.667; 0.4 glättet) und name.
# Lehren aus den Videos (~/Skripte/piper-aussprache.md): kurze Kerstin-Zeilen mit 1.1–1.15, keine Ausrufezeichen,
# keine Einzelwort-Ketten ohne Verb, „Und …“ am Anfang verschluckt sie.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
PIPER_DIR="${PIPER_DIR:-$HOME/Programme/piper/piper}"
CUES="$HERE/voice/cues.json"
PROBE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --probe) PROBE="${2:?Ordner fehlt}"; shift 2 ;;
    --cues)  CUES="${2:?Datei fehlt}";   shift 2 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
done
for t in jq ffmpeg; do command -v "$t" >/dev/null || { echo "$t fehlt" >&2; exit 1; }; done
[[ -x "$PIPER_DIR/piper" ]] || { echo "Piper nicht gefunden: $PIPER_DIR/piper" >&2; exit 1; }
[[ -f "$CUES" ]] || { echo "Textdatei fehlt: $CUES" >&2; exit 1; }
# Schlüssel (Stimmen, Sprachen, Ansagen) werden zu Pfaden und Dateinamen, Modellnamen zu Piper-Pfaden: nur einfache Namen
# zulassen (Release-Audit v2.10 a2: "../x" als Stimme löschte per rm -rf außerhalb von public/audio).
jq -e '([.voices | keys[]] + [del(.voices, ._info) | keys[]] + [del(.voices, ._info)[] | keys[]]
        | all(test("^[a-z][a-z0-9_-]{0,31}$")))
       and ([.voices[].model] | all(type == "string" and test("^[A-Za-z0-9_-]{1,64}$")))
       and ([del(.voices, ._info)[][][]] | all(type == "string"))' "$CUES" >/dev/null \
  || { echo "Ungültige Textdatei $CUES: Schlüssel nur a-z, 0-9, _ und -; Modellname ohne Pfad; Texte als Liste von Strings" >&2; exit 1; }

CACHE="${XDG_CACHE_HOME:-$HOME/.cache}"
mkdir -p "$CACHE"
TMP="$(mktemp -d "$CACHE/alien-fitness-voice.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# Stille vorn und hinten abschneiden (Ansage soll genau auf den Phasenwechsel fallen), 48 kHz mono,
# dann auf -1 dBFS Spitze anheben (beide Stimmen gleich laut, im Training gut hörbar).
TRIM='silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse'
render() {  # text model length_scale ziel.wav [noise_scale]
  local raw="$TMP/raw.wav" cut="$TMP/cut.wav" peak gain noise=()
  [[ -n "${5:-}" ]] && noise=(--noise_scale "$5")
  printf '%s' "$1" | (cd "$PIPER_DIR" && ./piper -q --model "voices/$2.onnx" --length_scale "$3" "${noise[@]}" \
                        --sentence_silence 0 --output_file "$raw") >/dev/null 2>&1
  ffmpeg -nostdin -v error -y -i "$raw" -af "$TRIM" -ar 48000 -ac 1 "$cut"
  peak=$(ffmpeg -nostdin -hide_banner -i "$cut" -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-\{0,1\}[0-9.]*\) dB.*/\1/p')
  gain=$(LC_ALL=C awk -v p="${peak:-0}" 'BEGIN{printf "%.2f", -1.0 - p}')
  ffmpeg -nostdin -v error -y -i "$cut" -af "volume=${gain}dB" -ar 48000 -ac 1 "$4"
}
to_opus() {  # quelle.wav ziel.ogg — ohne Metadaten, reproduzierbar
  ffmpeg -nostdin -v error -y -i "$1" -map_metadata -1 -fflags +bitexact -flags:a +bitexact \
         -c:a libopus -b:a 32k -application voip -ac 1 "$2"
}
# Zeilen „cue <TAB> nr <TAB> text“ einer Sprache, {name} durch den Namen der Stimme ersetzt
cue_lines() {  # sprache stimme
  local name
  name=$(jq -r --arg v "$2" '.voices[$v].name // ($v | (.[:1] | ascii_upcase) + .[1:])' "$CUES")
  jq -r --arg name "$name" --arg l "$1" '.[$l] | to_entries[] | .key as $k | .value | to_entries[]
         | [$k, (.key+1|tostring), (.value | gsub("\\{name\\}"; $name))] | @tsv' "$CUES"
}

mapfile -t LANGS < <(jq -r 'del(.voices, ._info) | keys[]' "$CUES")
mapfile -t VOICES < <(jq -r '.voices | keys[]' "$CUES")
vget() { jq -r --arg v "$1" ".voices[\$v].$2 // empty" "$CUES"; }   # stimme feld

if [[ -n "$PROBE" ]]; then
  mkdir -p "$PROBE"
  ffmpeg -nostdin -v error -y -f lavfi -i anullsrc=r=48000:cl=mono -t 0.8 "$TMP/gap.wav"
  for v in "${VOICES[@]}"; do
    model=$(vget "$v" model); ls_=$(vget "$v" length_scale); ns=$(vget "$v" noise_scale)
    for l in "${LANGS[@]}"; do
      list="$TMP/list.txt"; : > "$list"; legend="$PROBE/$v-$l-reihenfolge.txt"; : > "$legend"; i=0
      while IFS=$'\t' read -r cue n text; do
        i=$((i + 1)); f="$PROBE/$v-$l-$cue-$n.wav"
        render "$text" "$model" "$ls_" "$f" "$ns"
        printf "file '%s'\nfile '%s'\n" "$f" "$TMP/gap.wav" >> "$list"
        printf '%2d  %-6s %s\n' "$i" "$cue" "$text" >> "$legend"
      done < <(cue_lines "$l" "$v")
      ffmpeg -nostdin -v error -y -f concat -safe 0 -i "$list" -c copy "$PROBE/_alle-$v-$l.wav"
      echo "Hörprobe: $PROBE/_alle-$v-$l.wav (Reihenfolge: $legend)"
    done
  done
  exit 0
fi

OUT="$ROOT/public/audio"
for v in "${VOICES[@]}"; do
  model=$(vget "$v" model); ls_=$(vget "$v" length_scale); ns=$(vget "$v" noise_scale)
  rm -rf "${OUT:?}/$v"
  for l in "${LANGS[@]}"; do
    mkdir -p "$OUT/$v/$l"
    while IFS=$'\t' read -r cue n text; do
      render "$text" "$model" "$ls_" "$TMP/clip.wav" "$ns"
      to_opus "$TMP/clip.wav" "$OUT/$v/$l/$cue-$n.ogg"
    done < <(cue_lines "$l" "$v")
  done
done
# Anzahl der Varianten je Cue und Sprache (die App wählt zufällig eine davon)
jq 'del(.voices, ._info) | map_values(map_values(length))' "$CUES" > "$OUT/manifest.json"
du -sh "$OUT"
