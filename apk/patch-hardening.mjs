// Härtet das (regenerierbare) android/-Projekt idempotent. Läuft in build-apk.sh nach
// `npx cap sync android` — überlebt damit auch ein frisches `npx cap add android`.
//
//   1) AndroidManifest: INTERNET-Permission ENTFERNEN. Die App ist rein lokal (seed.json,
//      Fonts und Chart.js gebündelt, Verlauf in IndexedDB) — ohne die Berechtigung kann sie
//      nachweisbar nicht funken, egal was im WebView passiert.
//   2) www/: Sicherung, dass kein Frontend-Asset auf http(s):// verweist (z.B. ein
//      versehentlich wieder eingebauter Google-Fonts-Import).
//   3) Share-Plugin ohne exportierten Receiver (Audit run-2 A1), 4) VIBRATE eintragen (v2.9),
//   5) FileProvider eng fassen (v2.10, Hinweis aus Audit run-2).
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
// 2) Kein externer Verweis im gebündelten Frontend. Kommentare in CSS/JS/HTML zählen nicht, JSON wird nicht „entkommentiert“
//    (dort ist /* … */ Text). Erkannt werden Schema-Adressen (http, https, ws, wss, ftp) UND protokoll-relative //host.tld
//    (Release-Audit v2.10 a3), in allen Dateien außer Binärformaten. Den Schutz im Betrieb liefern weiter die fehlende
//    INTERNET-Berechtigung und connect-src 'self'; diese Prüfung hält das Versprechen schon im Build.
// Runde 2 (INFO a3): Schema-Adressen werden unabhängig vom Host erkannt (auch IP, localhost, Benutzerteil, escapter Slash
// "https:\/\/…"); protokoll-relative //host.tld nur direkt nach Anführungszeichen, "(" oder "=" (Attribut, url(), String),
// damit ein Inline-Kommentar „// siehe ex.name“ keinen Fehlalarm gibt. XML-Namensräume (xmlns="http://www.w3.org/…") sind
// keine Abrufe und fallen vorher raus. Geprüft wird jede Datei außer bekannten Binärformaten (vorher nur sechs Endungen).
const BIN_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.ogg', '.mp3', '.woff', '.woff2', '.ttf', '.otf'];
const URL_RE = /\b(?:https?|wss?|ftp):\\?\/\\?\/|["'(=]\s*\\?\/\\?\/[a-z0-9-]+(?:\.[a-z0-9-]+)+/i;
const XMLNS_RE = /\bxmlns(?::[\w-]+)?\s*=\s*(["'])https?:\/\/www\.w3\.org\/[^"']*\1/g;
function scanDir(root) {
  const offenders = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      const ext = extname(p).toLowerCase();
      if (BIN_EXT.includes(ext)) continue;
      if (name === 'chart.umd.min.js') continue; // Chart.js enthält nur Lizenz-/Doku-URLs, lädt nichts nach
      let src = readFileSync(p, 'utf8').replace(XMLNS_RE, '');
      if (['.css', '.js', '.mjs', '.cjs', '.html', '.htm', '.svg', '.xml'].includes(ext)) {
        src = src.replace(/\/\*[\s\S]*?\*\//g, '')          // CSS/JS-Blockkommentare
                 .replace(/<!--[\s\S]*?-->/g, '');              // HTML-/SVG-Kommentare
      }
      if (['.js', '.mjs', '.cjs'].includes(ext)) src = src.replace(/^\s*\/\/.*$/gm, '');   // JS-Zeilenkommentare (ganze Zeile)
      const hit = src.match(URL_RE);
      if (hit) offenders.push(`${p}: ${hit[0]}`);
    }
  })(root);
  return offenders;
}
// --scan <ordner>: nur diese Prüfung (Tests; Exit 0 = keine externe Adresse)
if (process.argv[2] === '--scan') {
  const o = scanDir(process.argv[3]);
  console.log(o.length ? 'FEHLER: externe Adresse\n  ' + o.join('\n  ') : 'keine externen Adressen');
  process.exit(o.length ? 1 : 0);
}

// FileProvider der fertigen APK (v2.10, Release-Audit a1): Die erste Fassung las nur path-Werte per Regex aus xml/file_paths
// und ließ so durch: ein Element ohne path (gibt die ganze Wurzel frei), eine zweite Fassung res/xml-v24/, einen Provider, der
// auf eine andere Datei zeigt. Jetzt als Baum: genau EIN androidx-FileProvider, dessen FILE_PROVIDER_PATHS-Verweis aufgelöst,
// genau EINE Fassung "()" dieser Ressource, darin genau zwei Einträge mit genau den Attributen name + path (ohne Namensraum):
// external-path "Documents/" und cache-path ".". Gibt eine Liste von Problemen zurück (leer = eng gefasst); Werkzeugfehler werfen.
function aaptTree(out) {
  const root = { tag: '#root', attrs: {}, children: [], indent: -1 };
  const stack = [root];
  for (const line of out.split('\n')) {
    const m = line.match(/^(\s*)([ENA]): (.*)$/);
    if (!m) continue;
    const indent = m[1].length, kind = m[2], rest = m[3];
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    if (kind === 'E') {
      const node = { tag: rest.split(' ')[0], attrs: {}, children: [], indent };
      parent.children.push(node);
      stack.push(node);
    } else if (kind === 'A') {
      const eq = rest.indexOf('=');
      const key = rest.slice(0, eq), raw = rest.slice(eq + 1);
      const q = raw.match(/^"([^"]*)"/);
      parent.attrs[key] = q ? q[1] : raw.split(' ')[0];
    }
  }
  return root;
}
function walkTree(node, fn) { fn(node); node.children.forEach(c => walkTree(c, fn)); }
const ANDROID = 'http://schemas.android.com/apk/res/android:';
const aAttr = (node, name) => Object.entries(node.attrs).find(([k]) => k.startsWith(ANDROID + name + '('))?.[1];
function fileProviderProblems(apk, aapt2) {
  const run = args => execFileSync(aapt2, args, { encoding: 'utf8', maxBuffer: 1 << 30 });
  const problems = [];
  // Runde 2: Provider über den Pfad-Verweis sammeln, egal welche Klasse (ein Plugin kann eine eigene FileProvider-Unterklasse
  // mit eigener Pfaddatei mitbringen) — genau einer, und zwar der androidx-FileProvider.
  const isPathsMeta = c => c.tag === 'meta-data' && aAttr(c, 'name') === 'android.support.FILE_PROVIDER_PATHS';
  const providers = [];
  walkTree(aaptTree(run(['dump', 'xmltree', '--file', 'AndroidManifest.xml', apk])), n => {
    if (n.tag === 'provider' && n.children.some(isPathsMeta)) providers.push(n);
  });
  if (providers.length !== 1 || aAttr(providers[0], 'name') !== 'androidx.core.content.FileProvider') {
    return [`${providers.length} Provider mit FILE_PROVIDER_PATHS (${providers.map(p => aAttr(p, 'name')).join(', ')}), erwartet genau der androidx-FileProvider`];
  }
  const metas = providers[0].children.filter(isPathsMeta);
  const resId = metas.length === 1 ? aAttr(metas[0], 'resource') : null;
  if (!resId || !/^@0x[0-9a-f]{8}$/.test(resId)) return ['FILE_PROVIDER_PATHS-Verweis fehlt oder ist mehrdeutig'];
  const res = run(['dump', 'resources', apk]).split('\n');
  const at = res.findIndex(l => new RegExp(`^\\s+resource ${resId.slice(1)} `).test(l));
  if (at < 0) return [`Ressource ${resId} nicht gefunden`];
  const configs = [];
  for (let i = at + 1; i < res.length && !/^\s+resource /.test(res[i]) && !/^\s*type /.test(res[i]); i++) {
    const c = res[i].match(/^\s+\(([^)]*)\) \(file\) (\S+)/);
    if (c) configs.push(c);
  }
  if (configs.length !== 1 || configs[0][1] !== '') return [`FileProvider-Pfade in ${configs.length} Fassungen (${configs.map(c => '(' + c[1] + ')').join(' ')}), erwartet genau "()"`];
  // Runde 2: FileProvider liest JEDES Element unabhängig von der Tiefe — <paths> muss die Wurzel sein, Einträge ohne Kinder.
  const doc = aaptTree(run(['dump', 'xmltree', '--file', configs[0][2], apk]));
  if (doc.children.length !== 1 || doc.children[0].tag !== 'paths') return ['file_paths: Wurzel ist nicht genau ein <paths>'];
  const paths = [doc.children[0]];
  if (paths[0].children.some(c => c.children.length)) return ['file_paths: verschachtelte Einträge'];
  const got = paths[0].children.map(c => {
    const keys = Object.keys(c.attrs).sort().join(',');
    return keys === 'name,path' ? `${c.tag}:${c.attrs.path}` : `${c.tag}[${keys || 'ohne Attribute'}]`;
  }).sort();
  if (got.join(' ') !== 'cache-path:. external-path:Documents/') problems.push(`FileProvider-Pfade nicht eng gefasst (${got.join(' ') || 'leer'})`);
  return problems;
}
// Prüfwerkzeuge (v2.11, Querfund 10): build-apk.sh/make-release.sh setzen FIT_WZ auf den Ordner der gepinnten Kopien (apk/werkzeuge.sh)
// und rufen dieses Skript mit `env -i` auf; ohne FIT_WZ (Tests von Hand) gilt das SDK. unzip immer aus /usr/bin (Querfund 11).
const toolDir = () => process.env.FIT_WZ || `${process.env.ANDROID_HOME || process.env.HOME + '/Android/sdk'}/build-tools/34.0.0`;
const UNZIP = '/usr/bin/unzip';

// Signing Block der APK (v2.11, Querfund 13 aus Alien Notes run-13 H-1): IDs der Paare in Dateireihenfolge, null = kein Block.
// Die EOCD muss genau am Ende stehen (kein ZIP-Kommentar), Längen und Ende des Blocks müssen aufgehen — sonst Fehler statt Raten.
// AGP 8.x legt sonst einen DEPENDENCY_INFO-Block (0x504b4453, mit Googles Schlüssel verschlüsselte Abhängigkeitsliste, ~3 KB) hinein —
// gemessen in der veröffentlichten APK 2.10.0. Abgeschaltet per dependenciesInfo (unten, Schritt 6).
function sigBlockIds(apk) {
  const b = readFileSync(apk);
  const e = b.length - 22;
  if (e < 0 || b.readUInt32LE(e) !== 0x06054b50 || b.readUInt16LE(e + 20) !== 0) throw new Error('EOCD nicht am Dateiende');
  const cd = b.readUInt32LE(e + 16);
  if (cd > e) throw new Error('Central Directory hinter der EOCD');
  if (cd < 32 || b.toString('latin1', cd - 16, cd) !== 'APK Sig Block 42') return null;
  const sz = Number(b.readBigUInt64LE(cd - 24)), st = cd - sz - 8;
  if (st < 0 || Number(b.readBigUInt64LE(st)) !== sz) throw new Error('Kopf des Signing Blocks');
  const ids = [];
  let p = st + 8;
  while (p < cd - 24) {
    const len = Number(b.readBigUInt64LE(p));
    if (len < 4 || p + 8 + len > cd - 24) throw new Error('Paar im Signing Block');
    ids.push(b.readUInt32LE(p + 8).toString(16).padStart(8, '0'));
    p += 8 + len;
  }
  if (p !== cd - 24) throw new Error('Ende des Signing Blocks');
  return ids;
}
// Signatur der fertigen APK: genau v1 (CERT.SF/CERT.RSA/MANIFEST.MF) + v2, im Signing Block nur v2 (+ Füllung 0x42726577), kein Eintragsname doppelt
// (unzip entpackt den letzten, Android sähe womöglich den ersten; Notes run-13 H-1/m2)
function signatureProblems(apk) {
  const problems = [];
  const ids = sigBlockIds(apk), got = ids ? ids.join(' ') : 'kein';
  if (got !== '7109871a' && got !== '7109871a 42726577') problems.push(`Signing Block nicht genau v2 (+ Füllung): ${got}${/504b4453/.test(got) ? ' — DEPENDENCY_INFO (dependenciesInfo nicht abgeschaltet)' : ''}`);
  const names = execFileSync(UNZIP, ['-Z1', apk], { encoding: 'utf8', maxBuffer: 1 << 30 }).split('\n').filter(Boolean);
  const seen = new Set(), dup = new Set();
  for (const n of names) (seen.has(n) ? dup : seen).add(n);
  if (dup.size) problems.push(`doppelte Eintragsnamen: ${[...dup].slice(0, 3).join(', ')}`);
  const sig = names.filter(n => /^META-INF\/([^/]+\.(SF|RSA|EC|DSA)|MANIFEST\.MF)$/i.test(n)).sort();
  if (sig.join(' ') !== 'META-INF/CERT.RSA META-INF/CERT.SF META-INF/MANIFEST.MF') problems.push(`Signaturdateien nicht genau CERT.RSA/CERT.SF/MANIFEST.MF (${sig.join(', ') || 'keine'})`);
  return problems;
}
// --check-sigblock <apk>: nur diese Prüfung (Tests; Exit 0 = nur v2 + Füllung, drei Signaturdateien, keine Dubletten)
if (process.argv[2] === '--check-sigblock') {
  let p;
  try { p = signatureProblems(process.argv[3]); } catch (e) { p = [`APK-Aufbau nicht wie erwartet (${e.message})`]; }
  console.log(p.length ? 'FEHLER: ' + p.join('; ') : 'Signatur: nur v1 + v2 (Signing Block ohne Zusatzblock), keine doppelten Einträge.');
  process.exit(p.length ? 1 : 0);
}

// --check-fileprovider <apk>: nur diese Prüfung (Tests mit präparierten APKs; Exit 0 = eng gefasst)
if (process.argv[2] === '--check-fileprovider') {
  const p = fileProviderProblems(process.argv[3], `${toolDir()}/aapt2`);
  console.log(p.length ? 'FEHLER: ' + p.join('; ') : 'FileProvider eng gefasst (Documents/ + Cache).');
  process.exit(p.length ? 1 : 0);
}

// --check-apk <apk>: Prüfungen an der FERTIGEN APK, nicht an Zwischendateien (Audit run-2). Laufen in build-apk.sh
// UND in make-release.sh — eine APK aus einem anderen Build-Weg (Gradle von Hand, Android Studio, nach `npm ci`
// ungepatcht) kommt so nicht raus. Bei einem Verstoß wird die APK gelöscht; jeder Werkzeugfehler bricht ab.
//   a) Berechtigungen (aapt2): nur ALLOWED_PERMS, REQUIRED_PERMS vorhanden, kein INTERNET.
//   b) Share-Plugin im Bytecode (dexdump, alle Klassen unter com/capacitorjs/plugins/share/): kein Receiver
//      (Oberklasse, Registrierungs-Signatur auch über D8-Outlines), kein Rückruf, keine CHOSEN_COMPONENT-Aktion.
//   c) DisableDeploy=true in der kompilierten config.xml der APK (Pfad über die Ressourcentabelle, AGP kürzt ihn).
//   d) FileProvider der APK als Baum (fileProviderProblems): ein Provider, eine Fassung, genau Documents/ + App-Cache (v2.10).
if (process.argv[2] === '--check-apk') {
  const apk = process.argv[3];
  const bt = toolDir();
  const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 30 });
  const problems = [];
  let perms = [];
  try {
    problems.push(...signatureProblems(apk));   // v2.11: vor dem ersten aapt2-Aufruf (Dubletten)
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
      run(UNZIP, ['-q', '-o', apk, 'classes*.dex', '-d', tmp]);
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

    problems.push(...fileProviderProblems(apk, `${bt}/aapt2`));
  } catch (e) {
    console.error(`FEHLER: APK-Prüfung nicht durchführbar (${e.message.split('\n')[0]}) — abgebrochen.`);
    process.exit(1);
  }
  if (problems.length) {
    console.error(`FEHLER: APK-Prüfung (${apk}): ${problems.join('; ')} — APK gelöscht!`);
    try { unlinkSync(apk); } catch (e) {}
    process.exit(1);
  }
  console.log(`APK geprüft (${apk}): Berechtigungen ${perms.join(', ')}; Share ohne Receiver/Rückruf; DisableDeploy gesetzt; FileProvider nur Documents/ + Cache; Signatur v1 + v2 ohne Zusatzblock.`);
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

// 5) FileProvider eng fassen (v2.10, Hinweis aus Audit run-2): Das Capacitor-Template gibt den GANZEN externen
//    Speicher (external-path ".") und den ganzen Cache frei. Geteilt wird nur das Backup, und zwar aus „Documents“
//    (Filesystem DOCUMENTS = Environment.DIRECTORY_DOCUMENTS) oder aus dem App-Cache (Rückfall, saveBackupFile).
//    Die Kamera-Aufnahme der WebView (BridgeWebChromeClient, getExternalFilesDir) braucht die App nicht: das
//    einzige <input type="file"> (Backup-Import) hat kein capture. Datei wird bei jedem Build vollständig geschrieben.
const PATHS = 'android/app/src/main/res/xml/file_paths.xml';
const PATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- alien-fitness: eng gefasst (patch-hardening.mjs, v2.10): nur das Backup in Documents/ und der App-Cache -->
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="documents" path="Documents/" />
    <cache-path name="cache" path="." />
</paths>
`;
if (readFileSync(PATHS, 'utf8') !== PATHS_XML) { writeFileSync(PATHS, PATHS_XML); console.log('FileProvider-Pfade eng gefasst (Documents/ + Cache).'); }
else console.log('FileProvider-Pfade bereits eng gefasst.');

// 6) Keine verschlüsselte Abhängigkeitsliste im Signing Block (v2.11, Querfund 13 aus Alien Notes run-13 H-1): AGP 8.x bettet sonst einen
//    DEPENDENCY_INFO-Block ein (mit Googles öffentlichem Schlüssel verschlüsselt, nur für Google lesbar; in der APK 2.10.0 gemessen: 3236 Byte) —
//    Daten in der eigenen APK, die man selbst nicht prüfen kann. Genau einmal und nur in app/build.gradle; --check-apk prüft den Signing Block.
const GRADLE = 'android/app/build.gradle';
const DEPINFO = '    dependenciesInfo {\n        // Alien Fitness: keine verschlüsselte Abhängigkeitsliste im Signing Block (patch-hardening.mjs)\n        includeInApk = false\n        includeInBundle = false\n    }\n';
let g = readFileSync(GRADLE, 'utf8');
if (!g.includes(DEPINFO)) { g = g.replace(/^android \{\n/m, () => 'android {\n' + DEPINFO); writeFileSync(GRADLE, g); console.log('build.gradle: dependenciesInfo abgeschaltet.'); }
else console.log('build.gradle: dependenciesInfo bereits abgeschaltet.');
{
  const g2 = readFileSync(GRADLE, 'utf8'), TOK = /dependenciesInfo|includeInApk|includeInBundle/g, fremd = [];
  const lauf = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = d + '/' + e.name;
    if (e.isDirectory()) { if (e.name !== 'build' && e.name !== '.gradle') lauf(f); }
    else if (/\.gradle(\.kts)?$|\.properties$/.test(e.name) && f !== GRADLE && TOK.test(readFileSync(f, 'utf8'))) fremd.push(f);
    TOK.lastIndex = 0; } };
  lauf('android');
  if (g2.split(DEPINFO).length !== 2 || (g2.match(TOK) || []).length !== 3 || (g2.match(/^android \{$/gm) || []).length !== 1 || fremd.length) {
    console.error('FEHLER: dependenciesInfo nicht genau einmal abgeschaltet' + (fremd.length ? ' (auch in ' + fremd.join(', ') + ')' : '') + ' — Build abgebrochen!');
    process.exit(1);
  }
}

// 2) Kein externer Verweis im gebündelten Frontend (Prüffunktion scanDir oben).
const offenders = scanDir('www');
if (offenders.length) {
  console.error('FEHLER: externe URL im gebündelten Frontend — Build abgebrochen!\n  ' + offenders.join('\n  '));
  process.exit(1);
}
console.log('www/: keine externen Adressen (http/https/ws/wss/ftp, //host) in den Textdateien.');
