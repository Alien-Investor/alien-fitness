#!/bin/bash
# Release für Alien Fitness: legt für das aktuelle VERSION-Tag die signierte APK auf der eigenen Download-Seite ab (Hauptweg seit 01.10.2026, ab v2.8.0)
# und ein GitHub-Release als Spiegel an. Ersetzt apk/cb-release.sh; Codeberg-Zweig entfernt am 01.10.2026 (Codeberg-Umzug, Muster Alien Notes).
#   /bin/bash apk/make-release.sh [notizen.md]     (Notizen: Englisch, Markdown-Stichpunkte; optional)
#   /bin/bash apk/make-release.sh --nur-seite      (nur die Download-Seite neu schreiben und hochladen)
# Grenze (Release-Audit v2.11, zwei Runden): schützt gegen Attrappen und Umlenkungen durch Build-Schritte mit Nutzerrechten an den geprüften
# Stellen, NICHT gegen einen Angreifer mit vollen Nutzerrechten (der liest Keystore und gh-Token ohnehin). java (JAVA_HOME) ist ungepinnt.
# GitHub: gh CLI, Token aus dem gh-Keyring (nie als Argument). Server: rsync über ssh (ssh-add -l).
set -euo pipefail
# Release-Audit v2.11 a2: nur mit der System-bash (eine bash-Attrappe im Nutzer-PATH konnte Prüffunktionen umdefinieren). Start: /bin/bash apk/make-release.sh
case "$(/usr/bin/realpath "${BASH:-}" 2>/dev/null)" in /usr/bin/bash|/bin/bash) ;; *) [ -z "${FIT_REEXEC:-}" ] && FIT_REEXEC=1 exec /bin/bash "$0" "$@"; echo "FEHLER: nicht mit /bin/bash gestartet"; exit 1 ;; esac
# Runde 2 (r2a-3): ganzer Rumpf als EIN Block — Bash liest ihn vollständig, bevor etwas läuft (sonst konnte ein Kindprozess den Rest der Datei umschreiben)
{
# r2a-1: Repo-Wurzel und Version nur über Systemwerkzeuge (eine git-Attrappe lenkte sonst auf ein fremdes Repo)
ROOT="$(/usr/bin/git -C "$(/usr/bin/dirname "$0")" rev-parse --show-toplevel)"
cd "$ROOT"
OWNER="Alien-Investor"; REPO="alien-fitness"
APK="apk/android/app/build/outputs/apk/release/app-release.apk"
NAME="$(/usr/bin/sed -n 's/^VERSION_NAME=\([0-9][0-9.]*\)$/\1/p' apk/VERSION)"; TAG="v${NAME}"
[ -n "$NAME" ] || { echo "FEHLER: VERSION_NAME in apk/VERSION nicht lesbar"; exit 1; }
FP_COLON="85:9E:88:B7:43:5F:84:1D:8B:C1:CF:F1:FE:A9:12:56:A6:33:DE:A5:59:D9:5A:91:02:4B:22:53:A2:AD:13:26"
FP_HEX="859e88b7435f841d8bc1cff1fea91256a633dea559d95a91024b2253a2ad1326"
DL="root@api.alien-investor.org:/var/www/alien-investor/html/downloads/alien-fitness/"
DLURL="https://api.alien-investor.org/downloads/alien-fitness/"

# Download-Seite als Obtainium-/Zap-Store-Quelle (Muster Sachwert-Tresor v3.6.4 / Alien Notes): GENAU EIN relativer Link auf die aktuelle APK.
# Obtainium (HTML-Quelle) sortiert die Links natürlich und nimmt den letzten — alien-fitness-2.8.apk sortiert NACH alien-fitness-2.8.1.apk,
# deshalb nie mehrere Versionen verlinken. Die Version zieht Obtainium per Regex aus dem Dateinamen, er muss VERSION_NAME exakt enthalten.
download_page() {  # $1 = Zieldatei
  cat > "$1" <<EOF
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Alien Fitness – Download</title>
</head>
<body>
<h1>Alien Fitness ${NAME}</h1>
<p><a href="alien-fitness-${NAME}.apk">alien-fitness-${NAME}.apk</a></p>
<p>Android-APK, signiert mit dem Zertifikat (SHA-256) / signed with certificate (SHA-256):<br>
<code>${FP_COLON}</code></p>
<p>Obtainium: diese Adresse als Quelle eintragen / add this address as source. Spiegel / mirror: github.com/Alien-Investor/alien-fitness/releases</p>
</body>
</html>
EOF
  [ "$(grep -o '<a ' "$1" | wc -l)" = 1 ] && grep -q "href=\"alien-fitness-${NAME}.apk\"" "$1" \
    || { echo "FEHLER: Download-Seite hat nicht genau einen Link auf alien-fitness-${NAME}.apk"; exit 1; }
}

if [ "${1:-}" = "--nur-seite" ]; then
  code=$(/usr/bin/env -i /usr/bin/curl -q --proto =https -s -o /dev/null -w '%{http_code}' -I "${DLURL}alien-fitness-${NAME}.apk" || true)
  [ "$code" = 200 ] || { echo "FEHLER: ${DLURL}alien-fitness-${NAME}.apk liefert $code – Seite würde ins Leere zeigen"; exit 1; }
  PAGE=$(mktemp -d); trap 'rm -rf "$PAGE"' EXIT
  download_page "$PAGE/index.html"
  rsync -a --no-o --no-g --chmod=F644 "$PAGE/index.html" "$DL"
  echo "=== Download-Seite: ${DLURL} (Link auf alien-fitness-${NAME}.apk) ==="
  exit 0
fi

NOTES_FILE="${1:-}"
[ -f "$APK" ] || { echo "FEHLER: $APK fehlt — zuerst bash apk/finish-build.sh"; exit 1; }
[ -z "$NOTES_FILE" ] || [ -f "$NOTES_FILE" ] || { echo "FEHLER: Notizdatei $NOTES_FILE fehlt"; exit 1; }

# APK muss zur VERSION passen (sonst wird eine alte APK unter neuem Tag veröffentlicht) und mit dem Release-Schlüssel signiert sein.
# Berechtigungen an der APK selbst gegen die Positivliste (Audit run-2): eine APK aus einem anderen Build-Weg
# (Gradle von Hand, Android Studio) liefe sonst ungeprüft raus. --check-apk löscht sie bei Verstoß.
# v2.11 (Querfunde 10/11/14 aus Alien Notes run-13): alle drei Prüfungen mit den gepinnten Kopien aus apk/werkzeuge.sh, in einer Subshell mit
# hartem PATH und leerer Umgebung je Aufruf — JAVA_TOOL_OPTIONS u. a. konnten apksigner eine falsche Zertifikatszeile ausgeben lassen.
# Aus env.sh nur ANDROID_HOME/JAVA_HOME, nicht dessen PATH (gh, rsync, ssh unten laufen weiter über den Nutzer-PATH).
# Release-Audit v2.11: Prüfwerkzeuge und Endkontrolle kommen aus dem lokalen Tag (a1), geprüft und hochgeladen wird nur eine private Kopie der APK,
# deren Hash vor jedem Upload und in der Schlusskontrolle gilt (a3: zwischen Prüfung und Kopie liefen gh/git aus dem Nutzer-PATH).
# r2a-2: keine replace-Refs, Tag EINMAL voll qualifiziert zur Commit-ID auflösen und nur die verwenden (refs/v… ginge sonst vor den Tag)
export GIT_NO_REPLACE_OBJECTS=1
TC="$(/usr/bin/git rev-parse -q --verify "refs/tags/$TAG^{commit}")" || { echo "FEHLER: lokaler Tag $TAG fehlt – erst git tag $TAG"; exit 1; }
source <(/usr/bin/git show "$TC:apk/werkzeuge.sh")
wz_umgebung || exit 1
WZ_NODE="$(command -v node || true)"   # nvm-node vor dem harten PATH festhalten (wz_einrichten prüft ihn gegen den Pin)
STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
SAPK="$STAGE/alien-fitness-${NAME}.apk"
cp "$APK" "$SAPK"
# r2a-5: Hash der Kopie VOR der Prüfung (das ungepinnte java hätte sie sonst nach apksigner tauschen können)
SUM="$(/usr/bin/sha256sum < "$SAPK" | /usr/bin/cut -c1-64)"
sum_ok() { [ "$(/usr/bin/sha256sum < "$SAPK" | /usr/bin/cut -c1-64)" = "$SUM" ] || { echo "FEHLER: geprüfte APK-Kopie verändert – Abbruch"; exit 1; }; }
/usr/bin/git show "$TC:apk/VERSION" > "$STAGE/VERSION"
(
  wz_pfad_hart awk cp cut env find grep head mkdir mktemp realpath rm sed sha256sum sort || exit 1
  trap wz_aufraeumen EXIT
  wz_einrichten "$TC" || exit 1
  wz_version "$SAPK" "$STAGE/VERSION" || exit 1
  wz_node --check-apk "$SAPK" || exit 1
  CERTS="$(wz_apksigner verify --print-certs "$SAPK" 2>/dev/null | grep 'certificate SHA-256 digest' || true)"
  [ "$(grep -c . <<<"$CERTS")" = 1 ] && [ "$(awk '{print $NF}' <<<"$CERTS")" = "$FP_HEX" ] \
    || { echo "FEHLER: APK nicht (allein) mit dem Release-Zertifikat $FP_HEX signiert (${CERTS:-keins})"; exit 1; }
) || exit 1
sum_ok

GH_REPO="$OWNER/$REPO"
gh auth status >/dev/null 2>&1 || { echo "FEHLER: gh nicht angemeldet (gh auth login)"; exit 1; }
git ls-remote --exit-code "https://github.com/$GH_REPO.git" "refs/tags/$TAG" >/dev/null || { echo "FEHLER: Tag $TAG nicht auf GitHub – erst git tag $TAG && git push origin $TAG"; exit 1; }

NOTES=""; [ -n "$NOTES_FILE" ] && NOTES="$(cat "$NOTES_FILE")"$'\n\n'
BODY="Android release ${TAG} — install via Zap Store, Obtainium (source: ${DLURL}) or sideload."$'\n\n'"${NOTES}"
BODY+="Signing certificate fingerprint (SHA-256), identical for every version – verify with AppVerifier:"$'\n'
BODY+='```text'$'\n'"AppVerifier: ${FP_COLON}"$'\n'"apksigner:   ${FP_HEX}"$'\n''```'

# GitHub (Spiegel): die geprüfte Kopie unter Release-Namen bereitstellen
printf '%s\n' "$BODY" > "$STAGE/notes.md"
sum_ok
echo "=> GitHub: erstelle Release $TAG ..."
gh release create "$TAG" -R "$GH_REPO" --verify-tag --latest --title "Alien Fitness $TAG" --notes-file "$STAGE/notes.md" \
  "$STAGE/alien-fitness-${NAME}.apk"
echo "=== GitHub fertig: https://github.com/$GH_REPO/releases/tag/$TAG ==="

# Downloads auf dem eigenen Server (Hauptweg): nginx-Block /downloads/ (nur statisch). Ältere APKs bleiben liegen, bis sie von Hand entfernt werden.
# Die Download-Seite geht erst NACH der APK hoch, damit sie nie auf eine fehlende Datei zeigt.
echo "=> Server-Downloads: lade nach ${DL#*:} ..."
download_page "$STAGE/index.html"
sum_ok
if rsync -a --no-o --no-g --chmod=F644 "$STAGE/alien-fitness-${NAME}.apk" "$DL" && rsync -a --no-o --no-g --chmod=F644 "$STAGE/index.html" "$DL"; then
  echo "=== Server fertig: ${DLURL}alien-fitness-${NAME}.apk, Download-Seite ${DLURL} ==="
else
  echo "WARNUNG: Server-Upload fehlgeschlagen (ssh-add -l?) – GitHub-Release steht; Upload von Hand nachholen."
fi

# Nachweis: GitHub-Asset, Server-Datei und Download-Seite == geprüfte Dateien (Hash der Kopie). Runde 2 (r2a-6): curl ohne ~/.curlrc und
# Umgebung, nur HTTPS; ein Fehler bricht nicht still ab, sondern zählt — am Ende Exit 1, wenn etwas nicht stimmt.
LOCAL_SHA="$SUM"; PAGE_SHA="$(/usr/bin/sha256sum < "$STAGE/index.html" | /usr/bin/cut -c1-64)"; BAD=0
pruef() {  # url soll
  local got; got="$(/usr/bin/env -i /usr/bin/curl -q --proto =https --proto-redir =https -sfL "$1" | /usr/bin/sha256sum | /usr/bin/cut -c1-64 || true)"
  if [ "$got" = "$2" ]; then echo "✓ $1 = lokal ($2)"; else echo "FEHLER: $1 hat ${got:-nichts} ≠ lokal $2"; BAD=1; fi
}
pruef "https://github.com/$GH_REPO/releases/download/$TAG/alien-fitness-${NAME}.apk" "$LOCAL_SHA"
pruef "${DLURL}alien-fitness-${NAME}.apk" "$LOCAL_SHA"
pruef "${DLURL}index.html" "$PAGE_SHA"
[ "$BAD" = 0 ] || { echo "FEHLER: Schlusskontrolle nicht bestanden"; exit 1; }
exit
}
