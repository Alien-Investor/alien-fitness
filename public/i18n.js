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
      'help.timer.t': 'Pause-Timer',
      'help.progress.t': 'Fortschritt',
      'help.progress.b': 'Wähle eine Übung aus dem Dropdown. Der Chart zeigt den Verlauf von Maximalgewicht (kg) oder Wiederholungen über die letzten 60 Trainingstage — umschalten über die Buttons unter dem Chart. Übungen ohne Gewicht (z. B. Klimmzüge, Plank) zeigen gleich Wiederholungen bzw. Sekunden.',
      'help.library.t': 'Übungsbibliothek',
      'help.library.b': 'Alle 32 Übungen mit Beschreibung, Muskelgruppe und Equipment. Filtere nach Muskelgruppe oder HIT. Klick auf ein Bild öffnet die Vollbild-Ansicht — ESC oder Klick schließt sie wieder.',
      'help.history.t': 'Historie',
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
      'adhoc.start': '＋ Freies Training', 'adhoc.addEx': '＋ Übung hinzufügen',
      'adhoc.addSet': 'Satz hinzufügen',
      'workout.finish': '✓ Beenden & speichern',
      'plan.new': '＋ Eigener Plan', 'plan.newTitle': 'Eigenen Plan erstellen',
      'plan.editTitle': 'Plan bearbeiten', 'plan.namePh': 'z.B. Oberkörper A',
      'plan.typeStrength': 'Kraft', 'plan.typeHit': 'HIT',
      'plan.colEx': 'Übung', 'plan.colSets': 'Sätze', 'plan.colReps': 'Wdh', 'plan.colRest': 'Pause',
      'plan.addEx': '＋ Übung', 'plan.save': '✓ Plan speichern',
      'plan.edit': 'Bearbeiten', 'plan.delete': 'Löschen',
      'plan.deleteConfirm': 'Plan "{name}" löschen? Der Trainingsverlauf bleibt erhalten.',
      'plan.needName': 'Bitte einen Plan-Namen eingeben.',
      'plan.needEx': 'Mindestens eine Übung wählen.',
      'badge.custom': 'Eigener',
      'picker.title': 'Übung wählen', 'picker.searchPh': 'Suchen…',
      'help.custom.t': 'Eigene Pläne & Freies Training',
      'help.custom.b': 'Unter Training: „＋ Eigener Plan" erstellt einen eigenen Trainingsplan aus allen Übungen (Sätze, Wiederholungen, Pause frei wählbar) — bearbeiten und löschen jederzeit möglich. „＋ Freies Training" startet ohne Plan: Übungen unterwegs hinzufügen, Sätze loggen, mit „Beenden & speichern" abschließen.',
      // v2.6
      'set.lastTime': 'Letztes Mal ({date}):', 'set.noLast': 'Erstes Mal mit dieser Übung',
      'timer.work': 'ARBEIT', 'timer.done': 'Fertig →', 'timer.stop': '■ Stopp',
      'dyn.sec': 's', 'dyn.maxRepsSec': 'Max. Reps / Sekunden', 'dyn.duration': 'Dauer',
      'workout.abortConfirm': 'Training abbrechen? {n} geloggte Sätze gehen verloren.',
      'workout.saveFailed': 'Speichern fehlgeschlagen. Die Einheit bleibt erhalten — bitte erneut versuchen.',
      'about': 'Alien Fitness v{v} · vollständig offline · MIT‑Lizenz',   // \u2011: geschützter Bindestrich, sonst bricht „MIT-“ bei 360 px um
      'resume.title': 'Unterbrochenes Training',
      'resume.body': '{name} · {n} Sätze geloggt · gestartet {time}',
      'resume.go': 'Fortsetzen', 'resume.saveNow': 'So speichern', 'resume.drop': 'Verwerfen',
      'resume.dropConfirm': 'Unterbrochenes Training verwerfen? {n} Sätze gehen verloren.',
      'backup.mode': 'Import-Modus', 'backup.modeMerge': 'Zusammenführen (empfohlen)',
      'backup.modeReplace': 'Alles ersetzen',
      'backup.replaceConfirm': 'Wirklich ALLE vorhandenen Daten ({s} Einheiten, {p} eigene Pläne) durch das Backup ersetzen? Das lässt sich nicht rückgängig machen.',
      'backup.importedFull': 'Importiert: {s} Einheiten, {n} Sätze, {p} Pläne.',
      'backup.skipped': ' {k} bereits vorhandene Einheiten übersprungen.',
      'backup.hint': 'Deine Daten liegen nur auf diesem Gerät. Sichere oder übertrage sie als JSON-Datei. „Zusammenführen" ergänzt vorhandene Daten und überspringt Doppelte, „Alles ersetzen" löscht vorher alles.',
      'history.hint': 'Antippen für Details, Notiz und Löschen.',
      'session.title': 'Einheit', 'session.close': 'Schließen',
      'session.delete': 'Einheit löschen',
      'session.deleteConfirm': 'Diese Einheit vom {date} endgültig löschen?',
      'session.notes': 'Notiz', 'session.notesPh': 'z.B. wenig geschlafen, Schulter zwickt',
      'session.saveNotes': 'Notiz speichern', 'session.notesSaved': 'Notiz gespeichert.',
      'session.noSets': 'Keine Sätze geloggt.',
      'help.start.b': 'Wähle einen Plan aus. Gehe Übung für Übung durch — tippe auf einen Satz-Button um Wiederholungen und Gewicht einzutragen. Das Modal zeigt, was du beim letzten Mal bei dieser Übung geschafft hast, und ist vorbelegt (mit dem vorigen Satz, beim ersten Satz mit dem letzten Mal); dieselbe Zeile „Letztes Mal“ steht schon vorher auf den Übungskarten. Abgeschlossene Sätze leuchten grün; erneut antippen korrigiert. Wird die App mittendrin geschlossen, bietet das Dashboard beim nächsten Start an, das Training fortzusetzen.',
      'help.timer.b': 'Startet automatisch nach jedem abgeschlossenen Satz, hält das Display wach und meldet sich am Ende mit Vibration und einer Ansage (bei ausgeschalteter Stimme mit einem Beep). Mit „Überspringen →“ kannst du die Pause jederzeit vorzeitig beenden.',
      'help.hit.t': 'HIT-Intervalle',
      'help.hit.b': 'Übungen mit Zeitangabe statt Wiederholungen (z.B. „20 Sek“) laufen als Intervall: Satz antippen öffnet die Zeitwahl (20 bis 180 Sekunden oder eine eigene Zeit, vorbelegt mit der zuletzt gestarteten Zeit, sonst der Angabe im Plan). Nach „▶ Start“ bleiben 5 Sekunden zum Bereitmachen, dann läuft der Arbeits-Timer, danach die Pause, und die nächste Runde derselben Übung startet von selbst mit derselben Zeit. „■ Stopp“ unterbricht die Kette, „Fertig →“ beendet ein Intervall vorzeitig und loggt die tatsächliche Dauer.',
      'help.history.b': 'Alle abgeschlossenen Trainings mit Datum, Plan und Dauer. Antippen zeigt alle Sätze, erlaubt eine Notiz und löscht die Einheit bei Bedarf.',
      'help.backup.t': 'Backup',
      'help.backup.b': 'Unter Historie: Export speichert alle Einheiten, Sätze und eigenen Pläne als JSON-Datei im Ordner „Documents“ und öffnet danach den Teilen-Dialog, etwa für Syncthing oder Mail. Die Datei bleibt dort, auch wenn du die App löschst; auf Android 10 und älter bleibt nur der Teilen-Dialog. Import „Zusammenführen" ergänzt vorhandene Daten und überspringt Einheiten, die es schon gibt. „Alles ersetzen" löscht vorher alles auf dem Gerät und fragt vorher nach.',
      'help.privacy.t': 'Privatsphäre',
      'help.privacy.b': 'Die App hat keine Internet-Berechtigung und sendet nichts — auch keine Schriftarten oder Bibliotheken werden nachgeladen. Deine Daten verlassen das Gerät nur, wenn du selbst ein Backup exportierst oder teilst, oder über die Android-Systemsicherung bzw. eine Übertragung auf ein neues Handy.',
      // v2.7
      'combo.filterPh': 'Tippen zum Filtern…',
      'combo.noHit': 'Kein Treffer',
      // v2.8: Rückfrage-Dialog (Knopf je Frage, nie nur „OK“)
      'dlg.cancel': 'Abbrechen', 'dlg.ok': 'OK',
      'dlg.deletePlan': 'Plan löschen', 'dlg.deleteForever': 'Endgültig löschen',
      'dlg.discard': 'Verwerfen', 'dlg.abort': 'Training abbrechen', 'dlg.keepGoing': 'Weitertrainieren',
      'dlg.replace': 'Alles ersetzen',
      // v2.9: Halteübungen (Plank)
      'hold.title': 'Haltezeit', 'hold.custom': 'Eigene Zeit (Sekunden)', 'hold.max': 'Max',
      'hold.maxHint': 'Stoppuhr: läuft, bis du „Fertig →“ tippst (höchstens 10 Minuten).',
      'hold.start': '▶ Start', 'hold.logOnly': 'Ohne Timer eintragen',
      // v2.10: Zeitwahl auch für Intervalle (Tabata)
      'kerstin.tip': 'Kerstin-Tipp', 'kerstin.warn': '⚠ Kerstin-Warnung',
      'help.kerstin.t': 'Kerstins Tipps und Thorstens Ansagen',
      'help.kerstin.b': 'Kerstin, die Bord-KI, gibt zu jeder Übung einen Technik-Tipp und bei manchen eine Warnung: im Training unter der Beschreibung zum Aufklappen, in der Übungsbibliothek immer sichtbar. Ihre Hinweise sind allgemein und ersetzen keine Beratung durch Arzt oder Trainer; bei Schmerzen die Übung abbrechen. Im Training sagt Thorsten an, was als Nächstes kommt („Mach dich bereit“, „Los geht’s“, „Pause“), drei kurze Töne zählen die letzten Sekunden bis zum Start. Der Lautsprecher-Knopf oben im Training und im Timer schaltet die Ansagen ein und aus. Sie sind fertige Tondateien in der App, nichts wird aus dem Netz geladen.',
      'voice.off': 'Aus', 'voice.title': 'Ansage-Stimme: {name} (tippen zum Wechseln)',
      'hold.titleInterval': 'Belastungszeit', 'hold.chainHint': 'Gilt auch für die folgenden Runden, dazwischen {rest} s Pause.',
      'timer.prep': 'BEREIT MACHEN', 'timer.go': 'Los →', 'timer.hold': 'HALTEN',
      'backup.savedDocs': 'Gespeichert im Ordner „Documents“ ({name}).',
      'backup.sharedOnly': 'Nur über den Teilen-Dialog weitergegeben (keine Datei im Ordner „Documents“).',
      'backup.saveFailed': 'Datei konnte nicht gespeichert werden — das JSON steht oben im Textfeld zum Kopieren.',
      'backup.shareCanceled': 'Teilen abgebrochen, keine Datei gespeichert.',
      'workout.replaceConfirm': 'Es läuft noch ein Training ({name}, {n} Sätze geloggt). Verwerfen und neu starten?',
      'err.saveFailed': 'Speichern fehlgeschlagen — ist der Speicher voll? Bitte Platz schaffen und erneut versuchen.',
      'help.hold.t': 'Halteübungen (Plank)',
      'help.hold.b': 'Bei Plank wählst du vor jedem Satz die Haltezeit: 30 bis 180 Sekunden, eine eigene Zeit oder „Max“ als Stoppuhr. Vorbelegt ist die zuletzt gestartete Zeit, sonst die Angabe im Plan. Nach „▶ Start“ bleiben 5 Sekunden, um in Position zu kommen, dann läuft der Halte-Timer. „Fertig →“ beendet früher und speichert die gehaltene Zeit, „■ Stopp“ bricht ohne Eintrag ab. „Ohne Timer eintragen“ speichert die gewählte Zeit direkt, etwa zum Korrigieren.',
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
      'help.timer.t': 'Rest Timer',
      'help.progress.t': 'Progress',
      'help.progress.b': 'Pick an exercise from the dropdown. The chart shows your max weight (kg) or reps over your last 60 training days — switch with the buttons below the chart. Exercises without weight (e.g. pull-ups, plank) show reps or seconds right away.',
      'help.library.t': 'Exercise Library',
      'help.library.b': 'All 32 exercises with description, muscle group and equipment. Filter by muscle group or HIT. Tap an image to open the full-screen view — ESC or click closes it again.',
      'help.history.t': 'History',
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
      'adhoc.start': '＋ Free training', 'adhoc.addEx': '＋ Add exercise',
      'adhoc.addSet': 'Add set',
      'workout.finish': '✓ Finish & save',
      'plan.new': '＋ Custom plan', 'plan.newTitle': 'Create custom plan',
      'plan.editTitle': 'Edit plan', 'plan.namePh': 'e.g. Upper body A',
      'plan.typeStrength': 'Strength', 'plan.typeHit': 'HIT',
      'plan.colEx': 'Exercise', 'plan.colSets': 'Sets', 'plan.colReps': 'Reps', 'plan.colRest': 'Rest',
      'plan.addEx': '＋ Exercise', 'plan.save': '✓ Save plan',
      'plan.edit': 'Edit', 'plan.delete': 'Delete',
      'plan.deleteConfirm': 'Delete plan "{name}"? Your training history is kept.',
      'plan.needName': 'Please enter a plan name.',
      'plan.needEx': 'Pick at least one exercise.',
      'badge.custom': 'Custom',
      'picker.title': 'Pick an exercise', 'picker.searchPh': 'Search…',
      'help.custom.t': 'Custom Plans & Free Training',
      'help.custom.b': 'Under Training: "＋ Custom plan" builds your own training plan from all exercises (sets, reps and rest freely configurable) — edit or delete it any time. "＋ Free training" starts without a plan: add exercises on the fly, log your sets, finish with "Finish & save".',
      // v2.6
      'set.lastTime': 'Last time ({date}):', 'set.noLast': 'First time for this exercise',
      'timer.work': 'WORK', 'timer.done': 'Done →', 'timer.stop': '■ Stop',
      'dyn.sec': 's', 'dyn.maxRepsSec': 'Max reps / seconds', 'dyn.duration': 'Duration',
      'workout.abortConfirm': 'Cancel workout? {n} logged sets will be lost.',
      'workout.saveFailed': 'Saving failed. Your session is kept — please try again.',
      'about': 'Alien Fitness v{v} · fully offline · MIT license',
      'resume.title': 'Interrupted workout',
      'resume.body': '{name} · {n} sets logged · started {time}',
      'resume.go': 'Resume', 'resume.saveNow': 'Save as is', 'resume.drop': 'Discard',
      'resume.dropConfirm': 'Discard the interrupted workout? {n} sets will be lost.',
      'backup.mode': 'Import mode', 'backup.modeMerge': 'Merge (recommended)',
      'backup.modeReplace': 'Replace everything',
      'backup.replaceConfirm': 'Really replace ALL existing data ({s} sessions, {p} custom plans) with the backup? This cannot be undone.',
      'backup.importedFull': 'Imported: {s} sessions, {n} sets, {p} plans.',
      'backup.skipped': ' {k} already existing sessions skipped.',
      'backup.hint': 'Your data lives only on this device. Back it up or move it as a JSON file. "Merge" adds to existing data and skips duplicates, "Replace everything" wipes the device first.',
      'history.hint': 'Tap for details, note and delete.',
      'session.title': 'Session', 'session.close': 'Close',
      'session.delete': 'Delete session',
      'session.deleteConfirm': 'Permanently delete this session from {date}?',
      'session.notes': 'Note', 'session.notesPh': 'e.g. slept badly, shoulder sore',
      'session.saveNotes': 'Save note', 'session.notesSaved': 'Note saved.',
      'session.noSets': 'No sets logged.',
      'help.start.b': 'Pick a plan. Work through it exercise by exercise — tap a set button to log reps and weight. The dialog shows what you did last time for this exercise and comes pre-filled (with your previous set, for the first set with last time); the same "Last time" line is already shown on the exercise cards. Completed sets glow green; tap again to correct. If the app gets closed mid-workout, the dashboard offers to resume it on the next start.',
      'help.timer.b': 'Starts automatically after each completed set, keeps the screen awake and signals the end with a vibration and an announcement (a beep when the voice is off). Use "Skip →" to end the rest early at any time.',
      'help.hit.t': 'HIT Intervals',
      'help.hit.b': 'Exercises with a time instead of reps (e.g. "20 sec") run as intervals: tapping a set opens the time picker (20 to 180 seconds or a custom time, pre-filled with the time you started last, otherwise the value from the plan). After "▶ Start" you get 5 seconds to get ready, then the work timer runs, the rest follows and the next round of the same exercise starts by itself with the same time. "■ Stop" breaks the chain, "Done →" ends an interval early and logs the actual duration.',
      'help.history.b': 'All completed workouts with date, plan and duration. Tap one to see every set, add a note or delete the session.',
      'help.backup.t': 'Backup',
      'help.backup.b': 'Under History: export saves all sessions, sets and custom plans as a JSON file in the "Documents" folder and then opens the share dialog, e.g. for Syncthing or mail. The file stays there even if you uninstall the app; on Android 10 and older only the share dialog is available. Import "Merge" adds to existing data and skips sessions that already exist. "Replace everything" wipes the device first and asks before doing so.',
      'help.privacy.t': 'Privacy',
      'help.privacy.b': 'The app has no internet permission and sends nothing — no fonts or libraries are loaded from the web either. Your data leaves the device only when you export or share a backup yourself, or via Android\'s system backup or a transfer to a new phone.',
      // v2.7
      'combo.filterPh': 'Type to filter…',
      'combo.noHit': 'No match',
      // v2.8: confirmation dialog
      'dlg.cancel': 'Cancel', 'dlg.ok': 'OK',
      'dlg.deletePlan': 'Delete plan', 'dlg.deleteForever': 'Delete permanently',
      'dlg.discard': 'Discard', 'dlg.abort': 'Cancel workout', 'dlg.keepGoing': 'Keep training',
      'dlg.replace': 'Replace all',
      // v2.9: hold exercises (plank)
      'hold.title': 'Hold time', 'hold.custom': 'Custom time (seconds)', 'hold.max': 'Max',
      'hold.maxHint': 'Stopwatch: runs until you tap "Done →" (10 minutes at most).',
      'hold.start': '▶ Start', 'hold.logOnly': 'Log without timer',
      // v2.10: time picker for intervals too (Tabata)
      'kerstin.tip': "Kerstin's tip", 'kerstin.warn': "⚠ Kerstin's warning",
      'help.kerstin.t': "Kerstin's tips and Thorsten's announcements",
      'help.kerstin.b': 'Kerstin, the onboard AI, gives a technique tip for every exercise and a warning for some: during a workout you can fold it out below the description, in the exercise library it is always shown. Her advice is general and does not replace a doctor or coach; stop the exercise if it hurts. During a workout Thorsten announces what comes next ("Get ready", "Go", "Rest"), three short tones count down the last seconds before the start. The speaker button at the top of the workout and in the timer turns the announcements on and off. They are audio files bundled with the app, nothing is loaded from the internet.',
      'voice.off': 'Off', 'voice.title': 'Announcer voice: {name} (tap to switch)',
      'hold.titleInterval': 'Work time', 'hold.chainHint': 'Also applies to the following rounds, with {rest} s rest in between.',
      'timer.prep': 'GET READY', 'timer.go': 'Go →', 'timer.hold': 'HOLD',
      'backup.savedDocs': 'Saved to the "Documents" folder ({name}).',
      'backup.sharedOnly': 'Handed over via the share dialog only (no file in "Documents").',
      'backup.saveFailed': 'Could not save the file — the JSON is in the text field above for copying.',
      'backup.shareCanceled': 'Sharing canceled, no file saved.',
      'workout.replaceConfirm': 'A workout is still running ({name}, {n} sets logged). Discard it and start a new one?',
      'err.saveFailed': 'Saving failed — is the storage full? Please free up space and try again.',
      'help.hold.t': 'Hold exercises (plank)',
      'help.hold.b': 'For the plank you pick the hold time before each set: 30 to 180 seconds, a custom time or "Max" as a stopwatch. It is pre-filled with the time you started last, otherwise the value from the plan. After "▶ Start" you get 5 seconds to get into position, then the hold timer runs. "Done →" ends early and logs the time held, "■ Stop" cancels without logging. "Log without timer" saves the chosen time directly, e.g. to correct a set.',
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
