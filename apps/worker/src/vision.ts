// Visual critique: the loop that makes Golem LOOK at what it built.
//
// The failure this exists to stop: an agent inspects object properties, sees that every requested
// part exists, and reports success — while the scene is a grey slab with coloured poles on it.
// Properties cannot tell you a scene is ugly. Pixels can.
//
// Flow: plugin rasterises the scene -> packed RGB over the op bridge -> PNG here -> GLM-5.3-flash
// vision -> structured critique with named defects -> the agent edits and renders again.
import type { Env } from './env';
import type { RenderViewResult, RenderedView } from '@golem/shared';
import { renderShowsTerrain, TERRAIN_BLIND_NOTE } from '@golem/shared';
import { chat } from './gateway';
import { rgbBase64ToDataUrl, decodeRgbBase64 } from './png';
import { pixelStats, pixelHardFails, statsLine, type ViewStats } from './pixel-stats';
import {
  compositionMetrics,
  compositionHardFails,
  compositionLine,
  structureFromLayout,
  structureLine,
} from './composition';
import { analyseLayout } from './layout';
import { ROBLOX_DEFAULT_LIGHTING as DEFAULT_LIGHTING } from './roblox-defaults';

/** At most this many frames go to the model in one critique — each image costs input tokens. */
const MAX_FRAMES = 3;

export interface VisualDefect {
  /** which view it was seen in, so the agent can re-render the same angle to confirm a fix */
  view: string;
  dimension: 'composition' | 'proportion' | 'materials' | 'colour' | 'lighting' | 'detail' | 'ground' | 'fidelity';
  severity: 'blocking' | 'major' | 'minor';
  observed: string;
  fix: string;
}

export interface VisualCritique {
  /** 0-10, where a bare platform with primitives standing on it is a 2. null = not judged. */
  score: number | null;
  passed: boolean;
  /** true when the model's verdict could not be read — a tooling fault, NOT a bad scene */
  unavailable?: boolean;
  summary: string;
  defects: VisualDefect[];
  /** rules tripped by measured structure, independent of the model's opinion */
  hardFails: string[];
  neurons: number;
}

const CRITIQUE_SCHEMA = {
  name: 'visual_critique',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['score', 'summary', 'defects'],
    properties: {
      score: { type: 'integer', minimum: 0, maximum: 10 },
      summary: { type: 'string', maxLength: 400 },
      defects: {
        type: 'array',
        // Kept short on purpose: a long list overruns the output budget and the JSON arrives
        // truncated. The agent can only act on a few defects per pass anyway.
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['view', 'dimension', 'severity', 'observed', 'fix'],
          properties: {
            view: { type: 'string' },
            dimension: {
              type: 'string',
              enum: ['composition', 'proportion', 'materials', 'colour', 'lighting', 'detail', 'ground', 'fidelity'],
            },
            severity: { type: 'string', enum: ['blocking', 'major', 'minor'] },
            observed: { type: 'string', maxLength: 240 },
            fix: { type: 'string', maxLength: 240 },
          },
        },
      },
    },
  },
} as const;

const CRITIC_PROMPT = `You are a senior Roblox environment artist reviewing a scene a junior built. You are looking at ACTUAL RENDERS of that scene from several camera angles, plus measured statistics.

Judge only what you can SEE in the images. Never infer quality from the statistics.

The failure you exist to catch: every requested object is present, so the builder declares success, but the result is a flat grey slab with brightly coloured boxes and cylinders standing on it. That is a 2, not a 7. Object presence is not quality.

A deliberately stylised classic-Roblox look (bright SmoothPlastic, saturated colour zones, chunky oversized props) is a legitimate style, not programmer art, when it is applied consistently with volume, trim and set dressing. Judge it on those, never on its lack of realistic textures.

Score 0-10 on what a player would actually experience:
  0-2  programmer art: flat ground, primitives as props, arbitrary saturated colours, one material, no lighting
  3-4  recognisable but crude: right objects, wrong proportions, no detail, no composition
  5-6  competent: coherent palette and materials, some detail, readable layout, but flat or generic
  7-8  good: clear focal point, considered proportions, layered detail, real material and lighting language
  9-10 professional: art-directed, memorable silhouette, atmosphere, nothing reads as a placeholder

For each defect name the VIEW you saw it in, state what you actually observe, and give a specific buildable fix with real numbers where you can ("add a 0.4-stud trim around the platform edge", not "improve the edges").

IMPORTANT — how these images were made. They come from a diagnostic rasteriser, not from the Roblox engine. It draws ONE fixed sun with flat shading and NO shadows, NO PointLights, NO Neon glow, NO atmosphere and NO post-processing. Everything therefore looks evenly lit and shadowless in every scene, however well it was actually lit.
- Do NOT judge lighting, shadow, glow or atmosphere from the images. You cannot see them.
- Judge lighting ONLY from the reported lighting configuration given with the statistics.
- "There are no shadows" and "the lamps emit no light" are properties of the renderer. Reporting them is a false finding — do not.
Judge from the pixels: composition, massing, proportion, silhouette, spacing, layout, detail density, edge treatment, colour palette and material variety.

Be blunt. A generous score on a bad scene is the failure mode here, not rudeness.`;

/**
 * Read the critique JSON back, tolerating a response cut off by the output budget. Truncation is
 * the realistic failure here — the model writes valid JSON and simply runs out of room mid-array —
 * so a salvaged partial critique is far more useful than discarding the whole call. Returns null
 * only when nothing usable survives.
 */
function parseCritique(text: string): { score?: number; summary?: string; defects?: VisualDefect[] } | null {
  const body = text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(body);
  } catch {
    /* fall through to salvage */
  }
  // Close the JSON by dropping the incomplete trailing object and balancing brackets.
  const lastComplete = body.lastIndexOf('},');
  const head = lastComplete > 0 ? body.slice(0, lastComplete + 1) : body;
  for (const tail of [']}', '}]}', '}', ']']) {
    try {
      const v = JSON.parse(head + tail);
      if (v && typeof v === 'object') return v;
    } catch {
      /* try the next closing shape */
    }
  }
  // Last resort: pull the score and summary out directly, so a verdict still reaches the agent.
  const score = /"score"\s*:\s*(\d+)/.exec(body);
  const summary = /"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(body);
  if (score || summary) {
    return {
      score: score ? Number(score[1]) : undefined,
      summary: summary ? summary[1]!.replace(/\\"/g, '"') : undefined,
      defects: [],
    };
  }
  return null;
}

// The defaults live in ONE place. This file used to carry its own copy, and a second — written
// later, with different numbers — appeared in critic-input.ts. Both answered the same question,
// "has anyone lit this scene?", so the product could give two answers about one scene.

function lightingSummary(l: RenderViewResult['lighting']): string {
  if (!l) return 'not reported — treat lighting as unknown and do not score it.';
  const touched =
    Math.abs(l.brightness - DEFAULT_LIGHTING.brightness) > 0.01 ||
    Math.abs(l.clockTime - DEFAULT_LIGHTING.clockTime) > 0.01 ||
    l.ambient.some((v) => v !== 0) ||
    !!l.exposureCompensation ||
    l.lightInstances > 0 ||
    l.effects.length > 0;
  return [
    `Brightness ${l.brightness}, ClockTime ${l.clockTime}, Ambient rgb(${l.ambient.join(',')})`,
    l.outdoorAmbient ? `OutdoorAmbient rgb(${l.outdoorAmbient.join(',')})` : '',
    l.exposureCompensation != null ? `ExposureCompensation ${l.exposureCompensation}` : '',
    `${l.lightInstances} light instance(s) placed in the scene`,
    `Effects under Lighting: ${l.effects.length ? l.effects.join(', ') : 'none'}`,
    touched ? '' : 'NOTE: every value above is the Roblox default — no lighting pass was done.',
  ]
    .filter(Boolean)
    .join('. ');
}

/**
 * What is being judged. A single prop and a whole place fail in different ways, and judging a lamp
 * post against scene criteria produces true-but-useless findings — "it stands on a plain slab" is a
 * fact about the baseplate, not about the lamp. Measured: three successive lamp builds improved
 * materially (86 -> 83 -> 94 parts, richer material sets) and all scored 5, because scene criteria
 * dominated the score and could not be satisfied by any single object.
 */
export type SubjectKind = 'prop' | 'scene';

/** Guess from what was rendered: one compact object under a small footprint is a prop. */
export function inferSubject(result: RenderViewResult): SubjectKind {
  const [x, , z] = result.boundsSize;
  const visible = Math.max(0, ...result.views.map((v) => v.meta.partsVisible));
  return Math.max(x, z) <= 16 && visible <= 160 ? 'prop' : 'scene';
}

const SUBJECT_RULES: Record<SubjectKind, string> = {
  prop:
    'YOU ARE JUDGING A SINGLE OBJECT, not a place. Judge its silhouette, proportion, construction, ' +
    'ornament, material language and colour. Do NOT mark it down for what surrounds it: the ground ' +
    'it stands on, empty space around it, missing scenery, framing, or the scene\'s lighting rig are ' +
    'not its faults. A well-made object on a bare baseplate is a well-made object. Score 7+ when the ' +
    'object itself is well-proportioned, properly detailed and would not look out of place in a ' +
    'commercial game.',
  scene:
    'YOU ARE JUDGING A WHOLE PLACE. Composition, focal hierarchy, ground treatment, spatial flow, ' +
    'negative space and lighting are all in scope, alongside the quality of the individual objects.',
};

function statsFor(v: RenderedView): string {
  const mats = v.meta.materials
    .slice(0, 6)
    .map((m) => `${m.material}x${m.parts}`)
    .join(' ');
  return `${v.name}: ${v.meta.partsVisible} parts in frame (${v.meta.partsOffCamera} off-camera), covering ${Math.round(v.meta.subjectCoverage * 100)}% of the frame, ${v.meta.distinctColours} distinct colours, materials [${mats || 'none'}]`;
}

/**
 * Checks computed from measurement, not opinion. A model asked to score a picture will sometimes
 * be generous; these rules cannot be. Any hard fail caps the score regardless of what it says.
 */
export function hardFailChecks(result: RenderViewResult, subject: SubjectKind = 'scene'): string[] {
  const fails: string[] = [];
  if (!result.views.length) return ['nothing was rendered'];

  const merged = new Map<string, number>();
  let colours = 0;
  let visible = 0;
  for (const v of result.views) {
    for (const m of v.meta.materials) merged.set(m.material, (merged.get(m.material) ?? 0) + m.parts);
    colours = Math.max(colours, v.meta.distinctColours);
    visible = Math.max(visible, v.meta.partsVisible);
  }

  if (visible === 0) fails.push('no geometry visible from any camera — the scene is empty or badly mis-framed');
  if (merged.size === 1) {
    fails.push(`only one material used (${[...merged.keys()][0]}) — a scene needs a material language, not one surface everywhere`);
  }
  // Plastic everywhere is the signature of parts that were created and never art-directed — when the
  // colour was left alone too. Plastic in four or more chosen colours is the classic stylised Roblox
  // look (docs/ROBLOX-STYLE-SPEC.md), a decision rather than a default (F-059).
  const plastic = (merged.get('Plastic') ?? 0) + (merged.get('SmoothPlastic') ?? 0);
  const total = [...merged.values()].reduce((a, b) => a + b, 0);
  if (total >= 6 && plastic / total > 0.9 && colours <= 3) {
    fails.push('over 90% of parts are Plastic in 3 colours or fewer — no material or colour pass was done');
  }
  if (visible >= 6 && colours <= 1) fails.push('the whole scene is one colour — no palette was chosen');
  // Lighting is checked from PROPERTIES, never from the render — the rasteriser cannot draw it.
  const l = result.lighting;
  if (l && l.lightInstances === 0 && !l.effects.length && l.brightness === 3 && l.clockTime === 14.5) {
    fails.push('Lighting is entirely untouched (default Brightness 3, ClockTime 14.5, no lights, no Atmosphere) — no lighting pass was done');
  }
  const cover = Math.max(...result.views.map((v) => v.meta.subjectCoverage));
  if (cover < 0.04) fails.push('the subject fills under 4% of every frame — far too sparse, or badly placed');
  // The lighting hard-fail is a SCENE requirement. A single prop is not responsible for the
  // place's lighting rig, and failing it for that punishes the wrong thing.
  if (subject === 'prop') return fails.filter((f) => !f.startsWith('Lighting is entirely untouched'));
  return fails;
}

/** Turn rendered views into a critique. Only the first MAX_FRAMES views reach the model. */
export async function critiqueViews(
  env: Env,
  result: RenderViewResult,
  intent: string,
  opts: { passThreshold?: number; subject?: SubjectKind } = {},
): Promise<VisualCritique> {
  const threshold = opts.passThreshold ?? 6;
  const subject = opts.subject ?? inferSubject(result);
  const frames = result.views.slice(0, MAX_FRAMES);

  // Measure the PIXELS, not just the scene properties. Every property check can pass on a scene
  // that renders as a flat grey plate — measured on a 725-part plaza with 10 materials and 5
  // lights whose plan view was a single uniform tone. These statistics cost nothing: the buffer is
  // already decoded on the way to PNG.
  const decoded = result.views.map((v) => ({ view: v, rgb: decodeRgbBase64(v.rgbBase64) }));
  const viewStats: ViewStats[] = decoded.map(({ view, rgb }) => ({
    name: view.name,
    coverage: view.meta.subjectCoverage,
    stats: pixelStats(rgb, view.meta.width, view.meta.height),
  }));

  // Composition: the statistics that survived calibration against a blind jury. These do two things
  // the whole-frame statistics above cannot. First, they are restricted to the GEOMETRY MASK, so
  // sky and ground stop diluting them — the same grey slab reads colourfulness 46.2 whole-frame and
  // 1.7 masked, which is the difference between a check that never fires and one that does. Second,
  // the structural half needs no image at all, so a bad macro composition can be rejected before any
  // detail is paid for. docs/COMPOSITION.md carries the measured separations and the rejected
  // candidates.
  const composition = decoded.map(({ view, rgb }) => ({
    name: view.name,
    metrics: compositionMetrics(rgb, view.meta.width, view.meta.height),
  }));
  const structure = structureFromLayout(result.layout?.parts);

  // Composition is a question about PLACEMENT, which pixels cannot answer once objects overlap.
  const layout = subject === 'scene' ? analyseLayout(result.layout, result.boundsSize) : null;
  const hardFails = [
    ...hardFailChecks(result, subject),
    ...pixelHardFails(viewStats),
    ...(structure ? compositionHardFails(structure, composition, subject) : []),
    ...(layout?.flags ?? []),
  ];

  const content: ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[] = [
    {
      type: 'text',
      text:
        `The builder was asked for: ${intent}\n\n` +
        `Subject: ${result.subject}, bounding box ${result.boundsSize.join(' x ')} studs.\n` +
        `Views attached in order: ${frames.map((f) => f.name).join(', ')}.\n` +
        frames.map(statsFor).join('\n') +
        `\n\nMEASURED FROM THE PIXELS (arithmetic over the actual image, not opinion):\n` +
        frames.map((f) => statsLine(f.name, viewStats.find((v) => v.name === f.name)!.stats)).join('\n') +
        `\n\nMEASURED COMPOSITION (geometry only — sky and ground excluded):\n` +
        frames.map((f) => compositionLine(f.name, composition.find((c) => c.name === f.name)!.metrics)).join('\n') +
        (structure ? `\nSTRUCTURE: ${structureLine(structure)}` : '') +
        (layout
          ? `\n\nMEASURED LAYOUT: ${layout.props} props over ${layout.structural} structural parts, nearest-neighbour spacing variation ${layout.neighbourSpacingCV}, grid-snap ${layout.latticeScore}, rotation variety ${layout.rotationEntropy}`
          : '') +
        `\n\nLIGHTING CONFIGURATION (judge lighting from this, never from the images):\n${lightingSummary(result.lighting)}` +
        (hardFails.length ? `\n\nAlready confirmed by measurement: ${hardFails.join('; ')}` : ''),
    },
  ];
  for (const f of frames) {
    content.push({
      type: 'image_url',
      image_url: { url: await rgbBase64ToDataUrl(f.rgbBase64, f.meta.width, f.meta.height) },
    });
  }

  const res = await chat(
    env,
    {
      model: 'vision',
      messages: [
        { role: 'system', content: CRITIC_PROMPT + '\n\n' + SUBJECT_RULES[subject] + (renderShowsTerrain(result) ? '' : '\n\n' + TERRAIN_BLIND_NOTE) },
        { role: 'user', content },
      ],
      jsonSchema: CRITIQUE_SCHEMA,
      // Visual judgement is exactly what the adaptive policy reserves thinking for: a snap answer
      // here produces flattery, and flattery is what shipped the scene the owner rejected.
      // `high`, never `medium` — measured, `medium` spends the whole output budget on reasoning
      // and returns an empty string. See the table in reasoning.ts.
      reasoningEffort: 'high',
      maxTokens: 2000,
    },
    { kind: 'visual:critique', cacheTtl: 0 },
  );

  const parsed = parseCritique(res.text);
  if (!parsed) {
    // A parse failure is NOT a bad scene. Scoring it 0 would send the agent off "fixing" work that
    // may be fine, and would let a tooling fault masquerade as a quality verdict. Say so instead:
    // measured hard failures still stand, because those come from geometry, not from the model.
    return {
      score: null,
      passed: false,
      unavailable: true,
      summary: 'The critique could not be read back from the model, so the scene has not been judged. Measured checks below still apply.',
      defects: [],
      hardFails,
      neurons: res.neurons,
    };
  }

  // A hard fail caps the score at 3 however kind the model was: these come from measurement.
  const raw = Math.max(0, Math.min(10, Math.round(parsed.score ?? 0)));
  const score = hardFails.length ? Math.min(raw, 3) : raw;

  return {
    score,
    passed: score >= threshold && hardFails.length === 0,
    summary: parsed.summary ?? '',
    defects: Array.isArray(parsed.defects) ? parsed.defects : [],
    hardFails,
    neurons: res.neurons,
  };
}

/** Compact rendering of a critique for the agent transcript — kept small on purpose. */
export function critiqueToText(c: VisualCritique): string {
  const lines = [
    c.unavailable
      ? 'Visual critique UNAVAILABLE — the scene was rendered but not judged. Treat this as "unknown", not as a failure.'
      : `Visual score ${c.score}/10 — ${c.passed ? 'PASSES the quality gate' : 'FAILS the quality gate'}.`,
  ];
  if (c.summary) lines.push(c.summary);
  if (c.hardFails.length) lines.push(`Measured hard failures: ${c.hardFails.join('; ')}`);
  if (c.defects.length) {
    lines.push('Defects observed in the renders:');
    for (const d of c.defects) lines.push(`- [${d.severity}/${d.dimension}, in ${d.view}] ${d.observed} -> ${d.fix}`);
  }
  if (!c.passed && !c.unavailable) {
    lines.push('Fix the blocking and major defects, render again, and re-check. Do not report success until this passes.');
  }
  return lines.join('\n');
}
