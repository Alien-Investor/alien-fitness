// make_shots.mjs — Screenshots für den Alien-Fitness-App-Trailer (DE + EN), 412×880 bei 3×.
// Demo-Daten werden über die App-API/LocalData geseedet (kein echtes Trainingsprofil).
//   cd .. && node apk/serve-test.mjs &   →   cd trailer && node make_shots.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('/home/alien/.npm/_npx/9833c18b2d85bc59/node_modules/');
const { chromium } = require('playwright-core');
const out = new URL('./shots/', import.meta.url).pathname; mkdirSync(out, { recursive: true });
const URL0 = 'http://127.0.0.1:3009/';
const b = await chromium.launch({ executablePath: '/usr/bin/brave-browser', headless: true, args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 412, height: 880 }, deviceScaleFactor: 3 });
const p = await ctx.newPage(); p.on('dialog', d => d.accept());
const shot = async (name) => { await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(350); await p.screenshot({ path: `${out}/${name}.png` }); console.log('  ✓', name); };

await p.goto(URL0, { waitUntil: 'networkidle' });
await p.evaluate(() => window.LocalData.ready);

// ── Demo-Daten seeden (frischer Stand, keine echten Trainingsdaten) ──────────────
await p.evaluate(async () => {
  await window.LocalData.importAll({ format: 'alien-fitness-backup', sessions: [], sets: [], custom_plans: [] }, {});
  // Kurzhantel Bankdrücken (ex 2): steigende Kurve über 5 Trainings → Fortschritts-Chart
  const days = [26, 19, 12, 6, 1], w = [20, 22.5, 25, 25, 27.5];
  for (let i = 0; i < days.length; i++) {
    await window.api('sessions', { method: 'POST', body: JSON.stringify({
      plan_id: 1, started_at: new Date(Date.now() - days[i] * 86400000).toISOString(),
      finished_at: new Date(Date.now() - days[i] * 86400000 + 42 * 60000).toISOString(),
      notes: i === days.length - 1 ? 'Gut geschlafen, saubere Technik.' : null,
      sets: [
        { exercise_id: 2, set_number: 1, reps: 10, weight_kg: w[i], completed: 1 },
        { exercise_id: 2, set_number: 2, reps: 9, weight_kg: w[i], completed: 1 },
        { exercise_id: 1, set_number: 1, reps: 12, weight_kg: 0, completed: 1 },
      ] }) });
  }
  // ein eigener Plan für Dashboard/Editor
  await window.LocalData.savePlan({ name: 'Oberkörper A', type: 'strength', exercises: [
    { exercise_id: 2, sets: 4, reps: '6-8', rest_seconds: 120, sort_order: 0 },
    { exercise_id: 1, sets: 3, reps: '10-15', rest_seconds: 90, sort_order: 1 },
  ] });
  localStorage.removeItem('fit-active-workout');
});

async function series(lang) {
  // Dashboard (OFFLINE-Badge sichtbar, Statistik + Pläne)
  await p.click('[data-view="dashboard"]'); await p.evaluate(() => loadDashboard()); await p.waitForTimeout(400); await shot(`dash-${lang}`);

  // Plan-Editor (eigener Plan aus allen Übungen)
  await p.click('[data-view="workout"]'); await p.waitForTimeout(200);
  await p.click('#btn-new-plan'); await p.waitForSelector('#editor-overlay.open');
  await p.fill('#editor-name', lang === 'en' ? 'Upper body A' : 'Oberkörper A'); await p.waitForTimeout(200); await shot(`editor-${lang}`);
  await p.click('#editor-cancel'); await p.waitForTimeout(150);

  // Aktives Training mit geloggtem Satz (grün)
  await p.evaluate(() => startWorkout(1)); await p.waitForSelector('#set-0-1');
  await p.click('#set-0-1'); await p.waitForSelector('#set-modal-overlay.open');
  await p.fill('#input-reps', '10'); await p.fill('#input-weight', '27.5'); await p.click('#btn-save-set');
  await p.waitForSelector('#timer-overlay.open'); await p.click('#timer-skip'); await p.waitForTimeout(300); await shot(`workout-${lang}`);
  await p.click('#btn-abort');

  // HIT-Intervall: Arbeits-Timer (Tabata, Plan 4)
  await p.evaluate(() => startWorkout(4)); await p.waitForSelector('#set-0-1');
  await p.click('#set-0-1'); await p.waitForSelector('#timer-overlay.open.work'); await p.waitForTimeout(300); await shot(`timer-${lang}`);
  await p.click('#timer-stop'); await p.click('#btn-abort');

  // Fortschritts-Chart (Kurzhantel Bankdrücken)
  await p.click('[data-view="progress"]'); await p.evaluate(() => loadProgressView()); await p.waitForTimeout(300);
  await p.selectOption('#progress-exercise-select', '2'); await p.waitForTimeout(700); await shot(`progress-${lang}`);

  // Übungsbibliothek
  await p.click('[data-view="library"]'); await p.evaluate(() => loadLibrary()); await p.waitForTimeout(500); await shot(`library-${lang}`);

  // Historie (mit Notiz-Vorschau)
  await p.click('[data-view="history"]'); await p.evaluate(() => loadHistory()); await p.waitForTimeout(400);
  await p.evaluate(() => window.scrollTo(0, 0)); await shot(`history-${lang}`);

  // Backup-Panel (Import-Modus)
  await p.evaluate(() => { const el = document.getElementById('backup-panel'); if (el) el.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(400); await shot(`backup-${lang}`);
  await p.evaluate(() => window.scrollTo(0, 0));
}

await series('de');
await p.click('#lang-toggle'); await p.waitForTimeout(400);
await series('en');
await b.close(); console.log('→', out);
