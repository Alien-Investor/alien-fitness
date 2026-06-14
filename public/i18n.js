'use strict';

// ── Sprache (DE/EN) ─────────────────────────────────────────────────────────────
// UI-Strings im Wörterbuch unten; Übungs-/Plan-Inhalte (EN) aus i18n-content.json.
// Sprache in localStorage 'fit-lang' (Default de). t(key, vars) für JS-Strings,
// data-i18n / data-i18n-ph für statisches HTML.

window.I18N = (function () {
  const LS = 'fit-lang';
  let lang = localStorage.getItem(LS) || 'de';
  let content = null; // { exercises, plans, muscle_groups, equipment }

  const UI = {
    de: {
      'nav.dashboard': 'Dashboard', 'nav.training': 'Training', 'nav.progress': 'Fortschritt',
      'nav.library': 'Übungen', 'nav.history': 'Historie',
      'stat.total': 'Einheiten', 'stat.week': 'Diese Woche', 'stat.last': 'Zuletzt',
      'card.lastTraining': 'Letztes Training', 'dash.choosePlan': 'Trainingsplan wählen',
      'workout.start': 'Training starten', 'workout.abort': '← Abbrechen',
      'workout.doneTitle': '✓ TRAINING ABGESCHLOSSEN', 'workout.doneSaved': 'Einheit gespeichert',
      'workout.backToDash': 'Zurück zum Dashboard',
      'progress.title': 'Fortschritt', 'progress.selectOption': '– Übung wählen –',
      'progress.emptyHint': 'Übung wählen um Fortschritt zu sehen',
      'progress.weight': 'Gewicht (kg)', 'progress.reps': 'Wiederholungen',
      'library.title': 'Übungsbibliothek', 'filter.all': 'Alle', 'filter.hit': 'HIT',
      'history.title': 'Trainingshistorie', 'backup.title': 'Backup',
      'backup.hint': 'Deine Daten liegen nur auf diesem Gerät. Sichere oder übertrage sie als JSON-Datei.',
      'backup.export': 'Backup exportieren', 'backup.import': 'Backup importieren',
      'backup.pastePlaceholder': '…oder JSON hier einfügen und importieren',
      'backup.importPaste': 'Eingefügtes JSON importieren',
      'set.title': 'Satz eintragen', 'set.reps': 'Wiederholungen', 'set.weight': 'Gewicht (kg)',
      'set.save': '✓ Satz speichern', 'set.cancel': 'Abbrechen',
      'timer.label': 'PAUSE', 'timer.skip': 'Überspringen →',
      'help.title': 'ANLEITUNG',
      'help.dashboard.t': 'Dashboard',
      'help.dashboard.b': 'Zeigt deine Trainingsstatistiken (Gesamt-Einheiten, diese Woche, letztes Training) und das zuletzt absolvierte Workout. Klicke direkt auf einen Plan um sofort zu starten.',
      'help.start.t': 'Training starten',
      'help.start.b': 'Wähle einen Plan aus. Gehe Übung für Übung durch — tippe auf einen Satz-Button um Wiederholungen und Gewicht einzutragen. Abgeschlossene Sätze leuchten grün. Nach dem letzten Satz einer Übung scrollt die App automatisch zur nächsten.',
      'help.timer.t': 'Pause-Timer',
      'help.timer.b': 'Startet automatisch nach jedem abgeschlossenen Satz. Am Ende ertönt ein Beep-Signal. Mit "Überspringen →" kannst du die Pause jederzeit vorzeitig beenden.',
      'help.progress.t': 'Fortschritt',
      'help.progress.b': 'Wähle eine Übung aus dem Dropdown. Der Chart zeigt den Verlauf von Maximalgewicht (kg) oder Wiederholungen über alle bisherigen Trainings — umschalten über die Buttons unter dem Chart.',
      'help.library.t': 'Übungsbibliothek',
      'help.library.b': 'Alle 32 Übungen mit Beschreibung, Muskelgruppe und Equipment. Filtere nach Muskelgruppe oder HIT. Klick auf ein Bild öffnet die Vollbild-Ansicht — ESC oder Klick schließt sie wieder.',
      'help.history.t': 'Historie',
      'help.history.b': 'Alle abgeschlossenen Trainings mit Datum, Plan und Dauer in der Übersicht.',
      'help.plans.t': 'Trainingspläne',
      'help.plan.push': 'Push — Brust, Schultern, Trizeps',
      'help.plan.pull': 'Pull — Rücken, Bizeps',
      'help.plan.legs': 'Beine & Core',
      'help.plan.tabata': 'Tabata (20 Sek / 10 Sek × 8)',
      'help.plan.power': 'Power & Explosivkraft',
      'help.equipment.t': 'Equipment',
      'help.equipment.b': 'Klimmzugstange · Kurzhanteln · Hantelbank · Körpergewicht',
      'badge.strength': 'Kraft', 'badge.hit': 'HIT',
      'dyn.today': 'Heute', 'dyn.freeTraining': 'Freies Training',
      'dyn.sets': 'Sätze', 'dyn.rest': 'Pause', 'dyn.reps': 'Wdh', 'dyn.setN': 'Satz',
      'dyn.maxWeight': 'Max. Gewicht (kg)', 'dyn.maxReps': 'Max. Reps',
      'dyn.noDataExercise': 'Noch keine Daten für diese Übung',
      'dyn.noHistory': 'Noch kein Training geloggt', 'dyn.min': 'Min',
      'dyn.nextExercise': 'Nächste Übung: {name}', 'dyn.lastRest': 'Letzte Pause',
      'backup.exported': 'Exportiert: {s} Einheiten, {n} Sätze.',
      'backup.imported': 'Importiert: {s} Einheiten, {n} Sätze.',
      'backup.error': 'Fehler: {msg}',
      'err.invalidBackup': 'Keine gültige Alien-Fitness-Backup-Datei.',
    },
    en: {
      'nav.dashboard': 'Dashboard', 'nav.training': 'Training', 'nav.progress': 'Progress',
      'nav.library': 'Exercises', 'nav.history': 'History',
      'stat.total': 'Sessions', 'stat.week': 'This Week', 'stat.last': 'Last',
      'card.lastTraining': 'Last Training', 'dash.choosePlan': 'Choose a Plan',
      'workout.start': 'Start Training', 'workout.abort': '← Cancel',
      'workout.doneTitle': '✓ WORKOUT COMPLETE', 'workout.doneSaved': 'Session saved',
      'workout.backToDash': 'Back to Dashboard',
      'progress.title': 'Progress', 'progress.selectOption': '– Select exercise –',
      'progress.emptyHint': 'Select an exercise to see progress',
      'progress.weight': 'Weight (kg)', 'progress.reps': 'Reps',
      'library.title': 'Exercise Library', 'filter.all': 'All', 'filter.hit': 'HIT',
      'history.title': 'Training History', 'backup.title': 'Backup',
      'backup.hint': 'Your data lives only on this device. Back it up or move it as a JSON file.',
      'backup.export': 'Export backup', 'backup.import': 'Import backup',
      'backup.pastePlaceholder': '…or paste JSON here and import',
      'backup.importPaste': 'Import pasted JSON',
      'set.title': 'Log set', 'set.reps': 'Reps', 'set.weight': 'Weight (kg)',
      'set.save': '✓ Save set', 'set.cancel': 'Cancel',
      'timer.label': 'REST', 'timer.skip': 'Skip →',
      'help.title': 'GUIDE',
      'help.dashboard.t': 'Dashboard',
      'help.dashboard.b': 'Shows your training stats (total sessions, this week, last training) and your most recent workout. Tap a plan directly to start right away.',
      'help.start.t': 'Start Training',
      'help.start.b': 'Pick a plan. Work through it exercise by exercise — tap a set button to log reps and weight. Completed sets glow green. After the last set of an exercise the app scrolls to the next one automatically.',
      'help.timer.t': 'Rest Timer',
      'help.timer.b': 'Starts automatically after each completed set. A beep sounds when it ends. Use "Skip →" to end the rest early at any time.',
      'help.progress.t': 'Progress',
      'help.progress.b': 'Pick an exercise from the dropdown. The chart shows your max weight (kg) or reps over all your past workouts — switch with the buttons below the chart.',
      'help.library.t': 'Exercise Library',
      'help.library.b': 'All 32 exercises with description, muscle group and equipment. Filter by muscle group or HIT. Tap an image to open the full-screen view — ESC or click closes it again.',
      'help.history.t': 'History',
      'help.history.b': 'All completed workouts with date, plan and duration at a glance.',
      'help.plans.t': 'Training Plans',
      'help.plan.push': 'Push — Chest, Shoulders, Triceps',
      'help.plan.pull': 'Pull — Back, Biceps',
      'help.plan.legs': 'Legs & Core',
      'help.plan.tabata': 'Tabata (20 sec / 10 sec × 8)',
      'help.plan.power': 'Power & Explosiveness',
      'help.equipment.t': 'Equipment',
      'help.equipment.b': 'Pull-up bar · Dumbbells · Weight bench · Bodyweight',
      'badge.strength': 'Strength', 'badge.hit': 'HIT',
      'dyn.today': 'Today', 'dyn.freeTraining': 'Free Training',
      'dyn.sets': 'sets', 'dyn.rest': 'Rest', 'dyn.reps': 'reps', 'dyn.setN': 'Set',
      'dyn.maxWeight': 'Max weight (kg)', 'dyn.maxReps': 'Max reps',
      'dyn.noDataExercise': 'No data yet for this exercise',
      'dyn.noHistory': 'No workouts logged yet', 'dyn.min': 'min',
      'dyn.nextExercise': 'Next exercise: {name}', 'dyn.lastRest': 'Final rest',
      'backup.exported': 'Exported: {s} sessions, {n} sets.',
      'backup.imported': 'Imported: {s} sessions, {n} sets.',
      'backup.error': 'Error: {msg}',
      'err.invalidBackup': 'Not a valid Alien Fitness backup file.',
    },
  };

  const ready = (async () => {
    try { const r = await fetch('i18n-content.json'); if (r.ok) content = await r.json(); }
    catch (e) { console.error('i18n-content laden fehlgeschlagen', e); }
  })();

  function t(key, vars) {
    let s = (UI[lang] && UI[lang][key] != null) ? UI[lang][key]
          : (UI.de[key] != null ? UI.de[key] : key);
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }

  function setLang(l) { lang = l; localStorage.setItem(LS, l); document.documentElement.lang = l; }

  // Inhalts-Overlay (nur EN; DE = Originaldaten aus seed.json)
  function exercise(id) { return (lang === 'en' && content && content.exercises[id]) || null; }
  function plan(id)     { return (lang === 'en' && content && content.plans[id]) || null; }
  function muscle(g)    { return (lang === 'en' && content && content.muscle_groups[g]) || g; }
  function equip(e)     { return (lang === 'en' && content && content.equipment[e]) || e; }
  function locale()     { return lang === 'en' ? 'en-US' : 'de-DE'; }

  function applyStatic(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
    root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    // Muskelgruppen-Filter: Anzeige übersetzen, data-filter (deutscher Key) bleibt
    root.querySelectorAll('[data-i18n-muscle]').forEach(el => { el.textContent = muscle(el.getAttribute('data-i18n-muscle')); });
  }

  return {
    ready, t, setLang, applyStatic, exercise, plan, muscle, equip, locale,
    get lang() { return lang; },
  };
})();
