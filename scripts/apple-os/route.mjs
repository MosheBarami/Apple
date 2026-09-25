// A narrow three-tier router for the owner's local Apple OS. A classification never authorizes a write.
const DIRECT = [
  { re: /^(?:show|open|bring up|הצג|פתח|תראה)(?: לי)? (?:the )?(?:latest |האחרון |את )?(?:owner |apple )?(?:brief|report|דוח|סיכום)(?: (?:הבוקר|היומי))?$/i, action: 'latest-brief' },
  { re: /^(?:הצג|פתח|תראה)(?: לי)? (?:את )?(?:דוח|סיכום)(?: הבעלים| Apple)?(?: האחרון| היומי)?$/u, action: 'latest-brief' },
  { re: /^(?:show|open|הצג|פתח)(?: לי)? (?:the )?(?:training|אימון)(?: (?:status|מצב))?$/i, action: 'training-status' },
  { re: /^(?:הצג|פתח)(?: לי)? (?:את )?מצב (?:האימון|אימון)$/u, action: 'training-status' },
];
const WRITE = /\b(?:build|implement|edit|fix|deploy|publish|release|create|change|delete|commit|push|install|run|test)\b|(?:בנה|תבנה|תקן|ערוך|שנה|פרוס|פרסם|מחק|הרץ|בדוק|התקן)/i;

export function directAction(text) {
  return DIRECT.find(({ re }) => re.test(String(text).trim()))?.action ?? null;
}

export function localRoute(text) {
  const request = String(text).trim();
  if (!request) throw new Error('request is empty');
  const action = directAction(request);
  if (action) return { tier: 1, handler: action, source: 'exact-local-command', confidence: 1 };
  if (WRITE.test(request)) return { tier: 3, handler: 'codex-agent', source: 'conservative-local-rule', confidence: null };
  return { tier: 2, handler: 'agent-answer', source: 'conservative-local-rule', confidence: null };
}

export async function routeRequest(text, { apiKey = process.env.TYPESAFE_API_KEY, fetchImpl = fetch } = {}) {
  const local = localRoute(text);
  if (local.tier === 1 || !apiKey) return local;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchImpl('https://api.typesafe.ai/v1/systemone', {
      method: 'POST', signal: controller.signal,
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ state: String(text).slice(0, 4000), model: 'jev-latest', questions: {
        tier: { type: 'choice', instructions: 'For this Apple project owner request, choose the required execution tier.', criteria: {
          answer: 'Question or summary that needs a concise answer from project evidence but no filesystem or external change.',
          agent: 'Implementation, investigation, testing, deployment, or any multi-step work that needs Codex tools.',
        } },
      } }),
    });
    if (!response.ok) return { ...local, fallback: `jev-http-${response.status}` };
    const answer = (await response.json())?.answers?.tier;
    if (answer?.type !== 'choice' || !['answer', 'agent'].includes(answer.choice) ||
        !Number.isFinite(answer.confidence) || answer.confidence < 0.7) return { ...local, fallback: 'jev-low-or-invalid-confidence' };
    // Jev can raise an answer to tool work. It cannot downgrade a locally detected write request.
    if (local.tier === 3 && answer.choice === 'answer') return { ...local, fallback: 'write-rule-overrides-jev' };
    return { tier: answer.choice === 'agent' ? 3 : 2, handler: answer.choice === 'agent' ? 'codex-agent' : 'agent-answer',
      source: 'jev', confidence: answer.confidence };
  } catch { return { ...local, fallback: 'jev-unavailable' }; }
  finally { clearTimeout(timer); }
}
