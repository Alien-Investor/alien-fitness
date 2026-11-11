# Gepinnte Prüfwerkzeuge für die Endkontrolle der APK (v2.11; Querfunde 10, 11 und 14 aus dem Release-Audit von Alien Notes v1.15, run-13).
# Nur per `source` aus apk/build-apk.sh und apk/make-release.sh; legt Funktionen und Variablen an, startet nichts.
#
# 10) aapt2, dexdump und apksigner.jar liegen beschreibbar im SDK, ein Build-Schritt mit Nutzerrechten (Gradle-Plugin, npm-Paket) könnte sie tauschen.
#     Benutzt werden nur Kopien, per Hash gepinnt, in einem privaten Ordner DREI Ebenen tief (WZ=$WZP/a/b/c): der RUNPATH von aapt2/dexdump reicht bis
#     $ORIGIN/../../../lib64 — direkt im SDK war das ~/lib64 (gemessen 11.11.2026, LD_DEBUG=libs), direkt in mktemp -d wäre es /tmp/lib64.
#     wz_libs lässt den Lader selbst berichten: jede gesuchte und geladene Bibliothek liegt in WZP oder einem Systemordner.
#     patch-hardening.mjs (die Endkontrolle) und node liegen ebenso vor Gradle fest: die Kopie bzw. der Hash wird danach erneut geprüft.
# 11) Nach Gradle nur noch Systemwerkzeuge: PATH=/usr/bin:/bin, LD_*/NODE_OPTIONS/Java-Optionen leer, jedes Werkzeug als Datei aus /usr/bin oder /bin.
# 14) aapt2, apksigner (java -jar) und node laufen mit `env -i`: JAVA_TOOL_OPTIONS u. a. luden sonst einen Java-Agenten, der eine falsche
#     Zertifikatszeile ausgeben kann; NODE_OPTIONS könnte per --require Code in die Endkontrolle laden.
# Grenze (wie Notes BUILD.md): java selbst (JAVA_HOME) bleibt ungepinnt — ein JDK lädt hunderte Dateien, der Pin einer einzelnen wäre nur Schein.
# Release-Audit v2.11 (a1/a2): node ist per Hash gepinnt (nvm-Update = erst prüfen, dann WZ_NODE_PIN neu setzen), die Endkontrolle kommt aus einem
# Git-Stand (HEAD bzw. Tag, nicht aus dem Arbeitsbaum), env.sh wird mit /bin/bash gelesen. Grenze (a6): Vertrauensanker bleibt die aufrufende
# Shell — exportierte Funktionen (z. B. `type`), BASH_ENV, GCONV_PATH. Ganz sicher: env -i HOME="$HOME" /bin/bash apk/make-release.sh.

WZ_BT_VERSION=34.0.0
WZ_PIN='760aa057e89e3940c3e944e6bec61eda864ade42fd9c0a3113735e329657705f  aapt2
eefdd6aed9db9fb849e4c98a50d8741e19d1b674ba6547220bcb9c3ed152123a  apksigner.jar
4115253cd1433c1836ae8a80b96e045e3b9ce9964166a4fc007b48258eb7333a  dexdump'
WZ_LISTE='d a
d a/b
d a/b/c
f a/b/c/aapt2
f a/b/c/apksigner.jar
f a/b/c/dexdump
f a/b/c/patch-hardening.mjs'
WZ_NODE_PIN='e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb'   # node v24.22.1 (nvm), Release-Audit v2.11 a1
WZP=""; WZ=""; WZ_PH=""; WZ_NODE=""; WZ_NODE_SUM=""

# ANDROID_HOME und JAVA_HOME aus env.sh übernehmen, NICHT dessen PATH (stellte JAVA_HOME/bin und platform-tools vor /usr/bin).
wz_umgebung() {
  eval "$(/bin/bash -c 'source ~/Apps/android-build/env.sh >/dev/null 2>&1; printf "ANDROID_HOME=%q\nJAVA_HOME=%q\n" "${ANDROID_HOME:-}" "${JAVA_HOME:-}"')"
  [ -n "$ANDROID_HOME" ] && [ -n "$JAVA_HOME" ] || { echo "FEHLER: ANDROID_HOME/JAVA_HOME aus ~/Apps/android-build/env.sh nicht lesbar"; return 1; }
  export ANDROID_HOME JAVA_HOME
}

# $1 = Git-Stand (HEAD bzw. Tag), aus dem patch-hardening.mjs der Endkontrolle kommt (nicht der Arbeitsbaum: ein Build-Schritt könnte ihn ändern).
# Kopien anlegen und prüfen; node gegen den Pin. Aufräumen: wz_aufraeumen (im trap des Aufrufers).
wz_einrichten() {
  local bt="$ANDROID_HOME/build-tools/$WZ_BT_VERSION" top
  top="$(/usr/bin/git rev-parse --show-toplevel)" || { echo "FEHLER: kein Git-Repo"; return 1; }
  WZP="$(realpath -e "$(mktemp -d)")"; WZ="$WZP/a/b/c"; mkdir -p "$WZ"
  cp "$bt/aapt2" "$bt/dexdump" "$bt/lib/apksigner.jar" "$WZ/" \
    && /usr/bin/git -C "$top" show "$1:apk/patch-hardening.mjs" > "$WZ/patch-hardening.mjs" || { echo "FEHLER: Prüfwerkzeuge nicht kopierbar ($1)"; return 1; }
  WZ_PH="$(sha256sum < "$WZ/patch-hardening.mjs" | cut -d' ' -f1)"
  # node (nvm) vorher festhalten lassen, wenn der PATH schon hart ist: WZ_NODE="$(command -v node)" vor wz_pfad_hart
  [ -n "$WZ_NODE" ] || WZ_NODE="$(command -v node || true)"
  [ -n "$WZ_NODE" ] && WZ_NODE="$(realpath -e "$WZ_NODE")" || { echo "FEHLER: node nicht gefunden"; return 1; }
  WZ_NODE_SUM="$(sha256sum < "$WZ_NODE" | cut -d' ' -f1)"
  [ "$WZ_NODE_SUM" = "$WZ_NODE_PIN" ] || { echo "FEHLER: node ($WZ_NODE) ≠ Pin — nach einem nvm-Update erst prüfen, dann WZ_NODE_PIN in apk/werkzeuge.sh neu setzen"; return 1; }
  wz_ok || { echo "FEHLER: aapt2/dexdump/apksigner.jar (build-tools $WZ_BT_VERSION) ≠ Pin — erst prüfen, dann in apk/werkzeuge.sh neu pinnen"; return 1; }
}
wz_aufraeumen() { [ -n "$WZP" ] && rm -rf "$WZP"; WZP=""; }

# Kopien unverändert, Ordner genau diese Einträge, Endkontrolle und node unverändert
wz_ok() {
  [ -n "$WZP" ] && [ "$(cd "$WZ" && sha256sum aapt2 apksigner.jar dexdump 2>/dev/null)" = "$WZ_PIN" ] \
    && [ "$(find "$WZP" -mindepth 1 -printf '%y %P\n' | LC_ALL=C sort)" = "$WZ_LISTE" ] \
    && [ "$(sha256sum < "$WZ/patch-hardening.mjs" | cut -d' ' -f1)" = "$WZ_PH" ] \
    && [ "$(sha256sum < "$WZ_NODE" | cut -d' ' -f1)" = "$WZ_NODE_SUM" ]
}

# Lader-Selbsttest (Notes wz_libs): jede „trying file=“/„calling init:“-Zeile (nach realpath) in WZP oder einem Systemordner; ohne Protokoll rot
wz_libs() { local w l f
  for w in aapt2 dexdump; do l="$(env -i LD_DEBUG=libs "$WZ/$w" version 2>&1 >/dev/null || true)"
    grep -q 'calling init: /' <<<"$l" || { echo "$w: kein Lader-Protokoll"; return 1; }
    while IFS= read -r f; do f="$(realpath -m -- "$f")"
      case "$f" in "$WZP"/*|/lib/*|/lib64/*|/usr/lib/*|/usr/lib64/*) ;; *) echo "$w sucht/lädt $f"; return 1 ;; esac
    done < <(grep -oE '(trying file=|calling init: )[^[:space:]]+' <<<"$l" | sed -E 's/^(trying file=|calling init: )//')
  done; }

# Ab hier nur Systemwerkzeuge (11). $@ = Werkzeuge, die danach benutzt werden.
wz_pfad_hart() { local t
  PATH=/usr/bin:/bin; export PATH; hash -r
  unset LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT NODE_OPTIONS JAVA_TOOL_OPTIONS JDK_JAVA_OPTIONS _JAVA_OPTIONS
  for t in "$@"; do
    case "$(type -P "$t")" in "/usr/bin/$t"|"/bin/$t") ;; *) echo "FEHLER: Werkzeug $t nicht aus /usr/bin oder /bin"; return 1 ;; esac
    [ "$(type -t "$t")" = file ] || { echo "FEHLER: $t ist durch eine Funktion/einen Alias überdeckt"; return 1; }
  done; }

# Aufrufe der Kopien mit leerer Umgebung (14)
wz_node()      { env -i PATH=/usr/bin:/bin FIT_WZ="$WZ" "$WZ_NODE" "$WZ/patch-hardening.mjs" "$@"; }
wz_aapt2()     { env -i "$WZ/aapt2" "$@"; }
wz_apksigner() { env -i "$JAVA_HOME/bin/java" -Xmx1024M -jar "$WZ/apksigner.jar" "$@"; }

# versionCode/versionName der APK = VERSION ($2), als feste Zeichenkette (kein Regex)
wz_version() { local vc vn
  vc="$(sed -n 's/^VERSION_CODE=\([0-9][0-9]*\)$/\1/p' "$2")"; vn="$(sed -n 's/^VERSION_NAME=\([0-9][0-9.]*\)$/\1/p' "$2")"
  [ "$(grep -c . <<<"$vc")" = 1 ] && [ "$(grep -c . <<<"$vn")" = 1 ] \
    && grep -qF "package: name='org.alieninvestor.fitness' versionCode='$vc' versionName='$vn'" <<<"$(wz_aapt2 dump badging "$1" 2>/dev/null | head -1)" \
    || { echo "FEHLER: App-ID/versionCode/versionName der APK ≠ VERSION (${vn:-?}/${vc:-?})"; return 1; }; }
