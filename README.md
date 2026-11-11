# Alien Fitness — Android Client

A minimal, fully **offline** personal workout tracker, packaged as a native Android app
(Capacitor). No account, no server, no tracking — training plans, logged sessions and
progress stay on your device and leave it only when you export or share a backup yourself (or through
Android's system backup, if enabled).

Ein minimalistischer, **vollständig offline** laufender Trainings-Tracker als native
Android-App. Kein Konto, kein Server, kein Tracking — Pläne, Trainingsverlauf und
Fortschritt bleiben auf deinem Gerät, außer du exportierst oder teilst selbst ein Backup (oder über
die Android-Systemsicherung, falls eingeschaltet).

This repository contains the **Android client** (web frontend + Capacitor wrapper).
Since July 2026 (v2.4) the app runs entirely on-device; the former login-based backend
has been retired.

## Features

- Create your own training plans: any exercise, sets, reps and rest — edit any time
- Ad-hoc free workouts: start empty, add exercises on the fly, save when done
- Built-in plans: strength (Push / Pull / Legs), HIT (Tabata, Power), warm-up and stretching
- Warm-up and stretching: a hands-free warm-up block above every workout and a stretching offer when you finish (neither is saved), or run them as their own plans; Thorsten announces the next exercise (by name in German) and when to switch sides, and the timer shows a picture of the next exercise
- Live session logging with automatic rest timer, corrections supported
- "Last time" on the exercise cards and in every set dialog, sets come pre-filled: progressive overload at a glance
- HIT intervals: timed sets ("20 sec") let you pick the work time (20–180 s or custom), then a 5 s get-ready countdown, work timer, rest and auto-chained next round
- Hold exercises (plank, stretches): pick the hold time per set (30–180 s, custom, or "Max" as a stopwatch), 5 s get-ready countdown; stretches done per side switch sides automatically
- Announcer voice: Thorsten calls out "Get ready", "Go", "Rest" and the last round, short tones count down the last three seconds before each automatic start (German, or simple English words in English mode); bundled audio files, turn it off with one tap
- Technique tips for every exercise and safety warnings for some, from Kerstin (German and English)
- Interrupted workouts survive an app kill and can be resumed, saved or discarded
- Session details with every set, a free-text note and delete
- Progress charts per exercise (max weight / reps or seconds over time)
- Exercise library with images, muscle groups and equipment, filterable by muscle group, HIT, warm-up or stretching
- JSON backup: export saves a file to "Documents" and opens the share sheet (Android 11+; older versions: share sheet only); import with merge (duplicate detection) or replace
- German and English interface, switchable in-app
- Dark neon UI, mobile-first; screen stays awake during a workout, timer ends with vibration and an announcement (or a beep with the voice off)

Built-in plans use bodyweight, a pull-up bar, dumbbells and a bench — no gym required.

## Privacy

The APK has **no `INTERNET` permission** (stripped at build time by `apk/patch-hardening.mjs`,
which also fails the build if any bundled asset references an external URL). Fonts and Chart.js
are bundled; the app cannot make a single network request. On top of that, a strict Content Security
Policy only allows the app's own bundled scripts, styles, images and data. Your history lives in the app's
IndexedDB on the device and leaves it only through the JSON backup you export or share yourself, or through
Android's own system backup if you have it enabled (backup stays allowed so your history survives a phone change).
Besides Capacitor's built-in core plugins, the only native plugins are Filesystem and Share, used solely for that
backup file; the build removes the Share plugin's broadcast receiver and checks the finished APK against a
permission allowlist. The APK requests exactly one Android permission, `VIBRATE` (timer end), plus the
app-internal signature permission AndroidX adds.

## Install

Deliberately **not on Google Play**. Signed releases are distributed from our own download address
[api.alien-investor.org/downloads/alien-fitness/](https://api.alien-investor.org/downloads/alien-fitness/) and through the
[Zap Store](https://zapstore.dev/apps/org.alieninvestor.fitness) (Nostr app store). Every release is also mirrored on
[GitHub](https://github.com/Alien-Investor/alien-fitness/releases).

**[Obtainium](https://github.com/ImranR98/Obtainium)** (automatic updates, no Google) — in Obtainium tap **“Add app”**:

1. “App source URL”:
   ```
   https://api.alien-investor.org/downloads/alien-fitness/
   ```
2. Under “Additional options for HTML”, “Version string extraction RegEx”:
   ```
   alien-fitness-([0-9]+(\.[0-9]+)+)\.apk$
   ```
3. “Match group to use for version string extraction RegEx”: `$1`
4. “Expected signing certificate hashes”:
   ```
   85:9E:88:B7:43:5F:84:1D:8B:C1:CF:F1:FE:A9:12:56:A6:33:DE:A5:59:D9:5A:91:02:4B:22:53:A2:AD:13:26
   ```
5. Tap **“+”** to add → **Install**. Obtainium reports updates automatically.

Obtainium needs the RegEx to read the version number from the file name on a download page; without it, it cannot compare
against the installed version. The certificate hash is a hard lock: Obtainium will not install an APK signed with a different key.
To copy the values, or with “Open in Obtainium” (everything prefilled): [Obtainium sheet on the website](https://alien-investor.org/en/apps.html#obtainium-fitness).

> **Still set up with the Codeberg address?** No new releases appear there. Obtainium cannot edit an app's source, so once:
> export a JSON backup in the history first, remove the “Alien Fitness” entry and in the dialog keep only **“Remove from Obtainium”**
> switched on (**“Uninstall from device” off** — it deletes the app and your training history), then add it again as above.
> Obtainium detects the installed app; signing key and package ID stay the same.

**Without Obtainium:** [download page](https://api.alien-investor.org/downloads/alien-fitness/) → download the `.apk` and install it.

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
npm ci                                   # exact pins from package-lock.json
npx cap add android                      # one-time
./build-www.sh                           # public/ → www/, APP_VERSION from VERSION
npx cap sync android
node patch-hardening.mjs                 # strips INTERNET, adds VIBRATE, patches the Share plugin, scans www/
(cd android && ./gradlew assembleRelease)   # needs your own release signingConfig, else app-release-unsigned.apk
node patch-hardening.mjs --check-apk android/app/build/outputs/apk/release/app-release.apk
```

`patch-hardening.mjs` must run after every `npm ci` / `cap sync` and before Gradle. Version (`apk/VERSION`) and app icon are
set by private helper scripts; a self-build without them gets Capacitor's defaults. `--check-apk` verifies the
finished APK (permission allowlist, Share plugin without receiver in the bytecode, live-update path disabled, FileProvider
limited to the backup in "Documents" and the app cache).

The frontend lives in `public/` and is bundled into the APK by `build-www.sh`. All data is
kept in on-device storage; the only files the app loads are its own bundled assets
(exercise seed, fonts, Chart.js). No network calls — and no permission to make any.

End-to-end tests (Brave via playwright-core): `node apk/serve-test.mjs &` then `node apk/e2e-test.mjs`.

## Credits

- Voice announcements are pre-generated offline with [Piper](https://github.com/rhasspy/piper) and bundled as audio files
  (`apk/make-voice.sh`, texts in `apk/voice/cues.json`). Voice: "Thorsten" (Piper voice `de_DE-thorsten-high` from
  [piper-voices](https://huggingface.co/rhasspy/piper-voices), MIT, trained on the
  [Thorsten-Voice](https://github.com/thorstenMueller/Thorsten-Voice) dataset, CC0).
- Kerstin's portrait and the app icon are our own artwork.

## License

MIT — see [LICENSE](LICENSE).

