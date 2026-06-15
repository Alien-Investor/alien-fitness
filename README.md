# Alien Fitness — Android Client

A minimal **personal workout tracker**, packaged as a native Android app (Capacitor)
around the Alien Investor fitness web app — so you stay logged in instead of
re-authenticating every time.

This repository contains the **Android client** (web frontend + Capacitor wrapper).
The backend is private and requires a one-time login, so this app is primarily
useful to its owner.

## Features

- Training plans: strength (Push / Pull / Legs) and HIT (Tabata, Power)
- Live session logging with automatic rest timer
- Progress charts per exercise (max weight / reps over time)
- Exercise library with images, muscle groups and equipment
- Dark neon UI, mobile-first; the login persists on-device (no constant re-login)

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

The frontend lives in `public/` (bundled into the APK by `build-www.sh`). API calls go
to the private backend with the Authorization header from a one-time on-device login;
in the native app they run via CapacitorHttp (bypassing CORS).

## License

MIT — see [LICENSE](LICENSE).
