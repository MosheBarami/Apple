import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { vaultPath, searchWiki } from '../../apple-os/vault.mjs';
import { collectBriefFacts, latestBrief, runBrief } from '../../apple-os/brief.mjs';
import { SKILLS } from '../../apple-os/skills.mjs';
import { voiceStatus } from '../../apple-os/voice.mjs';
import { routeRequest } from '../../apple-os/route.mjs';
import { latestDiscovery } from '../../apple-os/discover.mjs';

const OPEN_JEV_URL = 'http://127.0.0.1:4778';

export async function os() {
  const root = vaultPath();
  const latest = latestBrief(root);
  let openJevReady = false;
  try {
    const response = await fetch(`${OPEN_JEV_URL}/health`, { signal: AbortSignal.timeout(700) });
    openJevReady = response.ok && (await response.json()).model === 'com-kotobalabs/open-jev-deberta-v3-large';
  } catch { /* An unavailable local model must not make the dashboard unavailable. */ }
  return { ok: true, fetchedAt: new Date().toISOString(), vault: { path: root, exists: existsSync(join(root, 'wiki/index.md')) },
    facts: collectBriefFacts(), brief: latest && { path: latest.path, text: latest.text.slice(0, 5000) },
    skills: SKILLS, discovery: latestDiscovery(root), voice: voiceStatus(), jevConfigured: Boolean(process.env.TYPESAFE_API_KEY),
    openJev: { model: 'com-kotobalabs/open-jev-deberta-v3-large',
      installed: existsSync(join(root, 'runtime/open-jev-model/model.safetensors')), ready: openJevReady, hosting: 'local', language: 'en' } };
}

export async function osAction(body) {
  if (body?.kind === 'route') {
    const text = String(body.text ?? '').trim();
    if (!text || text.length > 4000) return { ok: false, reason: 'הבקשה צריכה להכיל 1–4000 תווים' };
    const decision = await routeRequest(text, { apiKey: body.useJev === 'typesafe' ? process.env.TYPESAFE_API_KEY : null,
      openJevUrl: body.useJev === 'hf' ? OPEN_JEV_URL : null });
    let execution = null;
    if (body.executeExact === true && decision.tier === 1) {
      if (decision.handler === 'latest-brief') {
        const brief = latestBrief();
        execution = brief ? { kind: 'brief', path: brief.path, text: brief.text.slice(0, 5000) }
          : { kind: 'brief', message: 'עדיין אין דוח. הכינו דוח בעלים מהכפתור בהמשך הדף.' };
      } else if (decision.handler === 'training-status') {
        execution = { kind: 'training', training: collectBriefFacts().training };
      }
    }
    return { ok: true, decision, execution, sentToJev: decision.modelAttempted === true };
  }
  if (body?.kind === 'search') {
    const query = String(body.query ?? '').trim();
    if (!query || query.length > 200) return { ok: false, reason: 'החיפוש צריך להכיל 1–200 תווים' };
    return { ok: true, hits: searchWiki(query) };
  }
  if (body?.kind !== 'brief') return { ok: false, reason: 'פעולה לא מוכרת' };
  if (body.dryRun === true) return { ok: true, dryRun: true, plan: { action: 'write owner brief to private Apple OS vault' } };
  const result = runBrief();
  return { ok: true, path: result.path, fetchedAt: new Date().toISOString() };
}
