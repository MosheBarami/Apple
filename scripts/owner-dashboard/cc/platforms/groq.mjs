// Groq: which models the key can call (GET /openai/v1/models is free and has no side effects).
import { fetchJson, cached, ok, fail } from '../http.mjs';

export function groq() {
  if (!process.env.GROQ_API_KEY) return Promise.resolve(ok({ configured: false, need: ['GROQ_API_KEY'] }));
  return cached('groq', async () => {
    try {
      const j = await fetchJson('https://api.groq.com/openai/v1/models', { label: 'Groq', what: 'רשימת המודלים',
        headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}` } });
      const models = (Array.isArray(j?.data) ? j.data : []).map((m) => ({ id: String(m.id), owner: m.owned_by ?? null, active: m.active !== false,
        context: m.context_window ?? null, maxOut: m.max_completion_tokens ?? null, created: m.created ?? null }))
        .sort((a, b) => (b.context || 0) - (a.context || 0));
      return ok({ configured: true, models });
    } catch (e) { return fail(e?.reason || 'Groq לא זמין', { configured: true }); }
  }, 300000);
}
