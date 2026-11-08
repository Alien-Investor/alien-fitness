// Härtet das (regenerierbare) android/-Projekt idempotent. Läuft in build-apk.sh nach
// `npx cap sync android` — überlebt damit auch ein frisches `npx cap add android`.
//
//   1) AndroidManifest: INTERNET-Permission ENTFERNEN. Die App ist rein lokal (seed.json,
//      Fonts und Chart.js gebündelt, Verlauf in IndexedDB) — ohne die Berechtigung kann sie
//      nachweisbar nicht funken, egal was im WebView passiert.
//   2) www/: Sicherung, dass kein Frontend-Asset auf http(s):// verweist (z.B. ein
//      versehentlich wieder eingebauter Google-Fonts-Import).
//   3) Share-Plugin ohne exportierten Receiver (Audit run-2 A1), 4) VIBRATE eintragen (v2.9).
//   --check <manifest> / --check-apk <apk>: Prüfmodi für den Build und make-release.sh.
//
// allowBackup bleibt absichtlich auf true: der Trainingsverlauf ist nicht geheim, und ein
// Geräteumzug via Seedvault/Gerät-zu-Gerät soll ihn mitnehmen.
import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';

// Positivliste der Berechtigungen (v2.9): außer der app-eigenen AndroidX-Signatur-Berechtigung
// (androidx.core, schützt dynamische Receiver) darf KEINE uses-permission im Manifest stehen.
// Eine Negativliste (nur INTERNET) sähe neue Einträge aus Plugin-AARs nicht.
// VIBRATE (seit v2.9, Entscheidung Nutzer 08.11.2026): normale Berechtigung ohne Rückfrage; ohne sie überspringt
// die Android-WebView navigator.vibrate() still (Chromium VibrationManagerAndroid prüft VIBRATE) — die Vibration
// am Timer-Ende, die Hilfe und Store-Text versprechen, kam nie an.
const ALLOWED_PERMS = new Set(['org.alieninvestor.fitness.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION', 'android.permission.VIBRATE']);
const REQUIRED_PERMS = ['android.permission.VIBRATE'];
function assertManifest(m, label) {
  const perms = [...m.matchAll(/<uses-permission(?:-sdk-\d+)?\b[^>]*android:name="([^"]+)"/g)].map(x => x[1]);
  const extra = perms.filter(n => !ALLOWED_PERMS.has(n));
  if (/android\.permission\.INTERNET/.test(m) || extra.length) {
    console.error(`FEHLER: Manifest-Härtung verletzt (${label}): ${extra.join(', ') || 'INTERNET'} — Build abgebrochen!`);
    process.exit(1);
  }
  console.log(`Manifest geprüft (${label}): keine INTERNET-Permission, nur erlaubte Berechtigungen (${perms.length}).`);
}

// --check <manifest>: nur prüfen — für den ZUSAMMENGEFÜHRTEN Manifest nach dem Gradle-Build (build-apk.sh).
// Plugin-AARs (seit v2.9 Filesystem + Share) mischen dort Einträge ein, die der Quell-Manifest nie sieht.
if (process.argv[2] === '--check') {
  assertManifest(readFileSync(process.argv[3], 'utf8'), process.argv[3]);
  process.exit(0);
}
// --check-apk <apk>: Prüfungen an der FERTIGEN APK, nicht an Zwischendateien (Audit run-2). Laufen in build-apk.sh
// UND in make-release.sh — eine APK aus einem anderen Build-Weg (Gradle von Hand, Android Studio, nach `npm ci`
// ungepatcht) kommt so nicht raus. Bei einem Verstoß wird die APK gelöscht; jeder Werkzeugfehler bricht ab.
//   a) Berechtigungen (aapt2): nur ALLOWED_PERMS, REQUIRED_PERMS vorhanden, kein INTERNET.
//   b) Share-Plugin im Bytecode (dexdump, alle Klassen unter com/capacitorjs/plugins/share/): kein Receiver
//      (Oberklasse, Registrierungs-Signatur auch über D8-Outlines), kein Rückruf, keine CHOSEN_COMPONENT-Aktion.
//   c) DisableDeploy=true in der kompilierten config.xml der APK (Pfad über die Ressourcentabelle, AGP kürzt ihn).
if (process.argv[2] === '--check-apk') {
  const apk = process.argv[3];
  const bt = `${process.env.ANDROID_HOME || process.env.HOME + '/Android/sdk'}/build-tools/34.0.0`;
  const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 30 });
  const problems = [];
  let perms = [];
  try {
    const out = run(`${bt}/aapt2`, ['dump', 'permissions', apk]);
    perms = [...out.matchAll(/^uses-permission(?:-sdk-23)?: name='([^']+)'/gm)].map(x => x[1]);
    const extra = perms.filter(n => !ALLOWED_PERMS.has(n));
    const missing = REQUIRED_PERMS.filter(n => !perms.includes(n));
    if (extra.length) problems.push(`unerlaubte Berechtigungen: ${extra.join(', ')}`);
    if (missing.length) problems.push(`fehlende Berechtigungen: ${missing.join(', ')}`);
    if (/android\.permission\.INTERNET/.test(out)) problems.push('INTERNET-Berechtigung vorhanden');

    const tmp = mkdtempSync(join(tmpdir(), 'fitness-dex-'));
    let shareDex = '';
    try {
      run('unzip', ['-q', '-o', apk, 'classes*.dex', '-d', tmp]);
      for (const f of readdirSync(tmp).filter(f => /^classes\d*\.dex$/.test(f))) {
        for (const block of run(`${bt}/dexdump`, ['-d', join(tmp, f)]).split(/\n(?=Class #\d+)/)) {
          if (/Class descriptor\s*:\s*'Lcom\/capacitorjs\/plugins\/share\//.test(block)) shareDex += block;
        }
      }
    } finally { rmSync(tmp, { recursive: true, force: true }); }
    if (!/Class descriptor\s*:\s*'Lcom\/capacitorjs\/plugins\/share\/SharePlugin;'/.test(shareDex)) problems.push('SharePlugin nicht im Bytecode');
    const bad = shareDex.match(/Superclass\s*:\s*'Landroid\/content\/BroadcastReceiver;'|Landroid\/content\/BroadcastReceiver;Landroid\/content\/IntentFilter;|android\.intent\.extra\.CHOSEN_COMPONENT|;\.registerReceiver|PendingIntent;\.getBroadcast|getIntentSender/);
    if (bad) problems.push(`Share-Plugin enthält noch Receiver/Rückruf (${bad[0]})`);

    const cfg = (run(`${bt}/aapt2`, ['dump', 'resources', apk]).match(/ xml\/config\n\s+\(\) \(file\) (\S+)/) || [])[1];
    const tree = cfg ? run(`${bt}/aapt2`, ['dump', 'xmltree', '--file', cfg, apk]) : '';
    if (!/A: name="DisableDeploy"[^\n]*\n\s+A: value="?true/.test(tree)) problems.push('DisableDeploy=true fehlt in der config.xml der APK');
  } catch (e) {
    console.error(`FEHLER: APK-Prüfung nicht durchführbar (${e.message.split('\n')[0]}) — abgebrochen.`);
    process.exit(1);
  }
  if (problems.length) {
    console.error(`FEHLER: APK-Prüfung (${apk}): ${problems.join('; ')} — APK gelöscht!`);
    try { unlinkSync(apk); } catch (e) {}
    process.exit(1);
  }
  console.log(`APK geprüft (${apk}): Berechtigungen ${perms.join(', ')}; Share ohne Receiver/Rückruf; DisableDeploy gesetzt.`);
  process.exit(0);
}

const MANIFEST = 'android/app/src/main/AndroidManifest.xml';
let m = readFileSync(MANIFEST, 'utf8');
const before = m;
m = m.replace(/^\s*<uses-permission android:name="android\.permission\.INTERNET"\s*\/>\s*$/gm, '');
// 4) VIBRATE eintragen (idempotent, vor </manifest>)
if (!/android:name="android\.permission\.VIBRATE"/.test(m)) {
  m = m.replace(/\n<\/manifest>\s*$/, '\n    <uses-permission android:name="android.permission.VIBRATE" />\n</manifest>\n');
}
if (m !== before) writeFileSync(MANIFEST, m);
console.log(m !== before ? 'Manifest gehärtet (INTERNET entfernt, VIBRATE eingetragen).' : 'Manifest bereits gehärtet (keine INTERNET-Permission, VIBRATE vorhanden).');
if (!/android:name="android\.permission\.VIBRATE"/.test(m)) { console.error('FEHLER: VIBRATE konnte nicht eingetragen werden — Build abgebrochen!'); process.exit(1); }
// Invariante IMMER prüfen — sonst rutscht ein gedriftetes Template still un-gehärtet durch.
assertManifest(m, MANIFEST);

// 3) @capacitor/share 6.0.4 (Audit run-2 A1): Das Plugin registriert beim App-Start einen EXPORTIERTEN
//    Broadcast-Receiver (Aktion android.intent.extra.CHOSEN_COMPONENT) ohne Fehlerbehandlung — jede andere
//    App auf dem Gerät konnte Alien Fitness damit abstürzen lassen; der Rückruf (implizite, veränderbare
//    PendingIntent) verriet außerdem anderen Apps das gewählte Teilen-Ziel. Die App liest das Ergebnis
//    (activityType) nie. Darum fliegen Receiver und Rückruf raus: der Teilen-Dialog startet ohne IntentSender,
//    Share.share() hängt weiter am Activity-Ergebnis. Upstream bis 8.0.3 unverändert exportiert.
//    Exakter Textersatz in node_modules (das Android-Projekt baut das Plugin direkt von dort); passt der Text
//    nicht (anderes Plugin-Release), bricht der Build ab statt still ungepatcht zu bauen. Idempotent.
const SHARE_DIR = 'node_modules/@capacitor/share';
const SHARE_SRC = `${SHARE_DIR}/android/src/main/java/com/capacitorjs/plugins/share/SharePlugin.java`;
const SHARE_MARK = '// alien-fitness: Receiver und Rueckruf entfernt (patch-hardening.mjs, Audit run-2 A1)';
const shareVer = JSON.parse(readFileSync(`${SHARE_DIR}/package.json`, 'utf8')).version;
if (shareVer !== '6.0.4') {
  console.error(`FEHLER: @capacitor/share ist ${shareVer}, der Patch kennt nur 6.0.4 — erst Review (Skill app-release, Schritt 0)!`);
  process.exit(1);
}
let sp = readFileSync(SHARE_SRC, 'utf8');
if (!sp.includes(SHARE_MARK)) {
  const LOAD_OLD = `    @Override
    public void load() {
        broadcastReceiver =
            new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        chosenComponent = intent.getParcelableExtra(Intent.EXTRA_CHOSEN_COMPONENT, ComponentName.class);
                    } else {
                        chosenComponent = getParcelableExtraLegacy(intent, Intent.EXTRA_CHOSEN_COMPONENT);
                    }
                }
            };
        ContextCompat.registerReceiver(
            getContext(),
            broadcastReceiver,
            new IntentFilter(Intent.EXTRA_CHOSEN_COMPONENT),
            ContextCompat.RECEIVER_EXPORTED
        );
    }
`;
  const LOAD_NEW = `    ${SHARE_MARK}
    @Override
    public void load() {}
`;
  const PI_OLD = `            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                flags = flags | PendingIntent.FLAG_MUTABLE;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                flags = flags | PendingIntent.FLAG_ALLOW_UNSAFE_IMPLICIT_INTENT;
            }

            // requestCode parameter is not used. Providing 0
            PendingIntent pi = PendingIntent.getBroadcast(getContext(), 0, new Intent(Intent.EXTRA_CHOSEN_COMPONENT), flags);
            Intent chooser = Intent.createChooser(intent, dialogTitle, pi.getIntentSender());
`;
  const PI_NEW = `            Intent chooser = Intent.createChooser(intent, dialogTitle);
`;
  if (sp.split(LOAD_OLD).length !== 2 || sp.split(PI_OLD).length !== 2) {
    console.error(`FEHLER: ${SHARE_SRC} passt nicht zum erwarteten 6.0.4-Text — Patch nicht anwendbar, Build abgebrochen!`);
    process.exit(1);
  }
  sp = sp.replace(LOAD_OLD, LOAD_NEW).replace(PI_OLD, PI_NEW);
  writeFileSync(SHARE_SRC, sp);
  console.log('Share-Plugin gepatcht (kein exportierter Receiver, kein Rückruf).');
} else console.log('Share-Plugin bereits gepatcht.');
if (/\bregisterReceiver|RECEIVER_EXPORTED|PendingIntent\.getBroadcast|getIntentSender/.test(sp)) {   // \b: unregisterReceiver (Aufräumen) ist erlaubt
  console.error('FEHLER: Share-Plugin enthält nach dem Patch noch Receiver/Rückruf — Build abgebrochen!');
  process.exit(1);
}

// 2) Kein externer Verweis im gebündelten Frontend (CSS/JS/HTML). Kommentare zählen nicht.
const offenders = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!['.css', '.js', '.html', '.json'].includes(extname(p))) continue;
    const src = readFileSync(p, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')       // CSS/JS-Blockkommentare
      .replace(/^\s*\/\/.*$/gm, '')           // JS-Zeilenkommentare
      .replace(/<!--[\s\S]*?-->/g, '');       // HTML-Kommentare
    if (name === 'chart.umd.min.js') continue; // Chart.js enthält nur Lizenz-/Doku-URLs, lädt nichts nach
    const hit = src.match(/https?:\/\/[^\s'")<>]+/);
    if (hit) offenders.push(`${p}: ${hit[0]}`);
  }
}
walk('www');
if (offenders.length) {
  console.error('FEHLER: externe URL im gebündelten Frontend — Build abgebrochen!\n  ' + offenders.join('\n  '));
  process.exit(1);
}
console.log('www/: keine externen URLs in CSS/JS/HTML/JSON.');
