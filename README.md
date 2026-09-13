# Alien Fitness — Android Client

A minimal, fully **offline** personal workout tracker, packaged as a native Android app
(Capacitor). No account, no server, no tracking — training plans, logged sessions and
progress stay on your device and never leave it.

Ein minimalistischer, **vollständig offline** laufender Trainings-Tracker als native
Android-App. Kein Konto, kein Server, kein Tracking — Pläne, Trainingsverlauf und
Fortschritt bleiben auf deinem Gerät.

This repository contains the **Android client** (web frontend + Capacitor wrapper).
Since July 2026 (v2.4) the app runs entirely on-device; the former login-based backend
has been retired.

## Features

- Create your own training plans: any exercise, sets, reps and rest — edit any time
- Ad-hoc free workouts: start empty, add exercises on the fly, save when done
- Built-in plans: strength (Push / Pull / Legs) and HIT (Tabata, Power)
- Live session logging with automatic rest timer, corrections supported
- "Last time" shown and pre-filled for every set — progressive overload at a glance
- HIT intervals: timed sets ("20 sec") run with a work timer, rest and auto-chained next set
- Interrupted workouts survive an app kill and can be resumed, saved or discarded
- Session details with every set, a free-text note and delete
- Progress charts per exercise (max weight / reps or seconds over time)
- Exercise library with images, muscle groups and equipment
- JSON backup: export and import (merge with duplicate detection, or replace) to move between devices
- German and English interface, switchable in-app
- Dark neon UI, mobile-first; screen stays awake during a workout, timer ends with beep and vibration

Built-in plans use bodyweight, pull-up bar and dumbbells — no gym required.

## Privacy

The APK has **no `INTERNET` permission** (stripped at build time by `apk/patch-hardening.mjs`,
which also fails the build if any bundled asset references an external URL). Fonts and Chart.js
are bundled; the app cannot make a single network request. Your history lives in the app's
IndexedDB on the device and leaves it only through the JSON backup you export yourself.

## Install

- **Zap Store** (Nostr app store): search for *Alien Fitness*
- Or sideload the APK from the latest release

**Signature fingerprint** — verify authenticity, stable across all versions.
Same value, two notations — both are the SHA-256 of the signing certificate:

```
AppVerifier (colon-separated, what the app shows you):
85:9E:88:B7:43:5F:84:1D:8B:C1:CF:F1:FE:A9:12:56:A6:33:DE:A5:59:D9:5A:91:02:4B:22:53:A2:AD:13:26

Plain SHA-256 (apksigner / no separators):
859e88b7435f841d8bc1cff1fea91256a633dea559d95a91024b2253a2ad1326
```

Install [AppVerifier](https://github.com/soupslurpr/AppVerifier), open it on the
installed app and compare against the colon-separated value above.

## Build

```bash
cd apk
npm install
npx cap add android          # one-time
./build-apk.sh               # signed release APK (needs a signing keystore)
```

The frontend lives in `public/` and is bundled into the APK by `build-www.sh`. All data is
kept in on-device storage; the only files the app loads are its own bundled assets
(exercise seed, fonts, Chart.js). No network calls — and no permission to make any.

End-to-end tests (Brave via playwright-core): `node apk/serve-test.mjs &` then `node apk/e2e-test.mjs`.

## License

MIT — see [LICENSE](LICENSE).
