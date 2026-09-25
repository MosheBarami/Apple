/** A small, factual view of the local LoRA supervisor's state for the owner dashboard. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LABEL = {
  seed: 'נמדדה',
  started: 'התחילה, טרם נמדדה',
  done: 'נמדדה',
  eval_invalid: 'מדידה לא תקפה',
  eval_failed: 'הבדיקה נכשלה',
  truncated: 'האימון נקטע',
  stopped: 'נעצרה',
  timeout: 'הזמן המוקצב נגמר',
  template_failed: 'בדיקת ההכנה נכשלה',
  template_mismatch: 'תבנית השיחה לא תאמה',
  failed_training: 'האימון לא הושלם',
  error: 'אירעה תקלה',
};

function score(scores) {
  if (!scores) return null;
  const tracks = ['trajectory', 'gameLogic', 'finish'];
  if (tracks.some((key) => !Number.isInteger(scores[key]) || !Number.isInteger(scores.n?.[key])
    || scores[key] < 0 || scores[key] > scores.n[key] || scores.n[key] < 0)) return null;
  const passed = tracks.reduce((n, key) => n + scores[key], 0);
  const total = tracks.reduce((n, key) => n + scores.n[key], 0);
  return passed === scores.total && total > 0 ? { passed, total } : null;
}

export function trainingSnapshot(repo) {
  let state;
  try {
    state = JSON.parse(readFileSync(join(repo, 'packages/training/runs/forever/state.json'), 'utf8'));
  } catch { return null; }
  if (!Array.isArray(state?.history) || !Number.isInteger(state.best?.version)) return null;
  const bestEntry = state.history.find((row) => row?.version === state.best.version
    && (row.status === 'done' || row.status === 'seed') && row.promoted === true);
  const bestScore = score(state.best.scores);
  const recordedScore = score(bestEntry?.scores);
  const verifiedBest = bestScore && recordedScore && bestScore.passed === recordedScore.passed
    && bestScore.total === recordedScore.total ? bestScore : null;
  const versions = state.history
    .filter((row) => Number.isInteger(row?.version) && typeof row.status === 'string')
    .map((row) => {
      const measured = row.status === 'done' || row.status === 'seed' ? score(row.scores) : null;
      return {
        version: row.version,
        status: row.status,
        label: row.status === 'started' && typeof row.adapterPath === 'string' && row.adapterPath.length > 0
          && Number.isFinite(row.valLoss)
          ? 'האימון הסתיים, ציון בהמתנה'
          : LABEL[row.status] ?? 'מצב לא ידוע',
        passed: measured?.passed ?? null,
        total: measured?.total ?? null,
        promoted: row.promoted === true && row.status === 'done',
      };
    })
    .sort((a, b) => b.version - a.version);
  return { best: verifiedBest ? { version: state.best.version, ...verifiedBest } : null, versions };
}
