'use strict';

// ── Lokale Datenschicht (offline-first) ─────────────────────────────────────────
// Ersetzt das Server-Backend vollständig. Stammdaten (Übungen, Pläne) kommen aus
// der gebündelten seed.json; der Trainingsverlauf (sessions, sets) liegt in
// IndexedDB auf dem Gerät. Kein Server, kein Konto, keine Daten verlassen das Gerät.
//
// Liefert exakt die gleichen Objekt-Formate wie das frühere Express-Backend,
// damit app.js unverändert weiterläuft. Bonus: JSON-Export/-Import als Backup.

window.LocalData = (function () {
  const DB_NAME = 'alien-fitness';
  const DB_VERSION = 2;          // v2: custom_plans (eigene Trainingspläne)
  // Eigene Pläne bekommen öffentliche IDs ab 1000 — kollidiert nie mit den
  // Seed-Plänen (1..n) und bleibt in sessions.plan_id stabil referenzierbar.
  const CUSTOM_OFFSET = 1000;

  let seed = null;          // { exercises, plans, plan_exercises }
  let exById = null;        // Map exercise_id -> exercise
  let planById = null;      // Map plan_id -> plan (nur Seed-Pläne)
  let customById = new Map(); // Map öffentliche ID (1000+) -> eigener Plan (Rohdaten)
  let idb = null;           // IndexedDB-Handle

  // ── Setup ─────────────────────────────────────────────────────────────────────
  function openIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('sets')) {
          const s = db.createObjectStore('sets', { keyPath: 'id', autoIncrement: true });
          s.createIndex('session_id', 'session_id', { unique: false });
          s.createIndex('exercise_id', 'exercise_id', { unique: false });
        }
        if (!db.objectStoreNames.contains('custom_plans')) {
          db.createObjectStore('custom_plans', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function loadSeed() {
    const res = await fetch('seed.json');
    if (!res.ok) throw new Error('seed.json nicht ladbar (' + res.status + ')');
    seed = await res.json();
    exById = new Map(seed.exercises.map(e => [e.id, e]));
    planById = new Map(seed.plans.map(p => [p.id, p]));
  }

  async function refreshCustomCache() {
    const rows = await allFrom('custom_plans');
    customById = new Map(rows.map(r => [CUSTOM_OFFSET + r.id, r]));
  }

  const ready = (async () => {
    await loadSeed();
    if (window.I18N) await window.I18N.ready;   // EN-Inhalte bereit, bevor gerendert wird
    idb = await openIDB();
    await refreshCustomCache();
  })();

  // ── Sprach-Overlay (EN-Inhalte aus i18n-content.json; DE = Originaldaten) ────────
  function exOverlay(e) {
    if (!e) return e;
    const tr = window.I18N && window.I18N.exercise(e.id);
    return tr ? { ...e, name: tr.name, description: tr.description } : e;
  }
  function planOverlay(p) {
    if (!p) return p;
    const tr = window.I18N && window.I18N.plan(p.id);
    return tr ? { ...p, name: tr.name, day_label: tr.day_label } : p;
  }
  function planNameById(id) {
    const p = planById.get(id);
    if (!p) {
      const c = customById.get(id);
      return c ? c.name : null;
    }
    const tr = window.I18N && window.I18N.plan(id);
    return tr ? tr.name : p.name;
  }
  function planTypeById(id) {
    const p = planById.get(id) || customById.get(id);
    return p ? (p.type || 'strength') : null;
  }
  function exName(id, fallback) {
    const tr = window.I18N && window.I18N.exercise(id);
    return tr ? tr.name : fallback;
  }

  // ── IndexedDB-Helfer ───────────────────────────────────────────────────────────
  function tx(stores, mode) {
    const t = idb.transaction(stores, mode);
    return stores.length === 1 ? t.objectStore(stores[0]) : stores.map(s => t.objectStore(s));
  }
  function reqP(r) {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  function allFrom(store) { return reqP(tx([store], 'readonly').getAll()); }

  // ── API-kompatible Methoden ─────────────────────────────────────────────────────
  async function getExercises(q = {}) {
    let list = seed.exercises.map(exOverlay);
    if (q.muscle_group) list = list.filter(e => e.muscle_group === q.muscle_group);
    if (q.equipment)    list = list.filter(e => e.equipment === q.equipment);
    if (q.type)         list = list.filter(e => e.type === q.type);
    list.sort((a, b) =>
      a.muscle_group.localeCompare(b.muscle_group) || a.name.localeCompare(b.name));
    return list;
  }

  async function getExercise(id) {
    return exOverlay(exById.get(Number(id))) || null;
  }

  function joinExercise(pe, idx) {
    const e = exById.get(pe.exercise_id) || {};
    const trx = window.I18N && window.I18N.exercise(pe.exercise_id);
    return {
      ...pe, sort_order: pe.sort_order != null ? pe.sort_order : idx,
      name: trx ? trx.name : e.name, muscle_group: e.muscle_group, equipment: e.equipment,
      description: trx ? trx.description : e.description, type: e.type,
    };
  }

  async function getPlans() {
    const seedPlans = seed.plans.map(planOverlay).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    // Eigene Pläne (custom: true) hinter den Seed-Plänen
    const custom = Array.from(customById.entries())
      .map(([pid, r]) => ({ id: pid, name: r.name, type: r.type || 'strength', day_label: r.day_label || '', custom: true }))
      .sort((a, b) => a.id - b.id);
    return [...seedPlans, ...custom];
  }

  async function getPlan(id) {
    id = Number(id);
    if (id >= CUSTOM_OFFSET) {
      const r = customById.get(id);
      if (!r) return null;
      return {
        id, name: r.name, type: r.type || 'strength', day_label: r.day_label || '', custom: true,
        exercises: (r.exercises || []).map(joinExercise),
      };
    }
    const plan = planById.get(id);
    if (!plan) return null;
    const exercises = seed.plan_exercises
      .filter(pe => pe.plan_id === id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(joinExercise);
    return { ...planOverlay(plan), exercises };
  }

  // ── Eigene Pläne (CRUD) ─────────────────────────────────────────────────────────
  async function savePlan(plan) {
    // plan: { id? (öffentliche 1000er-ID beim Bearbeiten), name, type, day_label, exercises }
    const rec = {
      name: plan.name, type: plan.type || 'strength',
      day_label: plan.day_label || '', exercises: plan.exercises || [],
    };
    const store = tx(['custom_plans'], 'readwrite');
    if (plan.id != null) rec.id = Number(plan.id) - CUSTOM_OFFSET;
    const newId = await reqP(store.put(rec));
    await refreshCustomCache();
    return CUSTOM_OFFSET + newId;
  }

  function getCustomPlan(id) {
    // Rohdaten für den Editor (ohne Übersetzungs-Overlay, ohne Join)
    const r = customById.get(Number(id));
    return r ? {
      id: Number(id), name: r.name, type: r.type || 'strength',
      day_label: r.day_label || '', exercises: r.exercises || [],
    } : null;
  }

  async function deletePlan(id) {
    await reqP(tx(['custom_plans'], 'readwrite').delete(Number(id) - CUSTOM_OFFSET));
    await refreshCustomCache();
  }

  async function getSessions(limit = 20) {
    const sessions = await allFrom('sessions');
    sessions.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
    return sessions.slice(0, limit).map(s => ({
      ...s,
      plan_name: s.plan_id != null ? planNameById(s.plan_id) : null,
      plan_type: s.plan_id != null ? planTypeById(s.plan_id) : null,
    }));
  }

  async function getSession(id) {
    const session = await reqP(tx(['sessions'], 'readonly').get(Number(id)));
    if (!session) return null;
    const all = await allFrom('sets');
    const sets = all.filter(st => st.session_id === Number(id))
      .sort((a, b) => a.exercise_id - b.exercise_id || a.set_number - b.set_number)
      .map(st => {
        const e = exById.get(st.exercise_id) || {};
        return { ...st, exercise_name: exName(st.exercise_id, e.name), muscle_group: e.muscle_group };
      });
    return { ...session, sets };
  }

  async function addSession(payload) {
    const [sessStore, setStore] = tx(['sessions', 'sets'], 'readwrite');
    const nowISO = new Date().toISOString();
    const id = await reqP(sessStore.add({
      plan_id: payload.plan_id != null ? payload.plan_id : null,
      started_at: payload.started_at || nowISO,
      finished_at: payload.finished_at || nowISO,
      notes: payload.notes || null,
    }));
    if (Array.isArray(payload.sets)) {
      for (const s of payload.sets) {
        await reqP(setStore.add({
          session_id: id,
          exercise_id: s.exercise_id,
          set_number: s.set_number,
          reps: s.reps != null ? s.reps : null,
          weight_kg: s.weight_kg != null ? s.weight_kg : 0,
          duration_seconds: s.duration_seconds != null ? s.duration_seconds : null,
          completed: s.completed ? 1 : 0,
        }));
      }
    }
    return { id };
  }

  async function getProgress(exId) {
    exId = Number(exId);
    const [allSets, allSessions] = await Promise.all([allFrom('sets'), allFrom('sessions')]);
    const sessDate = new Map(allSessions.map(s => [s.id, (s.started_at || '').slice(0, 10)]));
    const byDate = new Map();
    for (const st of allSets) {
      if (st.exercise_id !== exId || !st.completed) continue;
      const date = sessDate.get(st.session_id);
      if (!date) continue;
      let row = byDate.get(date);
      if (!row) { row = { date, max_reps: 0, max_weight: 0, total_sets: 0 }; byDate.set(date, row); }
      row.max_reps = Math.max(row.max_reps, st.reps || 0);
      row.max_weight = Math.max(row.max_weight, st.weight_kg || 0);
      row.total_sets++;
    }
    // Die NEUESTEN 60 Trainingstage (slice(-60)) — slice(0,60) wären die ältesten,
    // dann würde der Chart nach 60 Tagen pro Übung einfrieren (Bug bis v2.3,
    // 1:1 vom alten Server-Backend geerbt)
    return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-60);
  }

  function startOfWeekISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7; // 0 = Montag
    d.setDate(d.getDate() - day);
    return d.toISOString();
  }

  async function getStats() {
    const sessions = await allFrom('sessions');
    sessions.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
    const total_sessions = sessions.length;
    const weekStart = startOfWeekISO();
    const this_week = sessions.filter(s => (s.started_at || '') >= weekStart).length;
    let last_session;
    if (sessions.length) {
      const s = sessions[0];
      last_session = { started_at: s.started_at, plan_name: s.plan_id != null ? planNameById(s.plan_id) : null };
    }
    return { total_sessions, last_session, this_week };
  }

  // ── Backup: Export / Import ─────────────────────────────────────────────────────
  async function exportAll() {
    const [sessions, sets, custom_plans] = await Promise.all([
      allFrom('sessions'), allFrom('sets'), allFrom('custom_plans'),
    ]);
    return {
      format: 'alien-fitness-backup', version: 2,   // v2: + custom_plans
      exported_at: new Date().toISOString(),
      sessions, sets, custom_plans,
    };
  }

  async function importAll(obj, { merge = false } = {}) {
    if (!obj || obj.format !== 'alien-fitness-backup')
      throw new Error(window.I18N ? window.I18N.t('err.invalidBackup') : 'Invalid backup file.');
    const sessions = Array.isArray(obj.sessions) ? obj.sessions : [];
    const sets = Array.isArray(obj.sets) ? obj.sets : [];
    const customPlans = Array.isArray(obj.custom_plans) ? obj.custom_plans : []; // fehlt in v1-Backups → leer
    const [sessStore, setStore, planStore] = tx(['sessions', 'sets', 'custom_plans'], 'readwrite');
    if (!merge) {
      await reqP(sessStore.clear());
      await reqP(setStore.clear());
      await reqP(planStore.clear());
    }
    // Merge vergibt neue IDs (add ohne id) — Referenzen müssen auf die NEUEN IDs
    // umgehängt werden: sets.session_id → neue Session-ID, sessions.plan_id →
    // neue öffentliche Plan-ID (1000+), sonst hängen sie an fremden/keinen Einträgen
    const planIdMap = new Map();
    for (const p of customPlans) {
      const newId = await reqP(merge ? planStore.add(stripId(p)) : planStore.put(p));
      if (merge) planIdMap.set(CUSTOM_OFFSET + p.id, CUSTOM_OFFSET + newId);
    }
    const idMap = new Map();
    for (const s of sessions) {
      const rec = merge ? stripId(s) : s;
      if (merge && planIdMap.has(rec.plan_id)) rec.plan_id = planIdMap.get(rec.plan_id);
      const newId = await reqP(merge ? sessStore.add(rec) : sessStore.put(rec));
      if (merge) idMap.set(s.id, newId);
    }
    for (const s of sets) {
      if (merge) {
        const c = stripId(s);
        if (idMap.has(s.session_id)) c.session_id = idMap.get(s.session_id);
        await reqP(setStore.add(c));
      } else {
        await reqP(setStore.put(s));
      }
    }
    await refreshCustomCache();
    return { sessions: sessions.length, sets: sets.length, plans: customPlans.length };
  }

  function stripId(o) { const c = { ...o }; delete c.id; return c; }

  return {
    ready,
    getExercises, getExercise, getPlans, getPlan,
    savePlan, getCustomPlan, deletePlan,
    getSessions, getSession, addSession, getProgress, getStats,
    exportAll, importAll,
  };
})();
