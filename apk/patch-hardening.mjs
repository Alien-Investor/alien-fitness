// Härtet das (regenerierbare) android/-Projekt idempotent. Läuft in build-apk.sh nach
// `npx cap sync android` — überlebt damit auch ein frisches `npx cap add android`.
//
//   1) AndroidManifest: INTERNET-Permission ENTFERNEN. Die App ist rein lokal (seed.json,
//      Fonts und Chart.js gebündelt, Verlauf in IndexedDB) — ohne die Berechtigung kann sie
//      nachweisbar nicht funken, egal was im WebView passiert.
//   2) www/: Sicherung, dass kein Frontend-Asset auf http(s):// verweist (z.B. ein
//      versehentlich wieder eingebauter Google-Fonts-Import).
//
// allowBackup bleibt absichtlich auf true: der Trainingsverlauf ist nicht geheim, und ein
// Geräteumzug via Seedvault/Gerät-zu-Gerät soll ihn mitnehmen.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const MANIFEST = 'android/app/src/main/AndroidManifest.xml';
let m = readFileSync(MANIFEST, 'utf8');
const before = m;
m = m.replace(/^\s*<uses-permission android:name="android\.permission\.INTERNET"\s*\/>\s*$/gm, '');
if (m !== before) writeFileSync(MANIFEST, m);
// Invariante IMMER prüfen — sonst rutscht ein gedriftetes Template still un-gehärtet durch.
if (/android\.permission\.INTERNET/.test(m)) {
  console.error('FEHLER: INTERNET-Permission noch im Manifest — Build abgebrochen!');
  process.exit(1);
}
console.log(m !== before ? 'Manifest gehärtet (INTERNET entfernt).' : 'Manifest bereits gehärtet (keine INTERNET-Permission).');

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
