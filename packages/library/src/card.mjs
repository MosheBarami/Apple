// The search card the build model sees (master plan §3.3): text only, never a picture. Pure.
const r = (n, d = 1) => (Number.isFinite(Number(n)) ? Number(Number(n).toFixed(d)) : undefined);

export function toCard(it) {
  return {
    id: it.id,
    title: it.title,
    kind: it.kind,
    family: it.family ?? null,
    theme: it.themes ?? [],
    size_studs: Array.isArray(it.size_studs) ? it.size_studs.map((v) => r(v)) : null,
    triangles: it.triangles ?? null,
    colours: it.colours ?? [],
    grade: it.grade,
    licence: it.licence_class,
    line: String(it.description ?? '').split(/(?<=\.)\s/)[0].slice(0, 140),
  };
}

/** One line per card for the model's context: compact and stable. */
export const cardLine = (c) => `${c.id} | ${c.title} | ${c.kind}${c.family ? ` | family ${c.family}` : ''} | grade ${c.grade}${c.size_studs ? ` | ${c.size_studs.join('x')} studs` : ''}${c.theme.length ? ` | ${c.theme.join(', ')}` : ''}${c.line ? ` | ${c.line}` : ''}`;
