// Hugging Face action specs beyond the shell's hfx (restart / pause live in control/actions.js).
// rebuild = the Hub's "factory reboot": the same code rebuilt without the build cache. Nothing is
// deleted, and hardware, visibility and billing are untouched.
const PATH = '/api/cc/hf/action';
const name = (s) => String(s.id).split('/')[1] || s.id;

export const hfRebuild = (s) => ({
  id: `hf-rebuild-${s.id}`, platform: 'huggingface', label: `בנייה מחדש מאפס: ${name(s)}`, hint: `Space · ${s.runtimeStage || ''}`,
  title: 'לבנות את ה-Space מחדש מאפס?',
  what: `Hugging Face יבנה את ${s.id} מחדש מהקוד שבמאגר, בלי המטמון של הבנייה הקודמת, ויפעיל אותו. הקוד, הקבצים, הסודות והחומרה לא משתנים. בזמן הבנייה (כמה דקות) ה-Space לא עונה.`,
  undo: 'אין מה לבטל: זו בנייה של אותו קוד בדיוק. אם משהו נשבר, הבעיה בקוד ולא בבנייה.',
  path: PATH, body: { kind: 'rebuild', id: s.id }, okMsg: 'ה-Space נשלח לבנייה מחדש מאפס.',
});

// A Space with no app file has nothing to build, so a rebuild is not offered for it.
export const canRebuild = (s) => !!s?.id && s.runtimeStage !== 'NO_APP_FILE';

export function catalog(seen = {}) {
  const sp = Array.isArray(seen.hf?.spaces) ? seen.hf.spaces : [];
  return sp.filter(canRebuild).map(hfRebuild);
}
