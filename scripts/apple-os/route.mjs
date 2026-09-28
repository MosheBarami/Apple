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

export async function routeRequest(text) {
  return localRoute(text);
}
