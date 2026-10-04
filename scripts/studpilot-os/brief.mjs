import { readFileSync, writeFileSync, renameSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { initVault, vaultPath } from './vault.mjs';

export const repoPath = resolve(import.meta.dirname, '../..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const safeText = (value, max = 160) => String(value ?? '').replace(/[\r\n|]/g, ' ').slice(0, max);
const KNOWN_NEXT_ACTION = 'Curate stronger rights-checked Roblox assets and UI kits, extend the visual choice to UI/VFX, then run a full Studio build, gameplay check and blind visual review; close F-059/F-064 only with live evidence.';
const nextActionForOwner = (value) => value === KNOWN_NEXT_ACTION
  ? 'לאסוף נכסי Roblox וערכות ממשק באיכות גבוהה עם זכויות שימוש מאומתות; להרחיב את בחירת העיצוב גם לממשק ולאפקטים. אחר כך לבנות משחק מלא ב־Studio, לבדוק משחקיות ולערוך ביקורת חזותית עיוורת. לסגור את F-059 ו־F-064 רק על סמך ראיות מהרצה חיה.'
  : safeText(value, 2000);
const command = (cmd, args, cwd = repoPath) => { try { return execFileSync(cmd, args, { cwd, encoding: 'utf8', timeout: 4000 }).trim(); } catch { return null; } };

function activeOwnerMission(repo) {
  const owner = join(homedir(), '.codex/skills/codex-owner/scripts/owner.py');
  if (!existsSync(owner)) return null;
  try {
    const status = JSON.parse(execFileSync('python3', [owner, '--cwd', repo, 'status'], { encoding: 'utf8', timeout: 4000 }));
    const mission = status?.mission;
    return mission?.status === 'active' && mission?.workspace === repo && typeof mission?.next_action === 'string' ? mission : null;
  } catch { return null; }
}

export function collectBriefFacts({ repo = repoPath, now = new Date() } = {}) {
  const acceptance = readJson(join(repo, 'docs/autonomy/ACCEPTANCE.json'));
  const gitSha = command('git', ['rev-parse', '--short', 'HEAD'], repo);
  const dirty = command('git', ['status', '--porcelain', '--untracked-files=no'], repo);
  const mission = activeOwnerMission(repo);
  const next = mission?.next_action || readFileSync(join(repo, 'docs/autonomy/NEXT_ACTION.md'), 'utf8').split('\n').find((s) => /^2026-/.test(s)) || '';
  return { measuredAt: now.toISOString(), gitSha, trackedChanges: dirty == null ? null : dirty.split('\n').filter(Boolean).length,
    acceptance: { reviews: acceptance.fresh_reviews_without_material_blocker, requiredReviews: acceptance.required_fresh_reviews_without_material_blocker,
      critical: acceptance.open_critical_findings, high: acceptance.open_high_findings, candidateComplete: acceptance.candidate_complete },
    nextAction: next.slice(0, 2000), nextActionSource: mission ? 'active codex-owner mission ledger' : 'docs/autonomy/NEXT_ACTION.md', sources: [
      'docs/autonomy/ACCEPTANCE.json', mission ? 'active codex-owner mission ledger' : 'docs/autonomy/NEXT_ACTION.md',
    ] };
}

export function renderBrief(f) {
  const a = f.acceptance;
  return `# דוח StudPilot OS — ${f.measuredAt}\n\n` +
    `## מצב קבלה\n\n- ביקורות עצמאיות: ${a.reviews}/${a.requiredReviews}.\n- ממצאים פתוחים: ${a.critical} קריטיים, ${a.high} גבוהים.\n- מועמד לסיום לפי החוזה: ${a.candidateComplete ? 'כן' : 'לא'}.\n\n` +
    `## הפעולה הבאה\n\n${nextActionForOwner(f.nextAction)}\n\n- מקור: ${f.nextActionSource === 'active codex-owner mission ledger' ? 'יומן משימת הבעלים הפעילה' : f.nextActionSource}.\n\n` +
    `## עקיבות\n\n- Git HEAD: ${f.gitSha || 'לא זמין'}; קבצים מנוהלים ששונו: ${f.trackedChanges ?? 'לא זמין'}.\n` +
    `- מקור חוזה: ${f.sources[0]}; פעולה: ${f.sources[1]}.\n` +
    `- הדוח הוא תמונת מצב מקומית בזמן הרשום, ולא בדיקת Studio או בדיקת אתר חי.\n`;
}

export function runBrief({ root = vaultPath(), repo = repoPath, now = new Date() } = {}) {
  initVault(root);
  const facts = collectBriefFacts({ repo, now });
  const name = `${now.toISOString().replace(/[:.]/g, '-')}-owner-brief.md`;
  const dest = join(root, 'outputs', name);
  const temp = `${dest}.tmp-${process.pid}`;
  writeFileSync(temp, renderBrief(facts), { flag: 'wx' });
  renameSync(temp, dest);
  return { path: dest, facts };
}

export function latestBrief(root = vaultPath()) {
  const dir = join(root, 'outputs');
  if (!existsSync(dir)) return null;
  const name = readdirSync(dir).filter((s) => s.endsWith('-owner-brief.md')).sort().at(-1);
  return name ? { path: join(dir, name), text: readFileSync(join(dir, name), 'utf8') } : null;
}
