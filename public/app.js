'use strict';

// Versionsanzeige (unten in der Anleitung). Einzige Quelle ist die VERSION-Datei:
// apk/build-www.sh setzt diese Konstante beim APK-Build aus VERSION_NAME, e2e-test.mjs
// prüft den Abgleich. Beim Web-Redeploy ebenfalls mit VERSION_NAME synchron halten.
const APP_VERSION = '2.8.0';

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
let dlgResolve = null, dlgPrev = null;
function ask(msg, opt) {
  opt = opt || {};
  if (dlgResolve) return Promise.resolve(false);
  return new Promise(res => {
    dlgResolve = res;
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
document.getElementById('dlg-ok').addEventListener('click', () => dialogClose(true));
document.getElementById('dlg-cancel').addEventListener('click', () => dialogClose(false));
document.getElementById('dlg').addEventListener('click', e => { if (e.target.id === 'dlg') dialogClose(false); });

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
      document.getElementById('resume-body').textContent =
        I18N.t('resume.body', { name: draft.title || I18N.t('dyn.freeTraining'), n: draft.sets.length, time: when });
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
        await LocalData.deletePlan(p.id);
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
function saveDraft() {
  try {
    if (activeSession) localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...activeSession, savedAt: new Date().toISOString() }));
    else localStorage.removeItem(DRAFT_KEY);
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
  return s.weight_kg > 0 ? `${s.reps}×${s.weight_kg}kg` : `${s.reps} ${I18N.t('dyn.reps')}`;
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

async function startWorkout(planId) {
  const plan = await api('plans/' + planId);
  showWorkoutScreen(plan.name, false);

  activeSession = {
    planId: plan.id,
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
function startFreeWorkout() {
  activeSession = {
    planId: null,
    adhoc: true,
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
}

// Draft ohne Umweg über den Trainingsbildschirm als Einheit speichern („So speichern“)
async function saveDraftAsSession(draft) {
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
    const info = document.createElement('div');
    info.className = 'ex-info';
    // ALLE eingesetzten Felder escapen — bei eigenen/importierten Plänen sind reps,
    // sets und rest_seconds Nutzer- bzw. Fremddaten (Freitext bzw. aus Backup-JSON).
    info.innerHTML = `
      <div class="ex-name">${esc(ex.name)}</div>
      <div class="ex-meta">${esc(ex.sets)} ${I18N.t('dyn.sets')} × ${esc(ex.reps)} · ${I18N.t('dyn.rest')}: ${esc(ex.rest_seconds)}s · ${esc(I18N.muscle(ex.muscle_group))}</div>`;
    header.appendChild(info);
    card.appendChild(header);

    if (ex.description) {
      const desc = document.createElement('div');
      desc.className = 'ex-desc';
      desc.textContent = ex.description;
      card.appendChild(desc);
    }

    const setsRow = document.createElement('div');
    setsRow.className = 'sets-row';
    setsRow.id = 'sets-row-' + ei;

    setsArr.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'set-btn';
      btn.id = `set-${ei}-${s}`;
      btn.innerHTML = `<span class="set-num">${s}</span><span class="set-val">${timed ? '▶' : '–'}</span>`;
      btn.addEventListener('click', () => timed ? startTimedSet(ei, s, ex) : openSetModal(ei, s, ex));
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

async function openSetModal(exIdx, setNum, ex) {
  pendingSet = { exIdx, setNum, ex };

  document.getElementById('set-modal-title').textContent =
    `${I18N.t('dyn.setN')} ${setNum} — ${ex.name}`;

  const isBodyweight = ex.equipment === 'Körpergewicht' || ex.equipment === 'Stange';
  document.getElementById('weight-group').style.display = isBodyweight ? 'none' : '';

  // „Letztes Mal“: Sätze dieser Übung aus der jüngsten früheren Einheit
  const last = await lastSetsFor(ex.exercise_id);
  if (pendingSet == null || pendingSet.ex !== ex || pendingSet.setNum !== setNum) return; // inzwischen geschlossen
  const lastEl = document.getElementById('set-last');
  if (last && last.sets.length) {
    const d = new Date(last.date).toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short' });
    lastEl.innerHTML = `${esc(I18N.t('set.lastTime', { date: d }))} <b>${esc(last.sets.map(fmtSet).join(' · '))}</b>`;
  } else {
    lastEl.textContent = I18N.t('set.noLast');
  }

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
  commitSet(exIdx, setNum, ex, {
    exercise_id: ex.exercise_id,
    set_number: setNum,
    reps,
    weight_kg: weight,
    completed: 1,
  });
  closeSetModal();

  // Start rest timer
  const rest = activeSession.exercises[exIdx].rest_seconds || 90;
  const nextEx = activeSession.exercises[exIdx + 1];
  startTimer(rest, { sub: nextEx ? I18N.t('dyn.nextExercise', { name: nextEx.name }) : I18N.t('dyn.lastRest') });
}

// ── Intervall-Sätze (HIT): Arbeits-Timer → Satz mit Dauer loggen → Pause → nächster Satz
function startTimedSet(exIdx, setNum, ex) {
  const secs = timedSeconds(ex) || 20;
  const sub = `${ex.name} · ${I18N.t('dyn.setN')} ${setNum}/${ex.sets}`;
  startTimer(secs, { kind: 'work', chain: true, sub, onDone: (elapsed) => {
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
      onDone: chainNext ? () => startTimedSet(exIdx, next, ex) : null,
    });
  } });
}

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

async function finishWorkout() {
  const s = activeSession;   // Einheit festhalten: während des Speicherns kann eine Abbruch-Antwort activeSession leeren (Review v2.8)
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
let timerState = null;   // { kind: 'rest'|'work', chain, start, end, seconds, onDone }

// opts: kind ('rest' default | 'work'), chain (Stopp-Taste zeigen, Intervall-Kette),
//       sub (Zeile unter dem Zähler), onDone(elapsedSeconds, skipped)
function startTimer(seconds, opts = {}) {
  stopTicking();
  // Endzeitpunkt statt Tick-Zählung: Android drosselt Intervalle bei gedimmtem
  // Display — mit Zeitstempel stimmt die Restzeit trotzdem
  const start = Date.now();
  timerState = { kind: opts.kind || 'rest', chain: !!opts.chain, start, end: start + seconds * 1000,
                 seconds, onDone: opts.onDone || null };

  const overlay = document.getElementById('timer-overlay');
  const count = document.getElementById('timer-count');
  overlay.classList.toggle('work', timerState.kind === 'work');
  overlay.classList.toggle('chain', timerState.chain);
  document.getElementById('timer-label').textContent = I18N.t(timerState.kind === 'work' ? 'timer.work' : 'timer.label');
  document.getElementById('timer-skip').textContent = I18N.t(timerState.kind === 'work' ? 'timer.done' : 'timer.skip');
  document.getElementById('timer-exercise').textContent = opts.sub || '';
  count.textContent = seconds;
  count.classList.remove('urgent');
  overlay.classList.add('open');

  const urgentAt = timerState.kind === 'work' ? 3 : 5;
  timerInterval = setInterval(() => {
    if (!timerState) { stopTicking(); return; }
    const remaining = Math.max(0, Math.ceil((timerState.end - Date.now()) / 1000));
    count.textContent = remaining;
    if (remaining <= urgentAt) count.classList.add('urgent');
    if (remaining <= 0) endTimer(false);
  }, 250);
}
function stopTicking() { if (timerInterval) clearInterval(timerInterval); timerInterval = null; }
function closeTimerOverlay() {
  document.getElementById('timer-overlay').classList.remove('open', 'work', 'chain');
}
// Regulär abgelaufen (Beep + Vibration) oder per Taste beendet (skipped) → onDone
function endTimer(skipped) {
  const st = timerState;
  if (!st) return;
  stopTicking();
  timerState = null;
  closeTimerOverlay();
  if (!skipped) { playBeep(); vibrate(); }
  const elapsed = Math.max(1, Math.round((Math.min(Date.now(), st.end) - st.start) / 1000));
  if (st.onDone) st.onDone(skipped ? elapsed : st.seconds, skipped);
}
// Abbrechen ohne onDone: Intervall-Kette stoppen, laufender Arbeits-Satz wird NICHT geloggt
function cancelTimer() {
  stopTicking();
  timerState = null;
  closeTimerOverlay();
}

document.getElementById('timer-skip').addEventListener('click', () => endTimer(true));
document.getElementById('timer-stop').addEventListener('click', cancelTimer);

function vibrate() {
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
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

document.getElementById('chart-btn-weight').addEventListener('click', async () => {
  progressMode = 'weight';
  document.getElementById('chart-btn-weight').classList.add('active-btn');
  document.getElementById('chart-btn-reps').classList.remove('active-btn');
  document.getElementById('chart-btn-weight').classList.remove('ghost');
  document.getElementById('chart-btn-reps').classList.add('ghost');
  if (currentProgressExId) await renderProgressChart(currentProgressExId, progressMode);
});

document.getElementById('chart-btn-reps').addEventListener('click', async () => {
  progressMode = 'reps';
  document.getElementById('chart-btn-reps').classList.add('active-btn');
  document.getElementById('chart-btn-weight').classList.remove('active-btn');
  document.getElementById('chart-btn-reps').classList.remove('ghost');
  document.getElementById('chart-btn-weight').classList.add('ghost');
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
  await LocalData.savePlan({
    id: editorPlanId,
    name,
    type: document.getElementById('editor-type').value,
    exercises,
  });
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
    card.appendChild(body);
    el.appendChild(card);
  });
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
  await LocalData.updateSession(detailSessionId, { notes });
  document.getElementById('session-msg').textContent = I18N.t('session.notesSaved');
  loadHistory();
});
document.getElementById('session-delete').addEventListener('click', async () => {
  const id = detailSessionId;
  if (id == null) return;
  const meta = document.getElementById('session-meta').textContent.split(' · ')[0];
  if (!(await ask(I18N.t('session.deleteConfirm', { date: meta }), { ok: 'dlg.deleteForever', danger: true }))) return;
  if (detailSessionId !== id) return;   // Detail wurde während der Frage geschlossen oder gewechselt
  await LocalData.deleteSession(id);
  closeSessionDetail();
  loadHistory();
  loadDashboard();
});

// ── Backup (Export / Import) ────────────────────────────────────────────────────
// Da die Daten nur auf dem Gerät liegen: JSON-Backup zum Sichern / Umziehen.
function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    if (msg) msg.textContent = I18N.t('backup.error', { msg: err.message });
  }
}

const _exportBtn = document.getElementById('backup-export');
if (_exportBtn) _exportBtn.addEventListener('click', async () => {
  const data = await LocalData.exportAll();
  downloadJSON(data, `alien-fitness-backup-${new Date().toISOString().slice(0, 10)}.json`);
  const ta = document.getElementById('backup-json');
  if (ta) { ta.value = JSON.stringify(data, null, 2); ta.style.display = 'block'; }
  const msg = document.getElementById('backup-msg');
  if (msg) msg.textContent = I18N.t('backup.exported', { s: data.sessions.length, n: data.sets.length });
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
});

// ── Init ──────────────────────────────────────────────────────────────────────
document.documentElement.lang = I18N.lang;
I18N.applyStatic();
syncCombos();                                // Knopfbeschriftungen aus den Selects setzen
I18N.ready.then(() => { I18N.applyStatic(); syncCombos(); });   // Muskel-Filter-Labels nach Content-Load
updateLangToggle();
renderAbout();
loadDashboard();
