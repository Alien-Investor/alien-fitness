'use strict';

// Versionsanzeige (unten in der Anleitung). Einzige Quelle ist die VERSION-Datei:
// apk/build-www.sh setzt diese Konstante beim APK-Build aus VERSION_NAME, e2e-test.mjs
// prüft den Abgleich. Beim Web-Redeploy ebenfalls mit VERSION_NAME synchron halten.
const APP_VERSION = '2.10.0';

// ── Offline-Datenschicht ────────────────────────────────────────────────────────
// Die App läuft rein lokal: Stammdaten aus der gebündelten seed.json, der
// Trainingsverlauf in IndexedDB (local-db.js). Kein Server, kein Konto, keine
// Daten verlassen das Gerät. Die api()-Signatur bleibt identisch zum früheren
// Express-Backend, damit die restliche App unverändert weiterläuft.
async function api(path, opts = {}) {
  await LocalData.ready;
  const method = (opts.method || 'GET').toUpperCase();
  const [route, queryStr] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryStr || ''));
  const seg = route.split('/');            // z.B. ['plans','3'] oder ['sessions']

  switch (seg[0]) {
    case 'stats':     return LocalData.getStats();
    case 'plans':     return seg[1] ? LocalData.getPlan(seg[1]) : LocalData.getPlans();
    case 'exercises': return seg[1] ? LocalData.getExercise(seg[1]) : LocalData.getExercises(query);
    case 'progress':  return LocalData.getProgress(seg[1]);
    case 'sessions':
      if (method === 'POST') return LocalData.addSession(JSON.parse(opts.body || '{}'));
      return seg[1] ? LocalData.getSession(seg[1]) : LocalData.getSessions(Number(query.limit) || 20);
    default: throw new Error('Unbekannte Route: ' + path);
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
const views = document.querySelectorAll('.view');
const navBtns = document.querySelectorAll('nav button');

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.view;
    navBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    views.forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + target).classList.add('active');
    if (target === 'dashboard') loadDashboard();
    if (target === 'workout') loadWorkoutSelect();
    if (target === 'progress') loadProgressView();
    if (target === 'library') loadLibrary();
    if (target === 'history') loadHistory();
  });
});

// ── Help Modal ────────────────────────────────────────────────────────────────
const helpOverlay = document.getElementById('help-overlay');
document.getElementById('btn-help').addEventListener('click', () => helpOverlay.classList.add('open'));
function renderAbout() {
  const el = document.getElementById('about-line');
  if (el) el.textContent = I18N.t('about', { v: APP_VERSION });
}
document.getElementById('btn-help-close').addEventListener('click', () => helpOverlay.classList.remove('open'));
helpOverlay.addEventListener('click', e => { if (e.target === helpOverlay) helpOverlay.classList.remove('open'); });

// ── Lightbox ──────────────────────────────────────────────────────────────────
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxCaption = document.getElementById('lightbox-caption');

function openLightbox(src, caption) {
  lightboxImg.src = src;
  lightboxCaption.textContent = caption || '';
  lightbox.classList.add('open');
}
lightbox.addEventListener('click', () => lightbox.classList.remove('open'));

// ── Rückfrage-Dialog (v2.8) statt confirm()/alert() ────────────────────────────
// Der Android-Systemdialog (Capacitor-AlertDialog) erbt FLAG_SECURE nicht: ein Screenshot
// bei offener Löschnachfrage zeigte den Text, während die App dahinter schwarz war
// (Querfund Alien Notes, Gerätetest 25.09.2026). Muster: Alien Pass v1.9 / Sachwert-Tresor v3.5.
//   ask(msg, { ok, cancel, danger }) → Promise<boolean>. ok/cancel sind i18n-Schlüssel (je Frage
//   der passende Knopf, nie nur „OK“), danger färbt den OK-Knopf rot (.btn.red).
//   ask(msg, { alert: true }) → nur „OK“ (alert()-Ersatz), Fokus auf OK.
// Nur ein Dialog zur Zeit — eine zweite Frage gilt sofort als abgelehnt (Doppeltipp).
// Fokus-Vorgabe „Abbrechen“ (Enter tut nichts Schlimmes), Escape und ein Tipp auf den
// Hintergrund brechen ab, Tab pendelt zwischen den Knöpfen. Text NUR per textContent
// (Plan-Namen sind Nutzer-/Importdaten). Jeder Aufrufer ist async und prüft nach dem await
// seinen Zustand neu (Einheit noch aktiv? Detail noch offen? Draft noch derselbe?).
let dlgResolve = null, dlgPrev = null, dlgOpenedAt = 0;
// Echte Tipps auf „OK“/Hintergrund in den ersten 400 ms zählen nicht (Audit run-2 R2-1): der Dialog öffnet
// sofort beim ersten Tipp, der zweite Tipp eines Doppeltipps landete sonst auf dem roten „Verwerfen“ an derselben
// Stelle. Programmatische Klicks (isTrusted=false, Tests) und Tastatur (Enter/Escape) sind nicht betroffen.
const DLG_ARM_MS = 400;
const dlgTooEarly = e => e && e.isTrusted && performance.now() - dlgOpenedAt < DLG_ARM_MS;
function ask(msg, opt) {
  opt = opt || {};
  if (dlgResolve) return Promise.resolve(false);
  return new Promise(res => {
    dlgResolve = res;
    dlgOpenedAt = performance.now();
    dlgPrev = document.activeElement;
    document.getElementById('dlg-msg').textContent = msg;
    const ok = document.getElementById('dlg-ok');
    const cancel = document.getElementById('dlg-cancel');
    ok.textContent = I18N.t(opt.ok || 'dlg.ok');
    ok.classList.toggle('red', !!opt.danger);
    cancel.textContent = I18N.t(opt.cancel || 'dlg.cancel');
    cancel.classList.toggle('hidden', !!opt.alert);
    document.getElementById('dlg').classList.remove('hidden');
    (opt.alert ? ok : cancel).focus();
  });
}
function dialogClose(v) {
  const r = dlgResolve;
  if (!r) return;
  dlgResolve = null;
  document.getElementById('dlg').classList.add('hidden');
  document.getElementById('dlg-msg').textContent = '';
  document.getElementById('dlg-ok').classList.remove('red');
  document.getElementById('dlg-cancel').classList.remove('hidden');
  const f = dlgPrev; dlgPrev = null;
  if (f && document.contains(f) && typeof f.focus === 'function') { try { f.focus(); } catch (e) {} }
  r(!!v);
}
function dialogOpen() { return !!dlgResolve; }
// Tastatur bei offenem Dialog: Escape bricht ab, Tab pendelt; alles andere bleibt beim
// fokussierten Knopf (Enter löst ihn aus). Liefert true, wenn die Taste verbraucht ist.
function dialogKey(e) {
  if (!dlgResolve) return false;
  if (e.key === 'Escape') { dialogClose(false); return true; }
  if (e.key === 'Tab') {
    const ring = ['dlg-cancel', 'dlg-ok'].map(id => document.getElementById(id))
      .filter(n => !n.classList.contains('hidden'));
    const i = ring.indexOf(document.activeElement);
    ring[(i + (e.shiftKey ? -1 : 1) + ring.length) % ring.length].focus();
    return true;
  }
  return false;
}
document.getElementById('dlg-ok').addEventListener('click', e => { if (!dlgTooEarly(e)) dialogClose(true); });
document.getElementById('dlg-cancel').addEventListener('click', () => dialogClose(false));
document.getElementById('dlg').addEventListener('click', e => { if (e.target.id === 'dlg' && !dlgTooEarly(e)) dialogClose(false); });

document.addEventListener('keydown', e => {
  if (dialogKey(e)) { e.preventDefault(); return; }   // offener Dialog: Escape bricht ab, Tab pendelt
  if (e.key === 'Escape') {
    // Ein offenes Auswahlmenü schluckt Escape. Sonst schlösse die Taste den Plan-Editor
    // mitsamt der halb fertigen Eingabe, obwohl nur das Menü weg sollte.
    if (closeMenus()) return;
    lightbox.classList.remove('open');
    helpOverlay.classList.remove('open');
    const picker = document.getElementById('picker-overlay');
    const editor = document.getElementById('editor-overlay');
    if (picker) picker.classList.remove('open');
    if (editor) editor.classList.remove('open');
    const sess = document.getElementById('session-overlay');
    if (sess) sess.classList.remove('open');
    if (pendingHold) closeHoldModal();
  }
});

// ── HTML-Escape (Plan-Namen sind seit v2.5 Nutzereingaben) ────────────────────
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Auswahlfelder (Kombifelder, v2.7) ─────────────────────────────────────────
// Die aufgeklappte Liste eines nativen <select> ist in der Android-WebView grau und
// nicht gestaltbar. Deshalb bleibt das <select> als Wertspeicher im DOM (unsichtbar,
// .combo-native) und darüber liegen Knopf und Menü im Cyan-Look. Muster: Alien Pass v1.5.
//
// WICHTIG: chooseOpt-Pfad setzt sel.value und feuert ein bubbelndes change-Event —
// bestehende change-Listener und .value-Leser der App bleiben dadurch unverändert.
// Optionstexte NUR per textContent: Übungs- und Plan-Namen können aus einem fremden
// Backup stammen (Dauerregel „Backup-Import ist fremde Eingabe", local-db.js).
const COMBO_FILTER_MIN = 8;   // ab so vielen Optionen bekommt das Menü ein Filterfeld
const COMBO_MENU_MIN_W = 260; // Mindestbreite: die Übungsspalte im Editor ist auf dem Handy schmal

function closeMenus() {
  let wasOpen = false;
  document.querySelectorAll('.combo-menu:not(.hidden)').forEach(m => {
    wasOpen = true;
    m.classList.add('hidden');
    m.replaceChildren();
    const btn = m.parentElement && m.parentElement.querySelector('.combo-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
  return wasOpen;
}

function syncCombo(combo) {
  if (!combo) return;
  const sel = combo.querySelector('.combo-native');
  const lab = combo.querySelector('.combo-label');
  if (!sel || !lab) return;
  const o = sel.options[sel.selectedIndex];
  lab.textContent = o ? o.textContent : '';
}

function syncCombos(root) {
  (root || document).querySelectorAll('.combo').forEach(syncCombo);
}

// Das Menü ist position:fixed (der Plan-Editor scrollt seine Zeilen in #editor-rows,
// ein absolut positioniertes Menü würde dort abgeschnitten). Also von Hand an den Knopf
// hängen, mindestens COMBO_MENU_MIN_W breit, horizontal im Bild halten — und dorthin
// aufklappen, wo mehr Platz ist.
function placeComboMenu(combo, menu) {
  const r = combo.getBoundingClientRect();
  const vw = window.innerWidth;
  const below = window.innerHeight - r.bottom - 8;
  const above = r.top - 8;
  const width = Math.min(Math.max(r.width, COMBO_MENU_MIN_W), vw - 16);
  menu.style.left = Math.max(8, Math.min(r.left, vw - 8 - width)) + 'px';
  menu.style.width = width + 'px';
  if (below >= above) {
    menu.style.top = (r.bottom + 4) + 'px';
    menu.style.bottom = 'auto';
    menu.style.maxHeight = Math.max(120, below) + 'px';
  } else {
    menu.style.top = 'auto';
    menu.style.bottom = (window.innerHeight - r.top + 4) + 'px';
    menu.style.maxHeight = Math.max(120, above) + 'px';
  }
}

function comboOpt(label, value, on, pick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'combo-opt' + (on ? ' on' : '');
  b.dataset.value = value;
  b.textContent = label;
  b.addEventListener('click', () => pick(value));
  return b;
}

function openCombo(combo) {
  const sel = combo.querySelector('.combo-native');
  const menu = combo.querySelector('.combo-menu');
  const btn = combo.querySelector('.combo-btn');
  if (!sel || !menu) return;
  closeMenus();

  const opts = [...sel.options];
  // Guard (Kit chooseOpt, v2.8): nur Werte aus sel.options — ein fremder Wert setzte sonst
  // selectedIndex -1 — und bei gleichem Wert kein change (sonst unnötiges Neuzeichnen/Speichern).
  const pick = value => {
    closeMenus();
    if (!opts.some(o => o.value === value) || sel.value === value) return;
    sel.value = value;
    syncCombo(combo);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const list = document.createElement('div');
  list.className = 'combo-list';
  const render = q => {
    const needle = q.trim().toLowerCase();
    const hits = opts.filter(o => !needle || o.textContent.toLowerCase().includes(needle));
    list.replaceChildren();
    if (!hits.length) {
      const empty = document.createElement('div');
      empty.className = 'combo-empty';
      empty.textContent = I18N.t('combo.noHit');
      list.appendChild(empty);
      return;
    }
    hits.forEach(o => list.appendChild(comboOpt(o.textContent, o.value, o.value === sel.value, pick)));
  };

  // Lange Listen (Übungsauswahl im Plan-Editor, Fortschritts-Chart) filtern beim Tippen.
  if (opts.length >= COMBO_FILTER_MIN) {
    const f = document.createElement('input');
    f.type = 'text';
    f.className = 'combo-filter';
    f.placeholder = I18N.t('combo.filterPh');
    f.autocomplete = 'off';
    f.spellcheck = false;
    f.addEventListener('input', () => render(f.value));
    f.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const first = list.querySelector('.combo-opt');
      if (first) first.click();
    });
    menu.appendChild(f);
  }
  menu.appendChild(list);
  render('');
  menu.classList.remove('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'true');
  placeComboMenu(combo, menu);
  const filter = menu.querySelector('.combo-filter');
  if (filter) setTimeout(() => filter.focus(), 30);
}

function toggleCombo(combo) {
  const menu = combo.querySelector('.combo-menu');
  if (menu && !menu.classList.contains('hidden')) { closeMenus(); return; }
  openCombo(combo);
}

// Delegation: so brauchen die per JS erzeugten Zeilen im Plan-Editor keine eigenen Listener.
document.addEventListener('click', e => {
  const btn = e.target.closest('.combo-btn');
  if (btn) { toggleCombo(btn.closest('.combo')); return; }
  if (!e.target.closest('.combo-menu')) closeMenus();
});

// Scroll und Resize richten das offene Menü neu am Knopf aus, statt es zu schließen.
// NICHT auf closeMenus umstellen: auf dem Handy öffnet der Fokus im Filterfeld die
// Tastatur, die WebView schrumpft (resize) und scrollt das Feld ins Bild — das Menü
// klappte sonst sofort wieder zu (Fund aus dem Diff-Review zu v2.7).
function placeOpenMenus() {
  document.querySelectorAll('.combo-menu:not(.hidden)').forEach(m => placeComboMenu(m.parentElement, m));
}
document.addEventListener('scroll', placeOpenMenus, true);
window.addEventListener('resize', placeOpenMenus);

// ── Image helper ──────────────────────────────────────────────────────────────
const MUSCLE_ICONS = {
  'Brust': '💪', 'Rücken': '🏋', 'Beine': '🦵', 'Schultern': '🔝',
  'Bizeps': '💪', 'Trizeps': '💪', 'Core': '⚡', 'Ganzkörper': '🔥',
};

function exImageEl(ex, isLibrary = false) {
  const imgId = ex.exercise_id || ex.id;
  const src = `images/exercises/${imgId}.png`;
  const img = new Image();
  img.src = src;
  img.className = isLibrary ? 'ex-lib-img' : 'ex-img';
  img.alt = ex.name;
  img.addEventListener('click', e => {
    e.stopPropagation();
    openLightbox(src, ex.name);
  });
  img.onerror = () => {
    const ph = document.createElement('div');
    ph.className = isLibrary ? 'ex-lib-placeholder' : 'ex-img-placeholder';
    ph.textContent = MUSCLE_ICONS[ex.muscle_group] || '🏃';
    img.replaceWith(ph);
  };
  return img;
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    // Unterbrochene Einheit (Draft in localStorage) anbieten
    const draft = readDraft();
    const rc = document.getElementById('resume-card');
    if (draft && !activeSession) {
      const when = new Date(draft.startedAt).toLocaleString(I18N.locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      // Plan-Name in der aktuellen Sprache (Draft kann in der anderen gestartet sein, v2.9)
      let name = draft.title || I18N.t('dyn.freeTraining');
      if (draft.adhoc || draft.planId == null) name = I18N.t('dyn.freeTraining');
      else if (draft.lang !== I18N.lang) {
        const p = await api('plans/' + draft.planId).catch(() => null);
        if (p) name = p.name;
      }
      document.getElementById('resume-body').textContent =
        I18N.t('resume.body', { name, n: draft.sets.length, time: when });
      rc.style.display = 'block';
    } else rc.style.display = 'none';

    const stats = await api('stats');
    document.getElementById('stat-total').textContent = stats.total_sessions;
    document.getElementById('stat-week').textContent = stats.this_week;

    if (stats.last_session) {
      const d = new Date(stats.last_session.started_at);
      // Kalendertage statt 24h-Blöcke — gestern Abend soll heute "1d" zeigen, nicht "Heute"
      const startOfDay = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const ago = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
      document.getElementById('stat-streak').textContent = ago === 0 ? I18N.t('dyn.today') : ago + 'd';
      document.getElementById('last-session-card').style.display = 'block';
      document.getElementById('last-session-info').innerHTML =
        `<span class="neon">${esc(stats.last_session.plan_name) || I18N.t('dyn.freeTraining')}</span><br>
         <span class="muted" style="font-size:0.65rem">${d.toLocaleDateString(I18N.locale(), { weekday:'long', day:'numeric', month:'long' })}</span>`;
    }

    const plans = await api('plans');
    const el = document.getElementById('dashboard-plans');
    el.innerHTML = '';
    plans.forEach(p => {
      const div = document.createElement('div');
      div.className = 'plan-item';
      div.innerHTML = `
        <div>
          <div class="plan-name">${esc(p.name)}</div>
          <div class="plan-meta">${esc(p.day_label || '')}</div>
        </div>
        <span>${p.custom ? `<span class="badge">${I18N.t('badge.custom')}</span> ` : ''}<span class="badge ${p.type === 'hit' ? 'hit' : ''}">${p.type === 'hit' ? I18N.t('badge.hit') : I18N.t('badge.strength')}</span></span>`;
      div.addEventListener('click', () => startWorkout(p.id));
      el.appendChild(div);
    });
  } catch(e) { console.error(e); }
}

// ── WORKOUT SELECT ────────────────────────────────────────────────────────────
async function loadWorkoutSelect() {
  const plans = await api('plans');
  const el = document.getElementById('workout-plan-list');
  el.innerHTML = '';
  plans.forEach(p => {
    const row = document.createElement('div');
    row.className = 'wsel-row';
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = p.name;
    btn.addEventListener('click', () => startWorkout(p.id));
    row.appendChild(btn);
    if (p.custom) {
      const edit = document.createElement('button');
      edit.className = 'btn ghost btn-sm plan-mini';
      edit.textContent = '✎';
      edit.title = I18N.t('plan.edit');
      edit.addEventListener('click', () => openPlanEditor(p.id));
      row.appendChild(edit);
      const del = document.createElement('button');
      del.className = 'btn ghost btn-sm plan-mini';
      del.textContent = '✕';
      del.title = I18N.t('plan.delete');
      del.addEventListener('click', async () => {
        if (!(await ask(I18N.t('plan.deleteConfirm', { name: p.name }), { ok: 'dlg.deletePlan', danger: true }))) return;
        if (!document.contains(del)) return;   // Liste wurde während der Frage neu gebaut (Sprachwechsel, Import)
        try { await LocalData.deletePlan(p.id); }
        catch (e) { console.error(e); await ask(I18N.t('err.saveFailed'), { alert: true }); return; }   // run-2 R2-7
        loadWorkoutSelect();
        loadDashboard();
      });
      row.appendChild(del);
    }
    el.appendChild(row);
  });
}

// ── WORKOUT ACTIVE ────────────────────────────────────────────────────────────
let activeSession = null;
let lastSetsCache = {};   // exercise_id -> { date, sets } | null („Letztes Mal“, pro Einheit gecacht)

// Zwischenstand in localStorage: Android räumt die App bei langen Einheiten gern weg
// (Musik-App, Display aus, Anruf) — ohne Draft wäre die halbe Stunde Training verloren.
// Nach jedem Satz gespeichert, beim Start bietet das Dashboard das Fortsetzen an.
const DRAFT_KEY = 'fit-active-workout';
// keepSavedAt (Audit run-2 C5): Umbenennen nach Sprachwechsel/Fortsetzen ist kein neuer Satz — savedAt
// bleibt, sonst bekäme „So speichern“ die Fortsetzen-Zeit als Ende (Dauer über die ganze Unterbrechung).
function saveDraft(keepSavedAt) {
  try {
    if (activeSession) {
      const prev = keepSavedAt ? readDraft() : null;
      const savedAt = (prev && prev.startedAt === activeSession.startedAt && prev.savedAt) || new Date().toISOString();
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...activeSession, savedAt }));
    } else localStorage.removeItem(DRAFT_KEY);
  } catch (e) {}
}
function readDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return d && Array.isArray(d.exercises) && Array.isArray(d.sets) && d.startedAt ? d : null;
  } catch (e) { return null; }
}
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }

// Display wach halten, solange eine Einheit läuft (Screen Wake Lock API; fehlt sie, passiert nichts)
let wakeLock = null;
async function acquireWakeLock() {
  try {
    if (!('wakeLock' in navigator) || wakeLock) return;
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) { wakeLock = null; }
}
function releaseWakeLock() { try { if (wakeLock) wakeLock.release(); } catch (e) {} wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && activeSession) acquireWakeLock();
});

// Intervall-Übung? „20 Sek“ / „30 s“ / „45 sec“ statt Wiederholungen → Sekunden, sonst null
function timedSeconds(ex) {
  const m = String(ex.reps || '').match(/^\s*(\d+)\s*(s|sek|sec|sekunden|seconds?)\b/i);
  return m ? Number(m[1]) : null;
}
// Halteübungen (v2.9): Haltezeit vor jedem Satz wählbar (Chips, eigene Zeit, „Max“ als Stoppuhr),
// dann Vorlauf und Halte-Timer. Hängt an der ÜBUNG, nicht am Plan-Text — Plank in einem eigenen Plan
// mit „max“ oder „8-12“ bekommt die Auswahl genauso. Ausnahme: HIT-Plan mit fester Zeitangabe
// („20 Sek“) bleibt das Tabata-Intervall mit Kette.
const HOLD_IDS = new Set([24]);                 // Plank
const HOLD_CHOICES = [30, 45, 60, 90, 120, 180];
// Intervalle (v2.10): gleiche Auswahl vor dem Start, aber ohne „Max“ (eine Stoppuhr passt nicht in eine Kette)
const INTERVAL_CHOICES = [20, 30, 45, 60, 90, 120, 180];
const HOLD_PREP = 5;                            // Vorlauf „Bereit machen“ (Sekunden)
const HOLD_MAX_CAP = 600;                       // Obergrenze für eigene Zeit und Stoppuhr
const HOLD_KEY = 'fit-hold-target';             // zuletzt gewählte Haltezeit je Übung (Komfort, nicht im Backup)
function isHoldSet(ex) {
  if (!HOLD_IDS.has(Number(ex.exercise_id))) return false;
  return !(activeSession && activeSession.planType === 'hit' && timedSeconds(ex));
}
// Zähler ab einer Minute als m:ss („1:30“ statt „90“)
function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  return sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : String(sec);
}
// Plan-Angabe für die Anzeige: „60 Sek“ heißt auf Englisch „60 sec“ (der Plan-Text selbst bleibt deutsch)
function fmtReps(reps) {
  const s = String(reps ?? '');
  return I18N.lang === 'en' ? s.replace(/(\d+)\s*(Sekunden|Sek)\b/gi, '$1 sec') : s;
}
// Geloggte Sätze werden nach ZEILE (row = Index in activeSession.exercises) geführt,
// nicht nach exercise_id — sonst überschreiben sich zwei Zeilen mit derselben Übung
// gegenseitig (dieselbe Übung als Aufwärmen und Finisher ist ein normaler Plan).
function isLogged(row, setNum) {
  return activeSession.sets.some(s => s.row === row && s.set_number === setNum && s.completed);
}
// Zeilen-Index eines geloggten Satzes (Alt-Drafts ohne row: über exercise_id auflösen)
function setRow(s) {
  if (Number.isInteger(s.row)) return s.row;
  return activeSession.exercises.findIndex(e => e.exercise_id === s.exercise_id);
}
function fmtSet(s) {
  if (s.duration_seconds) return `${s.duration_seconds}${I18N.t('dyn.sec')}`;
  // Kilo mit Dezimalkomma im Deutschen („22,5kg“), Punkt im Englischen (v2.9)
  const kg = () => Number(s.weight_kg).toLocaleString(I18N.locale(), { maximumFractionDigits: 2 });
  return s.weight_kg > 0 ? `${s.reps}×${kg()}kg` : `${s.reps} ${I18N.t('dyn.reps')}`;
}

function showWorkoutScreen(title, adhoc) {
  navBtns.forEach(b => b.classList.remove('active'));
  document.querySelector('[data-view="workout"]').classList.add('active');
  views.forEach(v => v.classList.remove('active'));
  document.getElementById('view-workout').classList.add('active');
  document.getElementById('workout-select-screen').style.display = 'none';
  document.getElementById('workout-active-screen').style.display = 'block';
  document.getElementById('workout-done-banner').style.display = 'none';
  document.getElementById('exercise-list').style.display = 'block';
  document.getElementById('workout-controls').style.display = 'flex';
  document.getElementById('btn-add-exercise').style.display = adhoc ? '' : 'none';
  document.getElementById('workout-plan-name').textContent = title;
  document.getElementById('resume-card').style.display = 'none';
  acquireWakeLock();
}

// Laufendes oder unterbrochenes Training nicht still verwerfen (Audit run-2 C2): Plan-Karte auf dem
// Dashboard, Plan-Knopf oder „Freies Training“ überschrieben bisher activeSession und den Draft.
// Liefert true, wenn neu gestartet werden darf. Zustand nach jedem await neu prüfen (Dauerregel ask()).
async function mayReplaceWorkout() {
  const s = activeSession;
  if (s && !s.finished && s.sets.length) {
    const ok = await ask(I18N.t('workout.replaceConfirm', { name: s.title, n: s.sets.length }),
      { ok: 'dlg.discard', cancel: 'dlg.keepGoing', danger: true });
    if (activeSession !== s || s.finished) return false;   // während der Frage gespeichert/abgebrochen
    if (!ok) { showWorkoutScreen(s.title, s.adhoc); return false; }   // zurück zum laufenden Training
    return true;
  }
  if (!s || s.finished) {
    const d = readDraft();
    if (d && d.sets.length) {
      const ok = await ask(I18N.t('resume.dropConfirm', { n: d.sets.length }), { ok: 'dlg.discard', danger: true });
      const now = readDraft();
      if (!ok || activeSession !== s || (now && now.startedAt !== d.startedAt)) return false;
    }
  }
  return true;
}

async function startWorkout(planId) {
  if (!(await mayReplaceWorkout())) return;
  cancelTimer();
  const plan = await api('plans/' + planId);
  showWorkoutScreen(plan.name, false);

  activeSession = {
    planId: plan.id,
    planType: plan.type || 'strength',   // v2.9: HIT-Pläne behalten feste Intervalle (isHoldSet)
    lang: I18N.lang,                     // v2.9: Sprache der kopierten Namen (relabelActiveSession)
    title: plan.name,
    startedAt: new Date().toISOString(),
    exercises: plan.exercises,
    sets: [],
    completedSets: {},
  };
  lastSetsCache = {};

  renderExercises(plan.exercises);
  updateProgress();
  saveDraft();
}

// ── Freies Training (ohne Plan): Übungen unterwegs hinzufügen ────────────────
async function startFreeWorkout() {
  if (!(await mayReplaceWorkout())) return;
  cancelTimer();
  activeSession = {
    planId: null,
    adhoc: true,
    lang: I18N.lang,
    title: I18N.t('dyn.freeTraining'),
    startedAt: new Date().toISOString(),
    exercises: [],
    sets: [],
    completedSets: {},
  };
  lastSetsCache = {};
  showWorkoutScreen(I18N.t('dyn.freeTraining'), true);
  renderExercises([]);
  updateProgress();
  saveDraft();
}
document.getElementById('btn-free-workout').addEventListener('click', startFreeWorkout);

// Unterbrochene Einheit aus dem Draft wieder aufnehmen
function resumeWorkout(draft) {
  activeSession = {
    planId: draft.planId != null ? draft.planId : null,
    planType: draft.planType || null,
    lang: draft.lang || null,
    adhoc: !!draft.adhoc,
    title: draft.title || I18N.t('dyn.freeTraining'),
    startedAt: draft.startedAt,
    exercises: draft.exercises,
    sets: draft.sets,
    completedSets: {},
  };
  lastSetsCache = {};
  showWorkoutScreen(activeSession.title, activeSession.adhoc);
  renderExercises(activeSession.exercises);
  applyLoggedSets();
  updateProgress();
  // In einer anderen Sprache unterbrochen (oder Alt-Draft ohne lang): Namen nachziehen
  if (activeSession.lang !== I18N.lang) relabelActiveSession();
}

// Sprachwechsel bei laufendem Training (v2.9): startWorkout kopiert Namen und Beschreibungen in die
// Einheit (und den Draft) — ohne das hier blieben sie in der Startsprache. Per Übungs-ID neu holen
// und die Liste neu zeichnen; Sätze, Timer und offene Fenster bleiben (sie halten dieselben
// ex-Objekte, die Satz-Knöpfe behalten ihre IDs).
async function relabelActiveSession() {
  const s = activeSession;
  if (!s) return;
  const lang = I18N.lang;
  const exs = await api('exercises');
  const plan = (!s.adhoc && s.planId != null) ? await api('plans/' + s.planId).catch(() => null) : null;
  if (activeSession !== s || I18N.lang !== lang) return;   // inzwischen gewechselt oder beendet
  const byId = new Map(exs.map(e => [e.id, e]));
  s.exercises.forEach(ex => {
    const e = byId.get(Number(ex.exercise_id));
    if (e) { ex.name = e.name; ex.description = e.description; }
  });
  if (s.adhoc || s.planId == null) s.title = I18N.t('dyn.freeTraining');
  else if (plan) s.title = plan.name;
  if (plan && !s.planType) s.planType = plan.type || 'strength';   // Draft aus v2.8 (HIT-Plan mit Plank bleibt Intervall)
  s.lang = lang;
  document.getElementById('workout-plan-name').textContent = s.title;
  const y = window.scrollY;
  renderExercises(s.exercises);
  applyLoggedSets();
  updateProgress();
  window.scrollTo(0, y);
  if (!s.finished) saveDraft(true);
}

// Draft ohne Umweg über den Trainingsbildschirm als Einheit speichern („So speichern“)
let resumeSaveBusy = false;   // Doppeltipp auf „So speichern“ legte sonst zwei Einheiten an (run-2)
async function saveDraftAsSession(draft) {
  if (resumeSaveBusy) return;
  resumeSaveBusy = true;
  try { await saveDraftAsSessionOnce(draft); } finally { resumeSaveBusy = false; }
}
async function saveDraftAsSessionOnce(draft) {
  const now = readDraft();
  if (!now || now.startedAt !== draft.startedAt) { loadDashboard(); return; }   // schon gespeichert/verworfen
  if (draft.sets.length) {
    try {
      await api('sessions', { method: 'POST', body: JSON.stringify({
        plan_id: draft.planId != null ? draft.planId : null,
        started_at: draft.startedAt,
        finished_at: draft.savedAt || new Date().toISOString(),
        sets: draft.sets,
      }) });
    } catch (e) {
      // Speichern fehlgeschlagen: Draft NICHT löschen, sonst gehen die Sätze verloren.
      console.error(e);
      await ask(I18N.t('workout.saveFailed'), { alert: true });
      return;
    }
  }
  clearDraft();
  loadDashboard();
}

document.getElementById('resume-go').addEventListener('click', () => { const d = readDraft(); if (d) resumeWorkout(d); });
document.getElementById('resume-save').addEventListener('click', () => { const d = readDraft(); if (d) saveDraftAsSession(d); });
document.getElementById('resume-drop').addEventListener('click', async () => {
  const d = readDraft();
  if (d && d.sets.length && !(await ask(I18N.t('resume.dropConfirm', { n: d.sets.length }), { ok: 'dlg.discard', danger: true }))) return;
  // Zustand nach dem await neu prüfen: ist der Draft inzwischen ein anderer (Training fortgesetzt
  // und neu unterbrochen), darf die alte Antwort ihn nicht löschen.
  const now = readDraft();
  if (d && now && now.startedAt !== d.startedAt) { loadDashboard(); return; }
  clearDraft();
  loadDashboard();
});

// Nach einem Re-Render (Übung/Satz hinzugefügt, Fortsetzen) die geloggten Sätze wieder
// markieren und bei Plan-Workouts erledigte Übungen abhaken / die aktuelle setzen
function applyLoggedSets() {
  activeSession.sets.forEach(s => {
    const ei = setRow(s);
    if (ei < 0) return;
    const btn = document.getElementById(`set-${ei}-${s.set_number}`);
    if (!btn) return;
    btn.classList.add('done');
    btn.querySelector('.set-val').textContent = fmtSet(s);
  });
  if (activeSession.adhoc) return;
  let currentSet = false;
  activeSession.exercises.forEach((ex, ei) => {
    const card = document.getElementById('ex-card-' + ei);
    if (!card) return;
    const done = activeSession.sets.filter(s => setRow(s) === ei && s.completed).length;
    card.classList.remove('current', 'done');
    if (done >= ex.sets) card.classList.add('done');
    else if (!currentSet) { card.classList.add('current'); currentSet = true; }
  });
}
function reRenderAdhoc() {
  renderExercises(activeSession.exercises);
  applyLoggedSets();
  updateProgress();
  saveDraft();
}

document.getElementById('btn-add-exercise').addEventListener('click', openExercisePicker);
document.getElementById('picker-close').addEventListener('click', () =>
  document.getElementById('picker-overlay').classList.remove('open'));
document.getElementById('picker-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

async function openExercisePicker() {
  const list = await api('exercises');
  const box = document.getElementById('picker-list');
  const search = document.getElementById('picker-search');
  const render = () => {
    const q = search.value.trim().toLowerCase();
    box.innerHTML = '';
    list
      .filter(e => !activeSession.exercises.some(x => x.exercise_id === e.id))
      .filter(e => !q || e.name.toLowerCase().includes(q) || I18N.muscle(e.muscle_group).toLowerCase().includes(q))
      .forEach(e => {
        const b = document.createElement('button');
        b.className = 'picker-item';
        const nm = document.createElement('span'); nm.textContent = e.name;
        const mg = document.createElement('span'); mg.className = 'pi-muscle'; mg.textContent = I18N.muscle(e.muscle_group);
        b.appendChild(nm); b.appendChild(mg);
        b.addEventListener('click', () => {
          activeSession.exercises.push({
            exercise_id: e.id, name: e.name, muscle_group: e.muscle_group, equipment: e.equipment,
            description: e.description, type: e.type, sets: 3, reps: '–', rest_seconds: 90,
          });
          document.getElementById('picker-overlay').classList.remove('open');
          reRenderAdhoc();
        });
        box.appendChild(b);
      });
  };
  search.value = '';
  search.oninput = render;
  render();
  document.getElementById('picker-overlay').classList.add('open');
  setTimeout(() => search.focus(), 100);
}

function renderExercises(exercises) {
  const el = document.getElementById('exercise-list');
  el.innerHTML = '';
  exercises.forEach((ex, ei) => {
    const card = document.createElement('div');
    card.className = 'exercise-card' + (ei === 0 ? ' current' : '');
    card.id = 'ex-card-' + ei;

    // Satzzahl hart begrenzen: eine importierte/eigene Übung mit absurdem sets-Wert
    // (z.B. 1e9) würde sonst hier Milliarden DOM-Knoten bauen und die App aufhängen.
    const nSets = Math.min(30, Math.max(0, parseInt(ex.sets) || 0));
    ex.sets = nSets;
    const setsArr = [];
    for (let s = 1; s <= nSets; s++) setsArr.push(s);

    const header = document.createElement('div');
    header.className = 'ex-header';

    const img = exImageEl(ex, false);
    header.appendChild(img);

    const timed = timedSeconds(ex);
    const hold = isHoldSet(ex);
    const info = document.createElement('div');
    info.className = 'ex-info';
    // ALLE eingesetzten Felder escapen — bei eigenen/importierten Plänen sind reps,
    // sets und rest_seconds Nutzer- bzw. Fremddaten (Freitext bzw. aus Backup-JSON).
    info.innerHTML = `
      <div class="ex-name">${esc(ex.name)}</div>
      <div class="ex-meta">${esc(ex.sets)} ${I18N.t('dyn.sets')} × ${esc(fmtReps(ex.reps))} · ${I18N.t('dyn.rest')}: ${esc(ex.rest_seconds)}s · ${esc(I18N.muscle(ex.muscle_group))}</div>`;
    header.appendChild(info);
    card.appendChild(header);

    if (ex.description) {
      const desc = document.createElement('div');
      desc.className = 'ex-desc';
      desc.textContent = ex.description;
      card.appendChild(desc);
    }

    // Kerstin (v2.10): Tipp/Warnung eingeklappt unter der Beschreibung
    const kerstin = kerstinEl(ex.exercise_id, true);
    if (kerstin) card.appendChild(kerstin);

    // „Letztes Mal“ (v2.9), füllt fillLastLines() nach — ohne Vorgeschichte bleibt die Zeile weg
    const lastLine = document.createElement('div');
    lastLine.className = 'ex-last hidden';
    lastLine.id = 'ex-last-' + ei;
    card.appendChild(lastLine);

    const setsRow = document.createElement('div');
    setsRow.className = 'sets-row';
    setsRow.id = 'sets-row-' + ei;

    setsArr.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'set-btn';
      btn.id = `set-${ei}-${s}`;
      btn.innerHTML = `<span class="set-num">${s}</span><span class="set-val">${(timed || hold) ? '▶' : '–'}</span>`;
      // Zeitsätze (Halten wie Intervall) öffnen seit v2.10 erst die Zeitwahl, dann Vorlauf und Timer
      btn.addEventListener('click', () =>
        (hold || timed) ? openHoldModal(ei, s, ex) : openSetModal(ei, s, ex));
      setsRow.appendChild(btn);
    });

    // Freies Training: Sätze on-the-fly ergänzen
    if (activeSession && activeSession.adhoc) {
      const plus = document.createElement('button');
      plus.className = 'set-btn set-add';
      plus.title = I18N.t('adhoc.addSet');
      plus.innerHTML = '<span class="set-num">＋</span><span class="set-val"></span>';
      plus.addEventListener('click', () => { ex.sets++; reRenderAdhoc(); });
      setsRow.appendChild(plus);
    }

    card.appendChild(setsRow);
    el.appendChild(card);
  });
  fillLastLines(exercises);
}

// „Letztes Mal“ direkt auf der Übungskarte (v2.9): die Sätze aus der jüngsten früheren Einheit
// (Wdh × kg bzw. Sekunden), sichtbar bevor man antippt — auch bei HIT-Intervallen, die kein
// Fenster öffnen. Ein Lesezugriff für alle Übungen, Ergebnis im selben Cache wie das Satz-Fenster.
async function fillLastLines(exercises) {
  const s = activeSession;
  if (!s || !exercises.length) return;
  const cache = lastSetsCache;   // Cache DIESER Einheit (startWorkout legt für die nächste einen neuen an)
  const missing = [...new Set(exercises.map(e => e.exercise_id))].filter(id => !(id in cache));
  if (missing.length) {
    let got = {};
    try { got = await LocalData.getLastSetsMany(missing); } catch (e) { console.error(e); }
    missing.forEach(id => { if (!(id in cache)) cache[id] = got[id] || null; });
  }
  if (activeSession !== s) return;   // inzwischen beendet oder neue Einheit
  exercises.forEach((ex, ei) => {
    const el = document.getElementById('ex-last-' + ei);
    const last = cache[ex.exercise_id];
    if (!el || !last || !last.sets.length) return;
    renderLastLine(el, last);
    el.classList.remove('hidden');
  });
}

// ── Set Modal ─────────────────────────────────────────────────────────────────
let pendingSet = null;

async function lastSetsFor(exId) {
  if (!(exId in lastSetsCache)) {
    try { lastSetsCache[exId] = await LocalData.getLastSets(exId); }
    catch (e) { lastSetsCache[exId] = null; }
  }
  return lastSetsCache[exId];
}

// Zeile „Letztes Mal (5. Nov.): …“ im Satz- und im Haltezeit-Fenster
function renderLastLine(el, last) {
  if (last && last.sets.length) {
    const d = new Date(last.date).toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short' });
    // höchstens 10 Sätze (run-2 B1): ein fremdes Backup mit Hunderten Sätzen blähte sonst jede Karte auf
    const shown = last.sets.slice(0, 10).map(fmtSet).join(' · ') + (last.sets.length > 10 ? ' · …' : '');
    el.innerHTML = `${esc(I18N.t('set.lastTime', { date: d }))} <b>${esc(shown)}</b>`;
  } else {
    el.textContent = I18N.t('set.noLast');
  }
}

async function openSetModal(exIdx, setNum, ex) {
  pendingSet = { exIdx, setNum, ex };

  document.getElementById('set-modal-title').textContent =
    `${I18N.t('dyn.setN')} ${setNum} — ${ex.name}`;

  const isBodyweight = ex.equipment === 'Körpergewicht' || ex.equipment === 'Stange';
  document.getElementById('weight-group').style.display = isBodyweight ? 'none' : '';

  // „Letztes Mal“: Sätze dieser Übung aus der jüngsten früheren Einheit
  const last = await lastSetsFor(ex.exercise_id);
  if (pendingSet == null || pendingSet.ex !== ex || pendingSet.setNum !== setNum) return; // inzwischen geschlossen
  renderLastLine(document.getElementById('set-last'), last);

  // Vorbelegung: eigener Satz (Korrektur) > voriger Satz dieser Einheit >
  // gleicher Satz vom letzten Mal > letzter Satz vom letzten Mal
  const ownSet = activeSession.sets.find(
    s => setRow(s) === exIdx && s.set_number === setNum
  );
  const prevSet = activeSession.sets.filter(
    s => setRow(s) === exIdx && s.set_number === setNum - 1
  ).pop();
  const lastSame = last && (last.sets.find(s => s.set_number === setNum) || last.sets[last.sets.length - 1]);
  const src = ownSet || prevSet || lastSame;
  document.getElementById('input-reps').value = (src && src.reps) || '';
  document.getElementById('input-weight').value = (src && src.weight_kg) || '';

  document.getElementById('set-modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('input-reps').focus(), 100);
}

document.getElementById('btn-save-set').addEventListener('click', saveSet);
document.getElementById('btn-cancel-set').addEventListener('click', closeSetModal);
document.getElementById('set-modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('set-modal-overlay')) closeSetModal();
});

function closeSetModal() {
  document.getElementById('set-modal-overlay').classList.remove('open');
  pendingSet = null;
}

// Satz in die Einheit übernehmen (Korrektur ersetzt, sonst anhängen), Button markieren,
// Fortschritt + Draft aktualisieren, bei Plan-Workouts Übung/Workout abschließen.
// Liefert { exerciseDone, workoutDone }.
function commitSet(exIdx, setNum, ex, entry) {
  entry.row = exIdx;   // Zeilen-Index mitführen (F3: gleiche Übung in mehreren Zeilen)
  const idx = activeSession.sets.findIndex(
    s => setRow(s) === exIdx && s.set_number === setNum
  );
  if (idx >= 0) activeSession.sets[idx] = entry;
  else activeSession.sets.push(entry);

  const btn = document.getElementById(`set-${exIdx}-${setNum}`);
  if (btn) {
    btn.classList.add('done');
    btn.querySelector('.set-val').textContent = fmtSet(entry);
  }
  updateProgress();
  saveDraft();

  const result = { exerciseDone: false, workoutDone: false };
  // Freies Training: kein Auto-Abschluss — der Nutzer beendet über den Button
  if (activeSession.adhoc) return result;

  const totalSets = activeSession.exercises[exIdx].sets;
  const doneSets = activeSession.sets.filter(
    s => setRow(s) === exIdx && s.completed
  ).length;
  if (doneSets >= totalSets) {
    result.exerciseDone = true;
    document.getElementById('ex-card-' + exIdx).classList.remove('current');
    document.getElementById('ex-card-' + exIdx).classList.add('done');
    if (exIdx + 1 < activeSession.exercises.length) {
      document.getElementById('ex-card-' + (exIdx + 1)).classList.add('current');
      document.getElementById('ex-card-' + (exIdx + 1)).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    result.workoutDone = checkWorkoutDone();
  }
  return result;
}

function saveSet() {
  if (!pendingSet) return;
  const { exIdx, setNum, ex } = pendingSet;
  const reps = parseInt(document.getElementById('input-reps').value) || 0;
  const weight = parseFloat(document.getElementById('input-weight').value) || 0;

  // Korrektur statt Duplikat: erneutes Eintragen desselben Satzes ersetzt den
  // Eintrag — sonst zählt die Fertig-Logik doppelt und schließt die Übung
  // (oder das ganze Workout) zu früh ab
  const r = commitSet(exIdx, setNum, ex, {
    exercise_id: ex.exercise_id,
    set_number: setNum,
    reps,
    weight_kg: weight,
    completed: 1,
  });
  closeSetModal();
  // Letzter Satz (v2.10, Release-Faktencheck B): keine Pause mehr über dem Abschluss-Banner — wie bei Intervall und Halten.
  // Mit Stimme sagte Thorsten sonst nach „Geschafft“ noch „Pause“ und am Ende „Weiter geht's“.
  if (r.workoutDone) return;

  // Start rest timer
  const rest = activeSession.exercises[exIdx].rest_seconds || 90;
  const nextEx = activeSession.exercises[exIdx + 1];
  startTimer(rest, { sub: nextEx ? I18N.t('dyn.nextExercise', { name: nextEx.name }) : I18N.t('dyn.lastRest') });
}

// ── Intervall-Sätze (HIT): Arbeits-Timer → Satz mit Dauer loggen → Pause → nächster Satz.
// secs = in der Zeitwahl gewählte Dauer (v2.10), gilt für die ganze Kette dieser Übung.
function startTimedSet(exIdx, setNum, ex, secs) {
  secs = clampHold(secs) || timedSeconds(ex) || 20;
  const sub = `${ex.name} · ${I18N.t('dyn.setN')} ${setNum}/${ex.sets}`;
  startTimer(secs, { kind: 'work', chain: true, sub, cue: ex.sets > 1 && setNum >= ex.sets ? 'last' : 'go', onDone: (elapsed) => {
    const r = commitSet(exIdx, setNum, ex, {
      exercise_id: ex.exercise_id, set_number: setNum,
      reps: null, weight_kg: 0, duration_seconds: elapsed, completed: 1,
    });
    if (r.workoutDone) return;
    const rest = ex.rest_seconds || 10;
    const next = setNum + 1;
    const chainNext = next <= ex.sets && !isLogged(exIdx, next);
    const nextEx = activeSession.exercises[exIdx + 1];
    startTimer(rest, {
      chain: chainNext,
      sub: chainNext ? `${ex.name} · ${I18N.t('dyn.setN')} ${next}/${ex.sets}`
                     : (nextEx ? I18N.t('dyn.nextExercise', { name: nextEx.name }) : I18N.t('dyn.lastRest')),
      onDone: chainNext ? () => startTimedSet(exIdx, next, ex, secs) : null,
    });
  } });
}

// ── Zeitwahl (v2.9 Halteübungen, seit v2.10 auch Intervalle): Zeit wählen → Vorlauf → Timer → Satz mit Dauer → Pause.
// mode 'hold' = einzelner Satz (Plank), 'interval' = Kette (Tabata), Vorlauf nur vor der ersten Runde.
let pendingHold = null;   // { exIdx, setNum, ex, mode, value: Sekunden | 'max' | null (ungültige Eingabe) }
// Release-Audit v2.10 c3: Der zweite Tipp eines Doppeltipps auf einen Zeitsatz traf das gerade geöffnete Fenster („Ohne Timer
// eintragen“ beim letzten Satz = Einheit gespeichert). Echte Tipps zählen erst nach DLG_ARM_MS, wie beim Rückfrage-Dialog.
let holdOpenedAt = 0;
const holdTooEarly = e => e && e.isTrusted && performance.now() - holdOpenedAt < DLG_ARM_MS;

function clampHold(n) {
  n = Math.round(Number(n));
  return Number.isFinite(n) && n > 0 ? Math.min(HOLD_MAX_CAP, n) : null;
}
function readHoldTargets() {
  try {
    const m = JSON.parse(localStorage.getItem(HOLD_KEY) || '{}');
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch (e) { return {}; }
}
function rememberHoldTarget(exId, v) {
  try { const m = readHoldTargets(); m[exId] = v; localStorage.setItem(HOLD_KEY, JSON.stringify(m)); } catch (e) {}
}

// Chips je Öffnen bauen (Halten mit „Max“, Intervall ohne); „Max“ trägt data-i18n für applyStatic
function buildHoldChips(mode) {
  const box = document.getElementById('hold-chips');
  box.textContent = '';
  (mode === 'hold' ? [...HOLD_CHOICES, 'max'] : INTERVAL_CHOICES).forEach(v => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hold-chip';
    b.dataset.value = v;
    if (v === 'max') { b.dataset.i18n = 'hold.max'; b.textContent = I18N.t('hold.max'); }
    else b.textContent = `${v} s`;
    b.addEventListener('click', e => { if (!holdTooEarly(e)) setHoldValue(v, true); });
    box.appendChild(b);
  });
}

// Auswahl anzeigen: Chip markieren, Eingabefeld, Stoppuhr-Hinweis, „Ohne Timer“ nur mit fester Zeit.
// writeInput=false beim Tippen ins Feld (sonst springt der Cursor bzw. „4“ würde zu „5“).
function setHoldValue(v, writeInput) {
  if (!pendingHold) return;
  pendingHold.value = v;
  document.querySelectorAll('#hold-chips .hold-chip').forEach(b => b.classList.toggle('on', b.dataset.value === String(v)));
  const inp = document.getElementById('input-hold');
  if (writeInput) inp.value = (v && v !== 'max') ? v : '';
  inp.placeholder = v === 'max' ? '—' : '';
  document.getElementById('hold-max-hint').classList.toggle('hidden', v !== 'max');
  document.getElementById('btn-hold-log').disabled = !v || v === 'max';
  document.getElementById('btn-hold-start').disabled = !v;
}

async function openHoldModal(exIdx, setNum, ex) {
  const mode = isHoldSet(ex) ? 'hold' : 'interval';
  pendingHold = { exIdx, setNum, ex, mode, value: null };
  holdOpenedAt = performance.now();
  buildHoldChips(mode);
  document.getElementById('hold-modal-title').textContent = `${I18N.t('dyn.setN')} ${setNum} — ${ex.name}`;
  const label = document.getElementById('hold-label');
  label.dataset.i18n = mode === 'hold' ? 'hold.title' : 'hold.titleInterval';
  label.textContent = I18N.t(label.dataset.i18n);
  // Intervall: die Wahl gilt für die folgenden Runden der Kette (Hinweis nur, wenn noch Runden folgen)
  const chainHint = document.getElementById('hold-chain-hint');
  chainHint.textContent = I18N.t('hold.chainHint', { rest: ex.rest_seconds || 10 });
  chainHint.classList.toggle('hidden', mode !== 'interval' || setNum >= ex.sets || isLogged(exIdx, setNum + 1));   // Kette stoppt an eingetragener Runde (Audit b4)
  // Vorbelegung: eigener Satz (Korrektur) > zuletzt gewählte Zeit dieser Übung > Plan-Angabe > 60 s (Halten) bzw. 20 s
  const own = activeSession.sets.find(s => setRow(s) === exIdx && s.set_number === setNum && s.duration_seconds);
  const saved = readHoldTargets()[ex.exercise_id];
  const pre = (own && clampHold(own.duration_seconds))
    || (saved === 'max' ? (mode === 'hold' ? 'max' : null) : clampHold(saved))
    || clampHold(timedSeconds(ex)) || (mode === 'hold' ? 60 : 20);
  setHoldValue(pre, true);
  const lastEl = document.getElementById('hold-last');
  lastEl.textContent = '';
  document.getElementById('hold-modal-overlay').classList.add('open');
  const last = await lastSetsFor(ex.exercise_id);
  if (!pendingHold || pendingHold.ex !== ex || pendingHold.setNum !== setNum) return;   // inzwischen geschlossen
  renderLastLine(lastEl, last);
}

function closeHoldModal() {
  document.getElementById('hold-modal-overlay').classList.remove('open');
  pendingHold = null;
}

function holdSub(ex, setNum) { return `${ex.name} · ${I18N.t('dyn.setN')} ${setNum}/${ex.sets}`; }

function startHold() {
  if (!pendingHold || !pendingHold.value) return;
  const { exIdx, setNum, ex, value, mode } = pendingHold;
  rememberHoldTarget(ex.exercise_id, value);
  closeHoldModal();
  const sub = holdSub(ex, setNum);
  if (mode === 'interval') {
    // Vorlauf nur vor der ersten Runde; danach bereitet die Pause der Kette vor (Tabata bleibt 20/10)
    startTimer(HOLD_PREP, { kind: 'prep', chain: true, sub, onDone: () => startTimedSet(exIdx, setNum, ex, value) });
    return;
  }
  // Vorlauf: Zeit, um vom Handy in die Position zu kommen. „Los →“ startet sofort, „■ Stopp“ bricht ohne Eintrag ab.
  startTimer(HOLD_PREP, { kind: 'prep', chain: true, sub, onDone: () => {
    const up = value === 'max';   // Stoppuhr zählt hoch, „Fertig →“ speichert die gehaltene Zeit
    startTimer(up ? HOLD_MAX_CAP : value, { kind: 'work', label: 'timer.hold', up, chain: true, sub, cue: 'hold',
      onDone: elapsed => logHold(exIdx, setNum, ex, elapsed) });
  } });
}

// Satz mit Dauer speichern (Korrektur ersetzt), danach die Pause wie nach einem normalen Satz
function logHold(exIdx, setNum, ex, secs) {
  const r = commitSet(exIdx, setNum, ex, {
    exercise_id: ex.exercise_id, set_number: setNum,
    reps: null, weight_kg: 0, duration_seconds: secs, completed: 1,
  });
  if (r.workoutDone) return;
  const next = setNum + 1;
  const nextEx = activeSession.exercises[exIdx + 1];
  const moreSets = next <= ex.sets && !isLogged(exIdx, next);
  startTimer(ex.rest_seconds || 60, {
    sub: moreSets ? holdSub(ex, next)
                  : (nextEx ? I18N.t('dyn.nextExercise', { name: nextEx.name }) : I18N.t('dyn.lastRest')),
  });
}

function logHoldWithoutTimer() {
  if (!pendingHold || !pendingHold.value || pendingHold.value === 'max') return;
  const { exIdx, setNum, ex, value } = pendingHold;
  closeHoldModal();
  logHold(exIdx, setNum, ex, value);
}

document.getElementById('input-hold').addEventListener('input', e => setHoldValue(clampHold(e.target.value), false));
document.getElementById('input-hold').addEventListener('change', e => {
  const n = clampHold(e.target.value);
  if (n && String(n) !== e.target.value) e.target.value = n;   // z.B. 900 → 600
});
document.getElementById('btn-hold-start').addEventListener('click', e => { if (!holdTooEarly(e)) startHold(); });
document.getElementById('btn-hold-log').addEventListener('click', e => { if (!holdTooEarly(e)) logHoldWithoutTimer(); });
document.getElementById('btn-hold-cancel').addEventListener('click', e => { if (!holdTooEarly(e)) closeHoldModal(); });
document.getElementById('hold-modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget && !holdTooEarly(e)) closeHoldModal();
});

function updateProgress() {
  const total = activeSession.exercises.reduce((a, e) => a + e.sets, 0);
  const done = activeSession.sets.filter(s => s.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  document.getElementById('workout-progress-fill').style.width = pct + '%';
}

function checkWorkoutDone() {
  const total = activeSession.exercises.reduce((a, e) => a + e.sets, 0);
  const done = activeSession.sets.filter(s => s.completed).length;
  if (done >= total) { finishWorkout(); return true; }
  return false;
}

let finishBusy = false;   // Doppeltipp auf „Beenden“ legte sonst zwei Einheiten an (run-2)
async function finishWorkout() {
  if (finishBusy) return;
  finishBusy = true;
  try { await finishWorkoutOnce(); } finally { finishBusy = false; }
}
async function finishWorkoutOnce() {
  const s = activeSession;   // Einheit festhalten: während des Speicherns kann eine Abbruch-Antwort activeSession leeren (Review v2.8)
  if (!s || s.finished) return;
  try {
    await api('sessions', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: s.planId,
        started_at: s.startedAt,
        finished_at: new Date().toISOString(),
        sets: s.sets,
      }),
    });
  } catch (e) {
    // Speichern fehlgeschlagen (z.B. IndexedDB-Fehler): NICHT "gespeichert" melden
    // und die Einheit auf dem Schirm lassen — der Draft bleibt erhalten, damit die
    // geloggten Sätze nicht verloren gehen.
    console.error(e);
    await ask(I18N.t('workout.saveFailed'), { alert: true });
    return;
  }
  clearDraft();
  s.finished = true;   // Marke für späte Antworten (Abbruch-Rückfrage, v2.8): gespeichert ist gespeichert
  if (activeSession !== s) return;   // während des Speicherns abgebrochen: Auswahl-Schirm steht schon, kein Banner mehr
  releaseWakeLock();
  document.getElementById('exercise-list').style.display = 'none';
  document.getElementById('workout-controls').style.display = 'none';
  document.getElementById('workout-done-banner').style.display = 'block';
  // Mit Stimme hat endTimer den Piepton für „Geschafft“ zurückgehalten; fehlt die Datei, piept es hier (Audit b3/c1)
  if (!Voice.say('done') && Voice.on()) playBeep();
}

// Manuell beenden: speichert auch Teil-Workouts (Plan) und Freies Training
document.getElementById('btn-finish').addEventListener('click', () => {
  if (!activeSession || !activeSession.sets.length) return;
  cancelTimer();
  finishWorkout();
});

document.getElementById('btn-abort').addEventListener('click', async () => {
  const s = activeSession;
  if (s && s.sets.length &&
      !(await ask(I18N.t('workout.abortConfirm', { n: s.sets.length }), { ok: 'dlg.abort', cancel: 'dlg.keepGoing', danger: true }))) return;
  if (activeSession !== s || (s && s.finished)) return;   // Einheit wurde während der Frage gespeichert oder gewechselt
  cancelTimer();
  document.getElementById('workout-active-screen').style.display = 'none';
  document.getElementById('workout-select-screen').style.display = 'block';
  document.getElementById('exercise-list').style.display = 'block';
  activeSession = null;
  clearDraft();
  releaseWakeLock();
});

document.getElementById('btn-done-ok').addEventListener('click', () => {
  cancelTimer();
  document.getElementById('workout-active-screen').style.display = 'none';
  document.getElementById('workout-select-screen').style.display = 'block';
  document.getElementById('exercise-list').style.display = 'block';
  activeSession = null;
  // Go to dashboard
  document.querySelector('[data-view="dashboard"]').click();
});

// ── TIMER (Pause + Intervall-Arbeit) ──────────────────────────────────────────
let timerInterval = null;
let timerState = null;   // { kind: 'rest'|'work'|'prep', chain, up, start, end, seconds, onDone }
const TIMER_LABEL = { rest: 'timer.label', work: 'timer.work', prep: 'timer.prep' };
const TIMER_SKIP  = { rest: 'timer.skip',  work: 'timer.done', prep: 'timer.go' };
// Ansagen (v2.10, voice.js): jede Phase sagt sich beim Start an; opts.cue überschreibt (z.B. 'last', 'hold'), null = still
const TIMER_CUE   = { rest: 'rest', work: 'go', prep: 'prep' };
let announced = false;   // hat sich die Phase nach einem abgelaufenen Timer angesagt? Dann kein Piepton (endTimer)
function announce(cue) { if (cue && Voice.say(cue)) announced = true; }
// Während des Zählens: „Noch zehn Sekunden“ in Pausen und Arbeit ab 30 s; vor dem automatischen Start (Vorlauf, Pause
// einer Kette) zählen drei kurze Töne, dann sagt Thorsten „Los geht's“. Gesprochene Zahlen klangen abgehackt bzw. auf
// Englisch unverständlich (Hörprobe 10.11.2026, Wahl Nutzer: Ton + „Los“ in beiden Sprachen). Die Stoppuhr sagt nichts.
function cueTick(st, rem) {
  if (st.up || !Voice.on()) return;
  if (rem === 10 && st.seconds >= 30 && st.kind !== 'prep') Voice.say('ten');
  else if (rem >= 1 && rem <= 3 && (st.kind === 'prep' || (st.kind === 'rest' && st.chain))) playTick();
}

// opts: kind ('rest' default | 'work' | 'prep' = Vorlauf), chain (Stopp-Taste zeigen: Intervall-Kette,
//       Vorlauf, Halten), label (i18n-Schlüssel statt Vorgabe je kind), up (Stoppuhr: zählt hoch,
//       seconds ist dann die Obergrenze), sub (Zeile unter dem Zähler), onDone(elapsedSeconds, skipped)
function startTimer(seconds, opts = {}) {
  stopTicking();
  // Endzeitpunkt statt Tick-Zählung: Android drosselt Intervalle bei gedimmtem
  // Display — mit Zeitstempel stimmt die Restzeit trotzdem
  const start = Date.now();
  const kind = TIMER_LABEL[opts.kind] ? opts.kind : 'rest';
  timerState = { kind, chain: !!opts.chain, up: !!opts.up, start, end: start + seconds * 1000,
                 seconds, onDone: opts.onDone || null, lastSec: seconds };

  const overlay = document.getElementById('timer-overlay');
  const count = document.getElementById('timer-count');
  overlay.classList.toggle('work', kind === 'work');
  overlay.classList.toggle('prep', kind === 'prep');
  overlay.classList.toggle('chain', timerState.chain);
  document.getElementById('timer-label').textContent = I18N.t(opts.label || TIMER_LABEL[kind]);
  document.getElementById('timer-skip').textContent = I18N.t(TIMER_SKIP[kind]);
  document.getElementById('timer-exercise').textContent = opts.sub || '';
  setTimerCount(timerState.up ? 0 : seconds);
  count.classList.remove('urgent');
  overlay.classList.add('open');
  announce(opts.cue !== undefined ? opts.cue : TIMER_CUE[kind]);

  const urgentAt = kind === 'rest' ? 5 : 3;
  timerInterval = setInterval(() => {
    if (!timerState) { stopTicking(); return; }
    const now = Date.now();
    if (timerState.up) {
      setTimerCount((Math.min(now, timerState.end) - timerState.start) / 1000);
      // Obergrenze erreicht (Audit run-2 C4): NICHT selbst eintragen — die echte Haltezeit ist unbekannt.
      // Anhalten, melden, auf „Fertig →“ (speichert die Obergrenze) oder „■ Stopp“ warten.
      if (now >= timerState.end) { stopTicking(); playBeep(); vibrate(); }
      return;
    }
    const remaining = Math.max(0, Math.ceil((timerState.end - now) / 1000));
    setTimerCount(remaining);
    if (remaining !== timerState.lastSec) { timerState.lastSec = remaining; cueTick(timerState, remaining); }
    if (remaining <= urgentAt) count.classList.add('urgent');
    if (remaining <= 0) endTimer(false);
  }, 250);
}
// Ab einer Minute m:ss; lange Anzeigen („10:00“) bekommen eine kleinere Schrift (360-px-Handys)
function setTimerCount(sec) {
  const count = document.getElementById('timer-count');
  const txt = fmtClock(sec);
  count.textContent = txt;
  count.classList.toggle('long', txt.length >= 4);
}
function stopTicking() { if (timerInterval) clearInterval(timerInterval); timerInterval = null; }
function closeTimerOverlay() {
  document.getElementById('timer-overlay').classList.remove('open', 'work', 'prep', 'chain');
}
// Regulär abgelaufen (Beep + Vibration) oder per Taste beendet (skipped) → onDone
function endTimer(skipped) {
  const st = timerState;
  if (!st) return;
  stopTicking();
  timerState = null;
  closeTimerOverlay();
  if (!skipped) vibrate();
  // Audit b2: Ein „Fertig →“, das kurz nach dem regulären Ende ankommt, trifft sonst „Überspringen →“ der neuen Pause
  if (!skipped && st.kind === 'work') lastSkipAt = Date.now();
  const ms = Math.min(Date.now(), st.end) - st.start;
  // Stoppuhr: abrunden wie die Anzeige (zeigt „47“, speichert 47)
  const elapsed = Math.max(1, st.up ? Math.floor(ms / 1000) : Math.round(ms / 1000));
  announced = false;
  if (st.onDone) st.onDone(skipped ? elapsed : st.seconds, skipped);
  // Regulär abgelaufen (v2.10): Mit Stimme sagt sich die nächste Phase selbst an („Los geht's.“, „Pause.“), eine Pause
  // ohne Kette endet mit „Weiter geht's.“, nach dem letzten Satz folgt „Geschafft“ (finishWorkout). Ohne Stimme
  // oder bei fehlender Datei piept es wie bisher.
  if (!skipped && !announced && !(Voice.on() && finishBusy)
      && !(st.kind === 'rest' && !st.chain && Voice.say('next'))) playBeep();
}
// Abbrechen ohne onDone: Intervall-Kette stoppen, laufender Arbeits-Satz wird NICHT geloggt
function cancelTimer() {
  stopTicking();
  timerState = null;
  closeTimerOverlay();
  Voice.stop();            // eine laufende Ansage nicht nach dem Stopp weitersprechen lassen
}

// Wächter (Audit run-2 C3): „Los →“ / „Überspringen →“ und „Fertig →“ sind derselbe Knopf an derselben
// Stelle. Ein Doppeltipp (oder ein Tipp kurz nach dem Ende des Vorlaufs/der Pause) traf sonst das gerade
// gestartete Halten bzw. Intervall und speicherte 1 s — beim letzten Satz samt Abschluss der Einheit.
// Niemand beendet ein Halten oder Intervall in unter einer Sekunde.
const SKIP_ARM_MS = 1000;
// R2-5 (v2.10): Der zweite Tipp eines Doppeltipps auf „Fertig →“ traf die gerade gestartete Pause
// („Überspringen →“) und übersprang sie. Ein angenommener Tipp sperrt den Knopf deshalb kurz.
const SKIP_DOUBLE_MS = 500;
let lastSkipAt = 0;
document.getElementById('timer-skip').addEventListener('click', () => {
  const now = Date.now();
  if (timerState && timerState.kind === 'work' && now - timerState.start < SKIP_ARM_MS) return;
  if (now - lastSkipAt < SKIP_DOUBLE_MS) return;
  lastSkipAt = now;
  endTimer(true);
});
document.getElementById('timer-stop').addEventListener('click', cancelTimer);

function vibrate() {
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
}

// Ein kurzer Zählton (Countdown ohne Zahlen-Ansage), leiser und kürzer als der Dreifach-Piepton am Ende
function playTick() {
  try {
    const ctx = Voice.audioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1320;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
    Voice.idle();
  } catch (e) {}
}

function playBeep() {
  try {
    // v2.10: ein gemeinsamer Kontext für Piepton und Ansagen (voice.js) statt eines neuen je Ton
    const ctx = Voice.audioCtx();
    if (!ctx) return;
    [0, 0.15, 0.3].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.4, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.2);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
    Voice.idle();            // Kontext nach dem Ton wieder anhalten (Akku), siehe voice.js
  } catch(e) {}
}

// ── PROGRESS ──────────────────────────────────────────────────────────────────
let progressChart = null;
let progressMode = 'weight';
let currentProgressExId = null;

async function loadProgressView() {
  const exercises = await api('exercises');
  const sel = document.getElementById('progress-exercise-select');
  sel.innerHTML = '<option value="">' + window.I18N.t('progress.selectOption') + '</option>';
  exercises.forEach(ex => {
    const opt = document.createElement('option');
    opt.value = ex.id;
    opt.textContent = ex.name;
    sel.appendChild(opt);
  });
  syncCombo(document.getElementById('progress-combo'));   // Knopf zeigt die neue Auswahl
}

document.getElementById('progress-exercise-select').addEventListener('change', async function() {
  const id = this.value;
  if (!id) return;
  currentProgressExId = id;
  await renderProgressChart(id, progressMode);
  document.getElementById('chart-type-row').style.display = 'flex';
});

// Knöpfe unter dem Chart zeigen, was der Chart gerade zeigt (nicht zwingend progressMode, s.u.)
function markChartButtons(mode) {
  const w = document.getElementById('chart-btn-weight');
  const r = document.getElementById('chart-btn-reps');
  w.classList.toggle('active-btn', mode === 'weight'); w.classList.toggle('ghost', mode !== 'weight');
  r.classList.toggle('active-btn', mode !== 'weight'); r.classList.toggle('ghost', mode === 'weight');
}

document.getElementById('chart-btn-weight').addEventListener('click', async () => {
  progressMode = 'weight';
  markChartButtons(progressMode);
  if (currentProgressExId) await renderProgressChart(currentProgressExId, progressMode);
});

document.getElementById('chart-btn-reps').addEventListener('click', async () => {
  progressMode = 'reps';
  markChartButtons(progressMode);
  if (currentProgressExId) await renderProgressChart(currentProgressExId, progressMode);
});

async function renderProgressChart(exId, mode) {
  const data = await api('progress/' + exId);
  const wrap = document.getElementById('chart-wrap');
  const canvas = document.getElementById('progress-chart');
  const empty = wrap.querySelector('.chart-empty');

  if (!data.length) {
    canvas.style.display = 'none';
    if (!empty) wrap.insertAdjacentHTML('beforeend', `<div class="chart-empty">${I18N.t('dyn.noDataExercise')}</div>`);
    else empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  canvas.style.display = 'block';

  const labels = data.map(r => r.date);
  // Übung ohne Gewicht (Klimmzüge, Plank): die Gewichtskurve wäre eine Null-Linie → Wiederholungen
  // bzw. Sekunden zeigen. progressMode (Wahl des Nutzers) bleibt für die nächste Übung erhalten.
  if (mode === 'weight' && data.every(r => !r.max_weight)) mode = 'reps';
  markChartButtons(mode);
  // Intervall-Sätze (HIT) haben keine Wiederholungen, nur Sekunden → im Reps-Modus die Dauer zeigen
  const timed = mode !== 'weight' && data.some(r => r.max_duration > 0);
  const values = mode === 'weight'
    ? data.map(r => r.max_weight)
    : data.map(r => r.max_reps || r.max_duration || 0);

  if (progressChart) progressChart.destroy();
  progressChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: mode === 'weight' ? I18N.t('dyn.maxWeight') : I18N.t(timed ? 'dyn.maxRepsSec' : 'dyn.maxReps'),
        data: values,
        borderColor: '#00ffcc',
        backgroundColor: 'rgba(0,255,204,0.08)',
        pointBackgroundColor: '#00ffcc',
        pointBorderColor: '#000',
        tension: 0.3,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#c8ffe8', font: { family: 'Share Tech Mono' } } },
      },
      scales: {
        x: { ticks: { color: '#888', font: { family: 'Share Tech Mono', size: 10 } }, grid: { color: 'rgba(0,255,204,0.07)' } },
        y: { ticks: { color: '#888', font: { family: 'Share Tech Mono', size: 10 } }, grid: { color: 'rgba(0,255,204,0.07)' } },
      },
    },
  });
}

// ── PLAN-EDITOR (eigene Pläne, IndexedDB via LocalData) ───────────────────────
let editorPlanId = null;

function addEditorRow(pe) {
  const row = document.createElement('div');
  row.className = 'editor-row';
  // Übungsauswahl als Kombifeld — die Liste ist lang (32 Übungen), das Menü bekommt
  // deshalb automatisch ein Filterfeld. Das <select> bleibt als .er-ex der Wertspeicher,
  // den savePlanFromEditor() unverändert ausliest.
  const combo = document.createElement('div');
  combo.className = 'combo';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'combo-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  const lab = document.createElement('span');
  lab.className = 'combo-label';
  const caret = document.createElement('span');
  caret.className = 'caret';
  caret.textContent = '▾';
  btn.append(lab, caret);
  const sel = document.createElement('select');
  sel.className = 'er-ex combo-native';
  allExercises.forEach(e => {
    const o = document.createElement('option');
    o.value = e.id;
    o.textContent = e.name;
    sel.appendChild(o);
  });
  if (pe) sel.value = pe.exercise_id;
  const menu = document.createElement('div');
  menu.className = 'combo-menu hidden';
  combo.append(btn, sel, menu);
  syncCombo(combo);
  const mk = (cls, val, type, attrs) => {
    const i = document.createElement('input');
    i.className = cls; i.type = type;
    Object.assign(i, attrs || {});
    i.value = val;
    return i;
  };
  const sets = mk('er-sets', pe ? pe.sets : 3, 'number', { min: 1, max: 20 });
  const reps = mk('er-reps', pe ? pe.reps : '8-12', 'text', {});
  const rest = mk('er-rest', pe ? pe.rest_seconds : 90, 'number', { min: 0, max: 600, step: 15 });
  const del = document.createElement('button');
  del.className = 'er-del'; del.textContent = '✕';
  del.addEventListener('click', () => row.remove());
  row.append(combo, sets, reps, rest, del);
  document.getElementById('editor-rows').appendChild(row);
}

async function openPlanEditor(planId) {
  editorPlanId = planId;
  if (!allExercises.length) allExercises = await api('exercises');
  document.getElementById('editor-title').textContent = I18N.t(planId ? 'plan.editTitle' : 'plan.newTitle');
  const data = (planId && LocalData.getCustomPlan(planId)) || { name: '', type: 'strength', exercises: [] };
  document.getElementById('editor-name').value = data.name;
  document.getElementById('editor-type').value = data.type;
  syncCombo(document.getElementById('editor-type-combo'));
  document.getElementById('editor-rows').innerHTML = '';
  (data.exercises.length ? data.exercises : [null]).forEach(addEditorRow);
  document.getElementById('editor-overlay').classList.add('open');
}

async function savePlanFromEditor() {
  const name = document.getElementById('editor-name').value.trim();
  if (!name) { await ask(I18N.t('plan.needName'), { alert: true }); return; }
  const exercises = [...document.querySelectorAll('#editor-rows .editor-row')].map((r, i) => ({
    exercise_id: Number(r.querySelector('.er-ex').value),
    sets: Math.min(20, Math.max(1, parseInt(r.querySelector('.er-sets').value) || 3)),
    reps: r.querySelector('.er-reps').value.trim() || '8-12',
    rest_seconds: Math.min(600, Math.max(0, parseInt(r.querySelector('.er-rest').value) || 90)),
    sort_order: i,
  })).filter(e => e.exercise_id);
  if (!exercises.length) { await ask(I18N.t('plan.needEx'), { alert: true }); return; }
  try {
    await LocalData.savePlan({
      id: editorPlanId,
      name,
      type: document.getElementById('editor-type').value,
      exercises,
    });
  } catch (e) {
    // Speichern gescheitert (z.B. Speicher voll, run-2 C1): Editor bleibt offen, Eingaben bleiben erhalten
    console.error(e);
    await ask(I18N.t('err.saveFailed'), { alert: true });
    return;
  }
  document.getElementById('editor-overlay').classList.remove('open');
  loadWorkoutSelect();
  loadDashboard();
}

document.getElementById('btn-new-plan').addEventListener('click', () => openPlanEditor(null));
document.getElementById('editor-save').addEventListener('click', savePlanFromEditor);
document.getElementById('editor-add-row').addEventListener('click', () => addEditorRow(null));
document.getElementById('editor-cancel').addEventListener('click', () =>
  document.getElementById('editor-overlay').classList.remove('open'));
document.getElementById('editor-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

// ── LIBRARY ───────────────────────────────────────────────────────────────────
let allExercises = [];
let libraryBound = false;

async function loadLibrary() {
  if (!allExercises.length) allExercises = await api('exercises');
  const activeBtn = document.querySelector('.filter-btn.active');
  renderLibrary(activeBtn ? (activeBtn.dataset.filter || '') : '');
  if (libraryBound) return;
  libraryBound = true;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderLibrary(btn.dataset.filter || '');
    });
  });
}

function renderLibrary(filter) {
  let list = allExercises;
  if (filter.startsWith('muscle:')) list = list.filter(e => e.muscle_group === filter.slice(7));
  if (filter === 'type:hit') list = list.filter(e => e.type === 'hit');

  const el = document.getElementById('library-list');
  el.innerHTML = '';
  list.forEach(ex => {
    const card = document.createElement('div');
    card.className = 'ex-lib-card';

    const img = exImageEl(ex, true);
    card.appendChild(img);

    const body = document.createElement('div');
    body.className = 'ex-lib-body';
    body.innerHTML = `
      <div class="ex-lib-name">${esc(ex.name)}</div>
      <div class="ex-lib-tags">
        <span class="tag">${esc(I18N.muscle(ex.muscle_group))}</span>
        <span class="tag">${esc(I18N.equip(ex.equipment))}</span>
        ${ex.type === 'hit' ? '<span class="tag hit">HIT</span>' : ''}
      </div>
      <div class="ex-lib-desc">${esc(ex.description || '')}</div>`;
    const kerstin = kerstinEl(ex.id, false);   // v2.10: in der Bibliothek immer offen
    if (kerstin) body.appendChild(kerstin);
    card.appendChild(body);
    el.appendChild(card);
  });
}

// ── Kerstin (v2.10): Technik-Tipp und ggf. Warnung je Übung ─────────────────────
// Text aus kerstin.json (LocalData.kerstinFor, aktuelle Sprache), gesetzt nur per textContent.
// collapsed = Übungskarte im Training (Knopf klappt auf), sonst offen (Bibliothek).
function kerstinEl(exId, collapsed) {
  const k = LocalData.kerstinFor(exId);
  if (!k) return null;
  const wrap = document.createElement('div');
  wrap.className = 'kerstin';
  const block = document.createElement('div');
  block.className = 'kerstin-block';
  const avatar = () => { const i = document.createElement('img'); i.src = 'images/kerstin.jpg'; i.alt = ''; return i; };
  const part = (cls, labelKey, text, withAvatar) => {
    const p = document.createElement('div');
    p.className = 'kerstin-part ' + cls;
    const head = document.createElement('div');
    head.className = 'kerstin-head';
    if (withAvatar) { const a = avatar(); a.className = 'kerstin-avatar'; head.appendChild(a); }
    const label = document.createElement('span');
    label.className = 'kerstin-label';
    label.textContent = I18N.t(labelKey);
    head.appendChild(label);
    const t = document.createElement('div');
    t.className = 'kerstin-text';
    t.textContent = text;
    p.append(head, t);
    block.appendChild(p);
  };
  if (k.tip) part('kerstin-tip', 'kerstin.tip', k.tip, true);
  if (k.warn) part('kerstin-warn', 'kerstin.warn', k.warn, !k.tip);
  if (!collapsed) { wrap.appendChild(block); return wrap; }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'kerstin-toggle';
  btn.setAttribute('aria-expanded', 'false');
  const mini = avatar();
  mini.className = 'kerstin-mini';
  const lbl = document.createElement('span');
  lbl.textContent = I18N.t('kerstin.tip');
  btn.append(mini, lbl);
  if (k.warn) { const f = document.createElement('span'); f.className = 'kerstin-flag'; f.textContent = '⚠'; btn.appendChild(f); }
  const chev = document.createElement('span');
  chev.className = 'kerstin-chev';
  chev.textContent = '▾';
  btn.appendChild(chev);
  block.classList.add('hidden');
  btn.addEventListener('click', () => {
    const open = block.classList.contains('hidden');
    block.classList.toggle('hidden', !open);
    wrap.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  });
  wrap.append(btn, block);
  return wrap;
}

// ── HISTORY ───────────────────────────────────────────────────────────────────
async function loadHistory() {
  const sessions = await api('sessions?limit=30');
  const el = document.getElementById('history-list');
  el.innerHTML = '';

  if (!sessions.length) {
    el.innerHTML = `<div class="muted" style="text-align:center;padding:32px;font-size:0.7rem">${I18N.t('dyn.noHistory')}</div>`;
    return;
  }

  sessions.forEach(s => {
    const d = new Date(s.started_at);
    const dateStr = d.toLocaleDateString(I18N.locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = d.toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit' });
    const dur = s.finished_at
      ? Math.round((new Date(s.finished_at) - d) / 60000) + ' ' + I18N.t('dyn.min')
      : '';

    const div = document.createElement('div');
    div.className = 'session-item';
    div.innerHTML = `
      <div class="session-date">${dateStr} · ${timeStr}</div>
      <div class="session-plan">${esc(s.plan_name) || I18N.t('dyn.freeTraining')}</div>
      <div class="session-meta">${dur}</div>
      ${s.notes ? `<div class="session-notes">${esc(s.notes)}</div>` : ''}`;
    div.addEventListener('click', () => openSessionDetail(s.id));
    el.appendChild(div);
  });
}

// ── Session-Detail (Sätze, Notiz, Löschen) ──────────────────────────────────────
let detailSessionId = null;

async function openSessionDetail(id) {
  const s = await api('sessions/' + id);
  if (!s) return;
  detailSessionId = s.id;
  const d = new Date(s.started_at);
  const dateStr = d.toLocaleDateString(I18N.locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = d.toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit' });
  const dur = s.finished_at ? Math.round((new Date(s.finished_at) - d) / 60000) + ' ' + I18N.t('dyn.min') : '';
  document.getElementById('session-title').textContent = s.plan_name || I18N.t('dyn.freeTraining');
  document.getElementById('session-meta').textContent = `${dateStr} · ${timeStr}${dur ? ' · ' + dur : ''}`;

  // Sätze je Übung gruppieren (Reihenfolge: erstes Vorkommen)
  const box = document.getElementById('session-sets');
  box.innerHTML = '';
  const groups = new Map();
  s.sets.forEach(st => {
    if (!groups.has(st.exercise_id)) groups.set(st.exercise_id, { name: st.exercise_name || ('#' + st.exercise_id), sets: [] });
    groups.get(st.exercise_id).sets.push(st);
  });
  if (!groups.size) {
    box.innerHTML = `<div class="ss-row"><div class="ss-vals">${I18N.t('session.noSets')}</div></div>`;
  }
  groups.forEach(g => {
    const row = document.createElement('div');
    row.className = 'ss-row';
    const nm = document.createElement('div'); nm.className = 'ss-name'; nm.textContent = g.name;
    const vals = document.createElement('div'); vals.className = 'ss-vals';
    vals.textContent = g.sets.sort((a, b) => a.set_number - b.set_number).map(fmtSet).join(' · ');
    row.appendChild(nm); row.appendChild(vals);
    box.appendChild(row);
  });

  document.getElementById('session-notes').value = s.notes || '';
  document.getElementById('session-msg').textContent = '';
  document.getElementById('session-overlay').classList.add('open');
}

function closeSessionDetail() {
  document.getElementById('session-overlay').classList.remove('open');
  detailSessionId = null;
}
document.getElementById('session-close').addEventListener('click', closeSessionDetail);
document.getElementById('session-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeSessionDetail();
});
document.getElementById('session-save-notes').addEventListener('click', async () => {
  if (detailSessionId == null) return;
  const notes = document.getElementById('session-notes').value.trim() || null;
  try { await LocalData.updateSession(detailSessionId, { notes }); }
  catch (e) { console.error(e); document.getElementById('session-msg').textContent = I18N.t('err.saveFailed'); return; }
  document.getElementById('session-msg').textContent = I18N.t('session.notesSaved');
  loadHistory();
});
document.getElementById('session-delete').addEventListener('click', async () => {
  const id = detailSessionId;
  if (id == null) return;
  const meta = document.getElementById('session-meta').textContent.split(' · ')[0];
  if (!(await ask(I18N.t('session.deleteConfirm', { date: meta }), { ok: 'dlg.deleteForever', danger: true }))) return;
  if (detailSessionId !== id) return;   // Detail wurde während der Frage geschlossen oder gewechselt
  try { await LocalData.deleteSession(id); }
  catch (e) { console.error(e); document.getElementById('session-msg').textContent = I18N.t('err.saveFailed'); return; }   // run-2 R2-7
  closeSessionDetail();
  loadHistory();
  loadDashboard();
});

// ── Backup (Export / Import) ────────────────────────────────────────────────────
// Da die Daten nur auf dem Gerät liegen: JSON-Backup zum Sichern / Umziehen.
//
// Datei speichern (v2.9): Die Capacitor-WebView führt <a download> mit Blob-URL nicht aus (kein
// DownloadListener) — bis v2.8 entstand in der APK gar keine Datei, nur das Textfeld. Nativ deshalb
// über die Plugins Filesystem + Share (Muster Ausgaben-Tracker, gleiche Versionen 6.0.4):
//   1) nach „Documents“ (Dokumente) schreiben (bleibt als Datei liegen; Android 11+ ohne Speicher-Berechtigung),
//      danach Teilen-Dialog (Syncthing, Mail, Dateien …) — Abbrechen dort ist kein Fehler;
//   2) klappt das nicht (Android ≤ 10 ohne Berechtigung): in den App-Cache schreiben und nur teilen;
//   3) klappt auch das nicht: Rückgabe 'none' → der Aufrufer zeigt das JSON im Textfeld zum Kopieren.
// Im Browser (Testserver) bleibt der Blob-Download. Rückgabe: 'documents' | 'shared' | 'canceled' | 'download' | 'none'.
function capPlugins() {
  const C = window.Capacitor;
  return C && typeof C.isNativePlatform === 'function' && C.isNativePlatform() ? (C.Plugins || {}) : null;
}
async function saveBackupFile(name, text) {
  const P = capPlugins();
  if (!P) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'download';
  }
  const FS = P.Filesystem, SH = P.Share;
  const share = async uri => { try { if (SH) await SH.share({ title: name, url: uri }); } catch (e) { /* Teilen abgebrochen */ } };
  if (!FS) return 'none';
  try {
    const w = await FS.writeFile({ path: name, data: text, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true });
    await share(w.uri);
    return 'documents';
  } catch (e) { console.error(e); }
  if (!SH) return 'none';
  let w;
  try { w = await FS.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8', recursive: true }); }
  catch (e) { console.error(e); return 'none'; }
  try { await SH.share({ title: name, url: w.uri }); return 'shared'; }
  catch (e) { return 'canceled'; }   // Teilen abgebrochen: die Cache-Datei allein nützt niemandem
}

async function applyImport(text) {
  const msg = document.getElementById('backup-msg');
  try {
    const obj = JSON.parse(text);
    if (!obj || obj.format !== 'alien-fitness-backup') throw new Error(I18N.t('err.invalidBackup'));
    const modeEl = document.getElementById('backup-mode');
    const merge = !modeEl || modeEl.value !== 'replace';
    if (!merge) {
      // „Alles ersetzen“ ist destruktiv → vorher zeigen, was verloren geht
      const cur = await LocalData.hasData();
      if ((cur.sessions || cur.plans) &&
          !(await ask(I18N.t('backup.replaceConfirm', { s: cur.sessions, p: cur.plans }), { ok: 'dlg.replace', danger: true }))) {
        if (msg) msg.textContent = '';
        return;
      }
      if (modeEl && modeEl.value !== 'replace') return;   // Modus während der Frage umgestellt: nichts ersetzen
    }
    const r = await LocalData.importAll(obj, { merge });
    if (msg) msg.textContent = I18N.t('backup.importedFull', { s: r.sessions, n: r.sets, p: r.plans })
      + (r.skipped ? I18N.t('backup.skipped', { k: r.skipped }) : '');
    loadHistory(); loadDashboard();
  } catch (err) {
    // QuotaExceededError aus dem Commit hat eine leere message (run-2 R2-6)
    const why = err.message || (err.name === 'QuotaExceededError' ? I18N.t('err.saveFailed') : err.name || '?');
    if (msg) msg.textContent = I18N.t('backup.error', { msg: why });
  }
}

const _exportBtn = document.getElementById('backup-export');
let exportBusy = false;   // Doppeltipp: zweiter Export öffnete sonst einen zweiten Teilen-Dialog
if (_exportBtn) _exportBtn.addEventListener('click', async () => {
  if (exportBusy) return;
  exportBusy = true;
  const msg = document.getElementById('backup-msg');
  const ta = document.getElementById('backup-json');
  try {
    const data = await LocalData.exportAll();
    const text = JSON.stringify(data, null, 2);
    // Lokales Datum (toISOString wäre UTC: kurz nach Mitternacht stünde der Vortag im Namen)
    const d = new Date();
    const p2 = n => String(n).padStart(2, '0');
    // mit Uhrzeit (Audit run-2): ein zweiter Export am selben Tag überschrieb sonst den ersten — nach einem
    // versehentlichen „Alles ersetzen“ auch ein gutes Backup vom Morgen durch ein leeres
    const name = `alien-fitness-backup-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`;
    const how = await saveBackupFile(name, text);
    let line = I18N.t('backup.exported', { s: data.sessions.length, n: data.sets.length });
    if (how === 'documents') line += ' ' + I18N.t('backup.savedDocs', { name });
    else if (how === 'shared') line += ' ' + I18N.t('backup.sharedOnly');
    else if (how === 'canceled') line += ' ' + I18N.t('backup.shareCanceled');
    else if (how === 'none') line += ' ' + I18N.t('backup.saveFailed');
    // Textfeld nur als Rückfall (keine Datei, Teilen abgebrochen); sonst unangetastet lassen — es ist zugleich
    // das Einfügefeld für den Import (run-2: ein erfolgreicher Export löschte eingefügtes JSON)
    if (ta && (how === 'none' || how === 'canceled')) ta.value = text;
    if (msg) msg.textContent = line;
  } catch (e) {
    console.error(e);
    if (msg) msg.textContent = I18N.t('backup.error', { msg: e.message });
  } finally {
    exportBusy = false;
  }
});

const _importInput = document.getElementById('backup-import-file');
if (_importInput) _importInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) await applyImport(await file.text());
  e.target.value = '';
});

const _importPasteBtn = document.getElementById('backup-import-paste');
if (_importPasteBtn) _importPasteBtn.addEventListener('click', async () => {
  const ta = document.getElementById('backup-json');
  if (ta && ta.value.trim()) await applyImport(ta.value);
});

// ── Sprache (DE/EN) ─────────────────────────────────────────────────────────────
function updateLangToggle() {
  const b = document.getElementById('lang-toggle');
  if (b) b.textContent = I18N.lang === 'de' ? 'EN' : 'DE';
}

function rerenderCurrentView() {
  const active = document.querySelector('nav button.active');
  const v = active ? active.dataset.view : 'dashboard';
  if (v === 'dashboard') loadDashboard();
  else if (v === 'workout') { if (!activeSession) loadWorkoutSelect(); }
  else if (v === 'progress') {
    loadProgressView().then(() => {
      if (currentProgressExId) {
        document.getElementById('progress-exercise-select').value = currentProgressExId;
        syncCombo(document.getElementById('progress-combo'));
        renderProgressChart(currentProgressExId, progressMode);
      }
    });
  }
  else if (v === 'library') { allExercises = []; loadLibrary(); }
  else if (v === 'history') loadHistory();
}

const _langToggle = document.getElementById('lang-toggle');
if (_langToggle) _langToggle.addEventListener('click', () => {
  I18N.setLang(I18N.lang === 'de' ? 'en' : 'de');
  I18N.applyStatic();
  syncCombos();            // applyStatic übersetzt die <option>-Texte — Knöpfe nachziehen
  updateLangToggle();
  renderAbout();
  // Übungs-Cache IMMER leeren — sonst zeigen Plan-Editor-Dropdown und Bibliothek
  // nach dem Sprachwechsel die Namen der alten Sprache (Cache wurde vorher nur
  // in der Bibliotheks-Ansicht geleert)
  allExercises = [];
  rerenderCurrentView();
  if (activeSession) relabelActiveSession();   // laufendes Training: Namen in der neuen Sprache (v2.9)
  renderVoiceBtns();
  Voice.preload();                              // Ansagen der neuen Sprache (v2.10)
});

// ── Stimme (v2.10): Umschalter im Trainings-Schirm und im Timer, Zustand und Abspielen in voice.js ──
function renderVoiceBtns() {
  const v = Voice.get();
  const name = v === 'off' ? I18N.t('voice.off') : v.charAt(0).toUpperCase() + v.slice(1);
  document.querySelectorAll('.voice-btn').forEach(b => {
    b.classList.toggle('off', v === 'off');
    b.querySelector('.voice-name').textContent = name;
    b.title = I18N.t('voice.title', { name });
    b.setAttribute('aria-label', b.title);
  });
}
document.querySelectorAll('.voice-btn').forEach(b => b.addEventListener('click', () => { Voice.next(); renderVoiceBtns(); }));

// ── Init ──────────────────────────────────────────────────────────────────────
document.documentElement.lang = I18N.lang;
I18N.applyStatic();
syncCombos();                                // Knopfbeschriftungen aus den Selects setzen
I18N.ready.then(() => { I18N.applyStatic(); syncCombos(); renderVoiceBtns(); Voice.preload(); });   // Muskel-Filter-Labels nach Content-Load
updateLangToggle();
renderAbout();
loadDashboard();
