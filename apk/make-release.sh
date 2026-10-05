#!/usr/bin/env bash
# Release für Alien Fitness: legt für das aktuelle VERSION-Tag die signierte APK auf der eigenen Download-Seite ab (Hauptweg seit 01.10.2026, ab v2.8.0)
# und ein GitHub-Release als Spiegel an. Ersetzt apk/cb-release.sh; Codeberg-Zweig entfernt am 01.10.2026 (Codeberg-Umzug, Muster Alien Notes).
#   bash apk/make-release.sh [notizen.md]     (Notizen: Englisch, Markdown-Stichpunkte; optional)
#   bash apk/make-release.sh --nur-seite      (nur die Download-Seite neu schreiben und hochladen)
# GitHub: gh CLI, Token aus dem gh-Keyring (nie als Argument). Server: rsync über ssh (ssh-add -l).
set -euo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$ROOT"
OWNER="Alien-Investor"; REPO="alien-fitness"
APK="apk/android/app/build/outputs/apk/release/app-release.apk"
NAME="$(grep '^VERSION_NAME=' apk/VERSION | cut -d= -f2 | tr -d '[:space:]')"; TAG="v${NAME}"
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
  code=$(curl -s -o /dev/null -w '%{http_code}' -I "${DLURL}alien-fitness-${NAME}.apk")
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

# APK muss zur VERSION passen (sonst wird eine alte APK unter neuem Tag veröffentlicht) und mit dem Release-Schlüssel signiert sein
AAPT="$HOME/Android/sdk/build-tools/34.0.0/aapt2"
APK_VER="$("$AAPT" dump badging "$APK" 2>/dev/null | sed -nE "s/.*versionName='([^']*)'.*/\1/p")"
[ "$APK_VER" = "$NAME" ] || { echo "FEHLER: APK hat versionName '$APK_VER', VERSION sagt '$NAME'"; exit 1; }
source ~/Apps/android-build/env.sh
"$ANDROID_HOME/build-tools/34.0.0/apksigner" verify --print-certs "$APK" | grep -q "certificate SHA-256 digest: $FP_HEX" \
  || { echo "FEHLER: APK nicht mit dem Release-Zertifikat $FP_HEX signiert"; exit 1; }

GH_REPO="$OWNER/$REPO"
gh auth status >/dev/null 2>&1 || { echo "FEHLER: gh nicht angemeldet (gh auth login)"; exit 1; }
git ls-remote --exit-code "https://github.com/$GH_REPO.git" "refs/tags/$TAG" >/dev/null || { echo "FEHLER: Tag $TAG nicht auf GitHub – erst git tag $TAG && git push origin $TAG"; exit 1; }

NOTES=""; [ -n "$NOTES_FILE" ] && NOTES="$(cat "$NOTES_FILE")"$'\n\n'
BODY="Android release ${TAG} — install via Zap Store, Obtainium (source: ${DLURL}) or sideload."$'\n\n'"${NOTES}"
BODY+="Signing certificate fingerprint (SHA-256), identical for every version – verify with AppVerifier:"$'\n'
BODY+='```text'$'\n'"AppVerifier: ${FP_COLON}"$'\n'"apksigner:   ${FP_HEX}"$'\n''```'

# GitHub (Spiegel): APK unter Release-Namen bereitstellen
STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
cp "$APK" "$STAGE/alien-fitness-${NAME}.apk"
printf '%s\n' "$BODY" > "$STAGE/notes.md"
echo "=> GitHub: erstelle Release $TAG ..."
gh release create "$TAG" -R "$GH_REPO" --verify-tag --latest --title "Alien Fitness $TAG" --notes-file "$STAGE/notes.md" \
  "$STAGE/alien-fitness-${NAME}.apk"
echo "=== GitHub fertig: https://github.com/$GH_REPO/releases/tag/$TAG ==="

# Downloads auf dem eigenen Server (Hauptweg): nginx-Block /downloads/ (nur statisch). Ältere APKs bleiben liegen, bis sie von Hand entfernt werden.
# Die Download-Seite geht erst NACH der APK hoch, damit sie nie auf eine fehlende Datei zeigt.
echo "=> Server-Downloads: lade nach ${DL#*:} ..."
download_page "$STAGE/index.html"
if rsync -a --no-o --no-g --chmod=F644 "$STAGE/alien-fitness-${NAME}.apk" "$DL" && rsync -a --no-o --no-g --chmod=F644 "$STAGE/index.html" "$DL"; then
  echo "=== Server fertig: ${DLURL}alien-fitness-${NAME}.apk, Download-Seite ${DLURL} ==="
else
  echo "WARNUNG: Server-Upload fehlgeschlagen (ssh-add -l?) – GitHub-Release steht; Upload von Hand nachholen."
fi

# Nachweis: GitHub-Asset und Server-Datei == lokale APK
LOCAL_SHA=$(sha256sum < "$APK" | cut -c1-64)
for URL in "https://github.com/$GH_REPO/releases/download/$TAG/alien-fitness-${NAME}.apk" "${DLURL}alien-fitness-${NAME}.apk"; do
  REMOTE_SHA=$(curl -sfL "$URL" | sha256sum | cut -c1-64)
  [ "$REMOTE_SHA" = "$LOCAL_SHA" ] && echo "✓ $URL = lokale APK ($LOCAL_SHA)" || echo "FEHLER: $URL hat $REMOTE_SHA ≠ lokal $LOCAL_SHA"
done
