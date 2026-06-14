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
  const DB_VERSION = 1;

  let seed = null;          // { exercises, plans, plan_exercises }
  let exById = null;        // Map exercise_id -> exercise
  let planById = null;      // Map plan_id -> plan
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

  const ready = (async () => { await loadSeed(); idb = await openIDB(); })();

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
    let list = seed.exercises.slice();
    if (q.muscle_group) list = list.filter(e => e.muscle_group === q.muscle_group);
    if (q.equipment)    list = list.filter(e => e.equipment === q.equipment);
    if (q.type)         list = list.filter(e => e.type === q.type);
    list.sort((a, b) =>
      a.muscle_group.localeCompare(b.muscle_group) || a.name.localeCompare(b.name));
    return list;
  }

  async function getExercise(id) {
    return exById.get(Number(id)) || null;
  }

  async function getPlans() {
    return seed.plans.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  async function getPlan(id) {
    const plan = planById.get(Number(id));
    if (!plan) return null;
    const exercises = seed.plan_exercises
      .filter(pe => pe.plan_id === Number(id))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(pe => {
        const e = exById.get(pe.exercise_id) || {};
        return {
          ...pe,
          name: e.name, muscle_group: e.muscle_group, equipment: e.equipment,
          description: e.description, type: e.type,
        };
      });
    return { ...plan, exercises };
  }

  async function getSessions(limit = 20) {
    const sessions = await allFrom('sessions');
    sessions.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
    return sessions.slice(0, limit).map(s => {
      const p = s.plan_id != null ? planById.get(s.plan_id) : null;
      return { ...s, plan_name: p ? p.name : null, plan_type: p ? p.type : null };
    });
  }

  async function getSession(id) {
    const session = await reqP(tx(['sessions'], 'readonly').get(Number(id)));
    if (!session) return null;
    const all = await allFrom('sets');
    const sets = all.filter(st => st.session_id === Number(id))
      .sort((a, b) => a.exercise_id - b.exercise_id || a.set_number - b.set_number)
      .map(st => {
        const e = exById.get(st.exercise_id) || {};
        return { ...st, exercise_name: e.name, muscle_group: e.muscle_group };
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
    return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 60);
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
      const p = s.plan_id != null ? planById.get(s.plan_id) : null;
      last_session = { started_at: s.started_at, plan_name: p ? p.name : null };
    }
    return { total_sessions, last_session, this_week };
  }

  // ── Backup: Export / Import ─────────────────────────────────────────────────────
  async function exportAll() {
    const [sessions, sets] = await Promise.all([allFrom('sessions'), allFrom('sets')]);
    return {
      format: 'alien-fitness-backup', version: 1,
      exported_at: new Date().toISOString(),
      sessions, sets,
    };
  }

  async function importAll(obj, { merge = false } = {}) {
    if (!obj || obj.format !== 'alien-fitness-backup')
      throw new Error('Keine gültige Alien-Fitness-Backup-Datei.');
    const sessions = Array.isArray(obj.sessions) ? obj.sessions : [];
    const sets = Array.isArray(obj.sets) ? obj.sets : [];
    const [sessStore, setStore] = tx(['sessions', 'sets'], 'readwrite');
    if (!merge) {
      await reqP(sessStore.clear());
      await reqP(setStore.clear());
    }
    for (const s of sessions) await reqP(merge ? sessStore.add(stripId(s)) : sessStore.put(s));
    for (const s of sets)     await reqP(merge ? setStore.add(stripId(s))  : setStore.put(s));
    return { sessions: sessions.length, sets: sets.length };
  }

  function stripId(o) { const c = { ...o }; delete c.id; return c; }

  return {
    ready,
    getExercises, getExercise, getPlans, getPlan,
    getSessions, getSession, addSession, getProgress, getStats,
    exportAll, importAll,
  };
})();
