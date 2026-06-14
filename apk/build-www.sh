#!/usr/bin/env bash
# Bündelt das Web-Frontend (../public) in www/ für die APK.
# CapacitorHttp ist aktiv -> API-Calls gehen nativ (umgeht CORS). Login einmalig im App-Speicher.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf www && mkdir -p www
cp -r ../public/* www/
echo "www/ gebaut:"; ls www/
