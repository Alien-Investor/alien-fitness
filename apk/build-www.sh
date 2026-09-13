#!/usr/bin/env bash
# Bündelt das Web-Frontend (../public) in www/ für die APK.
# Rein lokal/offline: Stammdaten aus gebündelter seed.json, Verlauf in IndexedDB.
# Kein Server, kein Konto. (seed.json wird via apk/gen-seed-json.js erzeugt.)
set -euo pipefail
cd "$(dirname "$0")"
rm -rf www && mkdir -p www
cp -r ../public/* www/

# Versionsanzeige (Anleitung) aus VERSION setzen — einzige Quelle, damit die angezeigte
# Version nie von VERSION_NAME abweicht. e2e-test.mjs prüft den Abgleich zusätzlich.
VNAME=$(grep '^VERSION_NAME=' VERSION | cut -d= -f2 | tr -d '[:space:]')
[ -n "$VNAME" ] || { echo "FEHLER: VERSION_NAME fehlt in VERSION"; exit 1; }
sed -i -E "s|^const APP_VERSION = '[^']*';|const APP_VERSION = '$VNAME';|" www/app.js
grep -q "^const APP_VERSION = '$VNAME';" www/app.js || { echo "FEHLER: APP_VERSION konnte nicht auf $VNAME gesetzt werden"; exit 1; }
echo "APP_VERSION = $VNAME"

echo "www/ gebaut:"; ls www/
