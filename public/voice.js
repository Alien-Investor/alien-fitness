// Ansagen im Training (v2.10): Thorsten sagt „Mach dich bereit“, „Los geht's“, „Pause“ … (Kerstin bleibt bei Text und
// Porträt: ihre Piper-Stimme kerstin-low klang in kurzen Rufen abgehackt, Hörprobe 10.11.2026).
// Die Tondateien sind vorab erzeugt (apk/make-voice.sh, Piper lokal) und liegen gebündelt unter
// audio/<stimme>/<sprache>/<cue>-<n>.ogg; audio/manifest.json nennt je Sprache die Zahl der Varianten.
// Keine Sprach-Engine, kein Netz: fetch nur auf die eigene Herkunft (CSP connect-src 'self').
// Abgespielt über Web Audio wie der Piepton, nicht über <audio> — Musik aus anderen Apps soll weiterlaufen.
// Fehlt eine Datei oder lässt sie sich nicht dekodieren, liefert say() false und der Aufrufer piept wie bisher.
window.Voice = (() => {
  const KEY = 'fit-voice';                       // Komfort-Einstellung, nicht im Backup
  const CHOICES = ['thorsten', 'off'];
  const DEFAULT = 'thorsten';
  let ctx = null;
  let manifest = null;                           // { de: { go: 3, … }, en: { … } }
  const buffers = new Map();                     // 'thorsten/de/go-1' → AudioBuffer | null (fehlt/kaputt)
  const loads = new Map();                       // 'thorsten/de' → Promise des Vorladens
  let playing = null;                            // laufende Ansage; eine neue unterbricht sie
  let idleTimer = null;
  let suspending = null;                         // laufendes suspend(): state ist bis zu dessen Ende noch 'running'

  function get() {
    // Unbekannter oder alter Wert (Testbuilds kannten noch 'kerstin') → Thorsten
    try { const v = localStorage.getItem(KEY); return CHOICES.includes(v) ? v : DEFAULT; } catch (e) { return DEFAULT; }
  }
  function on() { return get() !== 'off'; }
  function lang() { return window.I18N && I18N.lang === 'en' ? 'en' : 'de'; }

  // Ein Kontext für Ansagen und Piepton. Zum Abspielen geweckt, nach 3 s Stille angehalten (idle): ein laufender
  // Kontext hält einen Audio-Strom offen und kostet Akku — v2.9 schloss deshalb jeden Piepton-Kontext wieder.
  // Ein Start auf dem angehaltenen Kontext erklingt, sobald resume() greift (wenige Millisekunden).
  // Läuft gerade ein suspend() (Release-Durchsicht v2.10), meldet der Kontext noch 'running' — ein Start in diesem Fenster
  // bliebe nach dem Einschlafen stumm. Deshalb nach dessen Ende wecken.
  function audioCtx() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
    }
    clearTimeout(idleTimer);
    if (ctx) {
      if (suspending) suspending.then(() => ctx.resume().catch(() => {}));
      else if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    }
    return ctx;
  }
  function idle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (playing || !ctx || ctx.state !== 'running' || suspending) return;
      const p = ctx.suspend().catch(() => {});
      suspending = p;
      p.then(() => { if (suspending === p) suspending = null; });
    }, 3000);
  }

  async function loadManifest() {
    if (manifest) return manifest;
    try { const r = await fetch('audio/manifest.json'); manifest = r.ok ? await r.json() : {}; }
    catch (e) { manifest = {}; }
    if (!manifest || typeof manifest !== 'object') manifest = {};
    return manifest;
  }

  // Alle Ansagen der gewählten Stimme in der aktuellen Sprache dekodieren (einmal je Kombination)
  function preload() {
    const v = get();
    if (v === 'off') return Promise.resolve();
    const tag = `${v}/${lang()}`;
    if (loads.has(tag)) return loads.get(tag);
    const p = (async () => {
      const cues = (await loadManifest())[tag.split('/')[1]] || {};
      const c = audioCtx();
      if (!c) return;
      const jobs = [];
      for (const [cue, n] of Object.entries(cues)) {
        for (let i = 1; i <= Math.min(9, Number(n) || 0); i++) {
          const key = `${tag}/${cue}-${i}`;
          jobs.push((async () => {
            try {
              const r = await fetch(`audio/${key}.ogg`);
              if (!r.ok) throw new Error(r.status);
              buffers.set(key, await c.decodeAudioData(await r.arrayBuffer()));
            } catch (e) { buffers.set(key, null); }
          })());
        }
      }
      await Promise.all(jobs);
      idle();
    })();
    loads.set(tag, p);
    return p;
  }

  function stop() {
    if (playing) { try { playing.stop(); } catch (e) {} playing = null; }
  }

  // Ansage abspielen (Variante zufällig). true = gespielt, dann lässt der Aufrufer den Piepton weg.
  function say(cue) {
    if (!cue || !on()) return false;
    const l = lang();
    const n = Math.min(9, Number(manifest && manifest[l] && manifest[l][cue]) || 0);
    if (!n) return false;
    const buf = buffers.get(`${get()}/${l}/${cue}-${1 + Math.floor(Math.random() * n)}`);
    const c = audioCtx();
    if (!buf || !c) return false;
    try {
      stop();
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.onended = () => { if (playing === src) playing = null; idle(); };
      src.start();
      playing = src;
      return true;
    } catch (e) { return false; }
  }

  // Umschalten Thorsten ↔ Aus; eingeschaltet meldet er sich kurz („Hier ist Thorsten.“)
  function next() {
    const v = CHOICES[(CHOICES.indexOf(get()) + 1) % CHOICES.length];
    try { localStorage.setItem(KEY, v); } catch (e) {}
    stop();
    if (v !== 'off') preload().then(() => { if (get() === v) say('hi'); });
    return v;
  }

  return { get, on, next, say, stop, preload, audioCtx, idle };
})();
