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
- Progress charts per exercise (max weight / reps over time)
- Exercise library with images, muscle groups and equipment
- JSON backup: export and import your history and plans to move between devices
- German and English interface, switchable in-app
- Dark neon UI, mobile-first

Built-in plans use bodyweight, pull-up bar and dumbbells — no gym required.

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
kept in on-device storage; the only file the app loads is its own bundled exercise seed.
No network calls.

## License

MIT — see [LICENSE](LICENSE).
