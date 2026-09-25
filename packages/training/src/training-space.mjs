/** Private Hugging Face Space snapshot. Rendering never runs model inference. */
const TRACKS = { trajectory: 23, gameLogic: 8, finish: 7 };
const TOTAL = 38;

function validScores(scores) {
  if (!scores || Object.entries(TRACKS).some(([track, n]) =>
    scores.n?.[track] !== n || !Number.isInteger(scores[track]) ||
    scores[track] < 0 || scores[track] > n)) throw new Error('track score outside the pinned range');
  if (scores.total !== Object.keys(TRACKS).reduce((sum, track) => sum + scores[track], 0)) {
    throw new Error('score total does not equal the track sum');
  }
}

export function renderTrainingSpace(snapshot, template) {
  const { version, previousVersion, scores, previousScores, measuredAt } = snapshot ?? {};
  if (!Number.isSafeInteger(version) || version < 1 ||
      !Number.isSafeInteger(previousVersion) || previousVersion < 1 || previousVersion >= version) {
    throw new Error('previous version must precede the promoted version');
  }
  validScores(scores);
  validScores(previousScores);
  const date = new Date(measuredAt);
  if (!Number.isFinite(date.getTime())) throw new Error('missing measurement date');
  if (typeof template !== 'string') throw new Error('missing Space template');
  const values = {
    DATE: new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'long' }).format(date),
    VERSION: version,
    PREVIOUS_VERSION: previousVersion,
    TOTAL: scores.total,
    PREVIOUS_TOTAL: previousScores.total,
    PERCENT: (100 * scores.total / TOTAL).toFixed(1),
    PREVIOUS_PERCENT: (100 * previousScores.total / TOTAL).toFixed(1),
    TRAJECTORY: scores.trajectory,
    GAME_LOGIC: scores.gameLogic,
    FINISH: scores.finish,
  };
  let html = template;
  for (const [key, value] of Object.entries(values)) {
    const marker = `{{${key}}}`;
    if (!html.includes(marker)) throw new Error(`Space template missing ${key}`);
    html = html.replaceAll(marker, String(value));
  }
  if (/{{[A-Z_]+}}/.test(html)) throw new Error('Space template has an unknown marker');
  return html;
}
