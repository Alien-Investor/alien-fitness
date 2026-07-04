'use strict';

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
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    lightbox.classList.remove('open');
    helpOverlay.classList.remove('open');
  }
});

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
        `<span class="neon">${stats.last_session.plan_name || I18N.t('dyn.freeTraining')}</span><br>
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
          <div class="plan-name">${p.name}</div>
          <div class="plan-meta">${p.day_label || ''}</div>
        </div>
        <span class="badge ${p.type === 'hit' ? 'hit' : ''}">${p.type === 'hit' ? I18N.t('badge.hit') : I18N.t('badge.strength')}</span>`;
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
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = p.name;
    btn.addEventListener('click', () => startWorkout(p.id));
    el.appendChild(btn);
  });
}

// ── WORKOUT ACTIVE ────────────────────────────────────────────────────────────
let activeSession = null;

async function startWorkout(planId) {
  const plan = await api('plans/' + planId);

  // Switch to workout view + active screen
  navBtns.forEach(b => b.classList.remove('active'));
  document.querySelector('[data-view="workout"]').classList.add('active');
  views.forEach(v => v.classList.remove('active'));
  document.getElementById('view-workout').classList.add('active');
  document.getElementById('workout-select-screen').style.display = 'none';
  document.getElementById('workout-active-screen').style.display = 'block';
  document.getElementById('workout-done-banner').style.display = 'none';
  document.getElementById('workout-plan-name').textContent = plan.name;

  activeSession = {
    planId: plan.id,
    startedAt: new Date().toISOString(),
    exercises: plan.exercises,
    sets: [],
    completedSets: {},
  };

  renderExercises(plan.exercises);
  updateProgress();
}

function renderExercises(exercises) {
  const el = document.getElementById('exercise-list');
  el.innerHTML = '';
  exercises.forEach((ex, ei) => {
    const card = document.createElement('div');
    card.className = 'exercise-card' + (ei === 0 ? ' current' : '');
    card.id = 'ex-card-' + ei;

    const setsArr = [];
    for (let s = 1; s <= ex.sets; s++) setsArr.push(s);

    const header = document.createElement('div');
    header.className = 'ex-header';

    const img = exImageEl(ex, false);
    header.appendChild(img);

    const info = document.createElement('div');
    info.className = 'ex-info';
    info.innerHTML = `
      <div class="ex-name">${ex.name}</div>
      <div class="ex-meta">${ex.sets} ${I18N.t('dyn.sets')} × ${ex.reps} · ${I18N.t('dyn.rest')}: ${ex.rest_seconds}s · ${I18N.muscle(ex.muscle_group)}</div>`;
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
      btn.innerHTML = `<span class="set-num">${s}</span><span class="set-val">–</span>`;
      btn.addEventListener('click', () => openSetModal(ei, s, ex));
      setsRow.appendChild(btn);
    });

    card.appendChild(setsRow);
    el.appendChild(card);
  });
}

// ── Set Modal ─────────────────────────────────────────────────────────────────
let pendingSet = null;

function openSetModal(exIdx, setNum, ex) {
  pendingSet = { exIdx, setNum, ex };

  document.getElementById('set-modal-title').textContent =
    `${I18N.t('dyn.setN')} ${setNum} — ${ex.name}`;

  const isBodyweight = ex.equipment === 'Körpergewicht' || ex.equipment === 'Stange';
  document.getElementById('weight-group').style.display = isBodyweight ? 'none' : '';

  // Korrektur-Fall: eigenen Satz vorbefüllen, sonst Werte vom vorherigen Satz
  const ownSet = activeSession.sets.find(
    s => s.exercise_id === ex.exercise_id && s.set_number === setNum
  );
  const lastSet = ownSet || activeSession.sets.filter(
    s => s.exercise_id === ex.exercise_id && s.set_number === setNum - 1
  ).pop();
  document.getElementById('input-reps').value = lastSet?.reps || '';
  document.getElementById('input-weight').value = lastSet?.weight_kg || '';

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

function saveSet() {
  if (!pendingSet) return;
  const { exIdx, setNum, ex } = pendingSet;
  const reps = parseInt(document.getElementById('input-reps').value) || 0;
  const weight = parseFloat(document.getElementById('input-weight').value) || 0;

  // Korrektur statt Duplikat: erneutes Eintragen desselben Satzes ersetzt den
  // Eintrag — sonst zählt die Fertig-Logik doppelt und schließt die Übung
  // (oder das ganze Workout) zu früh ab
  const entry = {
    exercise_id: ex.exercise_id,
    set_number: setNum,
    reps,
    weight_kg: weight,
    completed: 1,
  };
  const idx = activeSession.sets.findIndex(
    s => s.exercise_id === ex.exercise_id && s.set_number === setNum
  );
  if (idx >= 0) activeSession.sets[idx] = entry;
  else activeSession.sets.push(entry);

  const btn = document.getElementById(`set-${exIdx}-${setNum}`);
  btn.classList.add('done');
  btn.querySelector('.set-val').textContent = weight > 0 ? `${reps}×${weight}kg` : `${reps} ${I18N.t('dyn.reps')}`;

  closeSetModal();
  updateProgress();

  // Check if exercise fully done
  const totalSets = activeSession.exercises[exIdx].sets;
  const doneSets = activeSession.sets.filter(
    s => s.exercise_id === ex.exercise_id && s.completed
  ).length;

  if (doneSets >= totalSets) {
    document.getElementById('ex-card-' + exIdx).classList.remove('current');
    document.getElementById('ex-card-' + exIdx).classList.add('done');
    // Mark next exercise as current
    if (exIdx + 1 < activeSession.exercises.length) {
      document.getElementById('ex-card-' + (exIdx + 1)).classList.add('current');
      document.getElementById('ex-card-' + (exIdx + 1)).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    checkWorkoutDone();
  }

  // Start rest timer
  const rest = activeSession.exercises[exIdx].rest_seconds || 90;
  const nextEx = activeSession.exercises[exIdx + 1];
  startTimer(rest, nextEx ? nextEx.name : null);
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
  if (done >= total) finishWorkout();
}

async function finishWorkout() {
  try {
    await api('sessions', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: activeSession.planId,
        started_at: activeSession.startedAt,
        finished_at: new Date().toISOString(),
        sets: activeSession.sets,
      }),
    });
  } catch(e) { console.error(e); }
  document.getElementById('exercise-list').style.display = 'none';
  document.getElementById('workout-done-banner').style.display = 'block';
}

document.getElementById('btn-abort').addEventListener('click', () => {
  document.getElementById('workout-active-screen').style.display = 'none';
  document.getElementById('workout-select-screen').style.display = 'block';
  document.getElementById('exercise-list').style.display = 'block';
  activeSession = null;
});

document.getElementById('btn-done-ok').addEventListener('click', () => {
  document.getElementById('workout-active-screen').style.display = 'none';
  document.getElementById('workout-select-screen').style.display = 'block';
  document.getElementById('exercise-list').style.display = 'block';
  activeSession = null;
  // Go to dashboard
  document.querySelector('[data-view="dashboard"]').click();
});

// ── REST TIMER ────────────────────────────────────────────────────────────────
let timerInterval = null;

function startTimer(seconds, nextExercise) {
  if (timerInterval) clearInterval(timerInterval);
  // Endzeitpunkt statt Tick-Zählung: Android drosselt Intervalle bei gedimmtem
  // Display — mit Zeitstempel stimmt die Restzeit trotzdem
  const end = Date.now() + seconds * 1000;

  const overlay = document.getElementById('timer-overlay');
  const count = document.getElementById('timer-count');
  const exLabel = document.getElementById('timer-exercise');

  overlay.classList.add('open');
  count.textContent = seconds;
  count.classList.remove('urgent');
  exLabel.textContent = nextExercise ? I18N.t('dyn.nextExercise', { name: nextExercise }) : I18N.t('dyn.lastRest');

  timerInterval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    count.textContent = remaining;
    if (remaining <= 5) count.classList.add('urgent');
    if (remaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      overlay.classList.remove('open');
      playBeep();
    }
  }, 250);
}

document.getElementById('timer-skip').addEventListener('click', () => {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  document.getElementById('timer-overlay').classList.remove('open');
});

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
  const values = mode === 'weight'
    ? data.map(r => r.max_weight)
    : data.map(r => r.max_reps);

  if (progressChart) progressChart.destroy();
  progressChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: mode === 'weight' ? I18N.t('dyn.maxWeight') : I18N.t('dyn.maxReps'),
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
      <div class="ex-lib-name">${ex.name}</div>
      <div class="ex-lib-tags">
        <span class="tag">${I18N.muscle(ex.muscle_group)}</span>
        <span class="tag">${I18N.equip(ex.equipment)}</span>
        ${ex.type === 'hit' ? '<span class="tag hit">HIT</span>' : ''}
      </div>
      <div class="ex-lib-desc">${ex.description || ''}</div>`;
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
      <div class="session-plan">${s.plan_name || I18N.t('dyn.freeTraining')}</div>
      <div class="session-meta">${dur}</div>`;
    el.appendChild(div);
  });
}

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
    const r = await LocalData.importAll(JSON.parse(text));
    if (msg) msg.textContent = I18N.t('backup.imported', { s: r.sessions, n: r.sets });
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
  updateLangToggle();
  rerenderCurrentView();
});

// ── Init ──────────────────────────────────────────────────────────────────────
document.documentElement.lang = I18N.lang;
I18N.applyStatic();
I18N.ready.then(() => I18N.applyStatic());   // Muskel-Filter-Labels nach Content-Load
updateLangToggle();
loadDashboard();
