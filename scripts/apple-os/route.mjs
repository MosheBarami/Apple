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

const OPEN_JEV_OPTIONS = [
  'Answer from known project evidence; no tools or changes',
  'Needs investigation, coding, testing, deployment, or tool use',
];

export async function routeRequest(text, { apiKey = process.env.TYPESAFE_API_KEY,
  openJevUrl = process.env.APPLE_OS_OPEN_JEV_URL, fetchImpl = fetch } = {}) {
  const local = localRoute(text);
  if (local.tier === 1 || (!apiKey && !openJevUrl)) return local;
  // This independent Hugging Face model is English-only. A Hebrew owner request stays local.
  if (!apiKey && /[\u0590-\u05ff]/u.test(String(text))) return { ...local, fallback: 'open-jev-english-only' };
  const useOpen = !apiKey && Boolean(openJevUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), useOpen ? 30000 : 5000);
  try {
    const response = await fetchImpl(useOpen ? `${openJevUrl}/decide` : 'https://api.typesafe.ai/v1/systemone', {
      method: 'POST', signal: controller.signal,
      headers: useOpen ? { 'content-type': 'application/json' } : { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: useOpen ? JSON.stringify({ state: String(text).slice(0, 4000), question: 'What kind of help does this Apple project owner request need?',
        options: OPEN_JEV_OPTIONS }) : JSON.stringify({ state: String(text).slice(0, 4000), model: 'jev-latest', questions: {
        tier: { type: 'choice', instructions: 'For this Apple project owner request, choose the required execution tier.', criteria: {
          answer: 'Question or summary that needs a concise answer from project evidence but no filesystem or external change.',
          agent: 'Implementation, investigation, testing, deployment, or any multi-step work that needs Codex tools.',
        } },
      } }),
    });
    const provider = useOpen ? 'hf-open-jev' : 'jev';
    if (!response.ok) return { ...local, modelAttempted: true, fallback: `${provider}-http-${response.status}` };
    const payload = await response.json();
    const answer = useOpen ? payload?.answer : payload?.answers?.tier;
    const choice = useOpen ? (answer?.choice === OPEN_JEV_OPTIONS[0] ? 'answer'
      : answer?.choice === OPEN_JEV_OPTIONS[1] ? 'agent' : null) : answer?.choice;
    if ((!useOpen && answer?.type !== 'choice') || !['answer', 'agent'].includes(choice) ||
        !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1)
      return { ...local, modelAttempted: true, fallback: `${provider}-low-or-invalid-confidence` };
    if (useOpen) return { ...local, modelAttempted: true, modelSuggestion: {
      tier: choice === 'agent' ? 3 : 2, confidence: answer.confidence, model: 'com-kotobalabs/open-jev-deberta-v3-large',
    } };
    if (answer.confidence < 0.7) return { ...local, modelAttempted: true, fallback: 'jev-low-or-invalid-confidence' };
    // Jev can raise an answer to tool work. It cannot downgrade a locally detected write request.
    if (local.tier === 3 && choice === 'answer') return { ...local, modelAttempted: true, fallback: 'write-rule-overrides-jev' };
    return { tier: choice === 'agent' ? 3 : 2, handler: choice === 'agent' ? 'codex-agent' : 'agent-answer',
      source: provider, confidence: answer.confidence, modelAttempted: true };
  } catch { return { ...local, modelAttempted: true, fallback: useOpen ? 'hf-open-jev-unavailable' : 'jev-unavailable' }; }
  finally { clearTimeout(timer); }
}
