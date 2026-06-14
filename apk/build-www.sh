#!/usr/bin/env bash
# Bündelt das Web-Frontend (../public) in www/ für die APK.
# Rein lokal/offline: Stammdaten aus gebündelter seed.json, Verlauf in IndexedDB.
# Kein Server, kein Konto. (seed.json wird via apk/gen-seed-json.js erzeugt.)
set -euo pipefail
cd "$(dirname "$0")"
rm -rf www && mkdir -p www
cp -r ../public/* www/
echo "www/ gebaut:"; ls www/
