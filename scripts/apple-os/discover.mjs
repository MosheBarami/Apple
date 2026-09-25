// Aggregate recurring Apple work from local Codex sessions. No prompt or transcript text is persisted.
import { createReadStream, existsSync, mkdirSync, readdirSync, writeFileSync, renameSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { vaultPath } from './vault.mjs';

const PATTERNS = Object.freeze({
  studio: /\b(?:studio|plugin|roblox|playtest)\b|סטודיו|פלאגין|רובלוקס/i,
  visual: /\b(?:visual|asset|ui|ux|texture|graphic|design)\b|עיצוב|חזות|גרפיקה|נכס/i,
  training: /\b(?:lora|training|train|eval|benchmark|model)\b|אימון|מודל|הערכה/i,
  release: /\b(?:deploy|release|publish|ci|github actions)\b|פריסה|שחרור|פרסם/i,
  security: /\b(?:security|rls|auth|secret|privacy|supabase)\b|אבטחה|סוד|הרשאה/i,
  owner: /\b(?:dashboard|brief|status|mission|autonomy|owner)\b|דוח|מצב|משימה|בעלים/i,
});

export async function discoverWorkflows({ sessionsRoot = join(homedir(), '.codex/sessions'), repo = '/Users/moshe/Desktop/RbxAI', days = 30, now = new Date() } = {}) {
  const since = now.getTime() - days * 86_400_000;
  const counts = Object.fromEntries(Object.keys(PATTERNS).map((k) => [k, 0]));
  let sessions = 0, requests = 0;
  if (!existsSync(sessionsRoot)) return { analysedAt: now.toISOString(), days, sessions, requests, counts };
  for (const year of readdirSync(sessionsRoot).filter((x) => /^\d{4}$/.test(x))) {
    const y = join(sessionsRoot, year);
    for (const month of readdirSync(y).filter((x) => /^\d{2}$/.test(x))) {
      const m = join(y, month);
      for (const day of readdirSync(m).filter((x) => /^\d{2}$/.test(x))) {
        const date = new Date(`${year}-${month}-${day}T23:59:59Z`).getTime();
        if (!Number.isFinite(date) || date < since) continue;
        for (const file of readdirSync(join(m, day)).filter((x) => x.endsWith('.jsonl'))) {
          const seen = new Set();
          let relevant = false, localRequests = 0;
          const lines = createInterface({ input: createReadStream(join(m, day, file), { encoding: 'utf8' }), crlfDelay: Infinity });
          for await (const line of lines) {
            let row; try { row = JSON.parse(line); } catch { continue; }
            if (row.type === 'session_meta') {
              const cwd = row.payload?.cwd || '';
              relevant = cwd === repo || cwd.startsWith(`${repo}/`) || cwd.includes('/RbxAI/.claude/worktrees/');
              continue;
            }
            if (!relevant || row.type !== 'response_item' || row.payload?.role !== 'user') continue;
            // The app also places AGENTS.md, plugin recommendations and environment context in
            // user-role records. They are not owner requests and would dominate the counts.
            if (Array.isArray(row.payload?.internal_chat_message_metadata_passthrough?.content_item_kinds) &&
                row.payload.internal_chat_message_metadata_passthrough.content_item_kinds.length) continue;
            for (const item of row.payload.content || []) {
              if (item.type !== 'input_text' || typeof item.text !== 'string' || item.text.length > 4000) continue;
              requests++; localRequests++;
              for (const [name, pattern] of Object.entries(PATTERNS)) if (pattern.test(item.text)) seen.add(name);
            }
          }
          if (!relevant || localRequests === 0) continue;
          sessions++;
          for (const name of seen) counts[name]++;
        }
      }
    }
  }
  return { analysedAt: now.toISOString(), days, sessions, requests, counts,
    note: 'Counts are sessions mentioning each topic. No prompts, transcripts, secrets or commands were saved.' };
}

export function saveDiscovery(result, root = vaultPath()) {
  const dir = join(root, 'raw'); mkdirSync(dir, { recursive: true });
  const dest = join(dir, 'workflow-patterns.json'), temp = `${dest}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(result, null, 2)}\n`);
  renameSync(temp, dest);
  return dest;
}

export function latestDiscovery(root = vaultPath()) {
  try { return JSON.parse(readFileSync(join(root, 'raw/workflow-patterns.json'), 'utf8')); } catch { return null; }
}
