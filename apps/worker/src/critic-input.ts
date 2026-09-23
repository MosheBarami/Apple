// Turning a render into something the critic panel can judge.
//
// WHY THIS IS A SEPARATE FILE, AND WHY IT IS SMALL. `critic.ts` is 900 lines of lenses, rules,
// evidence gating and adjudication, and until now NONE of it shipped: the deployed worker bundle
// contained zero bytes of it, its only importer anywhere was a test, and the repository's own audit
// had said so twice without anything changing. A refuter proved it by bundling the deployed entry
// point and finding zero occurrences of `runCriticPanel` against a control of six for
// `inspect_visually`. Under §2.3 that is a dead end, not a feature.
//
// The thing that was missing was never the critic. It was the twenty lines that turn what the
// product actually has — a render result and a Lighting report — into a `CriticInput`.
//
// WHAT THIS DELIBERATELY DOES NOT DO. Five of the critic's eighteen metrics are pixel-derived and
// their semantics are DEFINED by the eval harness: `faceValueSpread` is implemented there, and
// `distantContrast` comes from a downsample whose resolution and masking would have to be inferred
// to reproduce. Inferring them would feed the critic confident wrong numbers, which is worse than a
// lens that honestly did not run — and since `applyMetricRules` now reports every rule it could not
// evaluate, "partial" is a state that can be REPORTED rather than one that has to be avoided.
//
// So this supplies exactly what the render genuinely knows, and the panel says what it could not
// check. A short defect list and a clean build stopped being the same sentence.
import type { RenderViewResult } from '@golem/shared';
import { renderShowsTerrain } from '@golem/shared';
import type { CriticInput } from './critic';
import { lightingIsDefault, lightingTouchedProperties } from './roblox-defaults';

// The defaults live in ONE place now. Two disagreeing tables in one worker — vision.ts said 3 and
// 14.5, this file said 2 and 14 — meant the two halves of the product could give opposite answers
// about whether the same scene had been lit. The pair here was the invented one.
export { lightingIsDefault, lightingTouchedProperties } from './roblox-defaults';

/**
 * Every metric a render can supply WITHOUT inference.
 *
 * Each entry below is read from something the plugin measured. A metric that would have to be
 * reconstructed is absent, and absent is the honest answer — the panel reports it as unchecked
 * rather than acting on a number nobody measured.
 */
export function metricsFromRender(result: RenderViewResult): Record<string, number> {
  const metrics: Record<string, number> = {};

  // The hero is what the critique is mostly about; fall back to whatever was rendered.
  const hero = result.views.find((v) => v.name === 'hero') ?? result.views[0];
  if (hero) {
    // The MAXIMUM across views, not the hero's alone: a part hidden behind another in one camera is
    // still a part, and taking one view's count would under-report the scene.
    metrics.partCount = Math.max(...result.views.map((v) => v.meta.partsVisible));
    metrics.distinctColours = Math.max(...result.views.map((v) => v.meta.distinctColours));

    const materials = new Set<string>();
    for (const v of result.views) for (const m of v.meta.materials) materials.add(m.material);
    metrics.distinctMaterials = materials.size;

    // Plastic is Roblox's default material. The share of parts still wearing it is the closest
    // thing the render knows to "no material decision was made here" — while the colour was left
    // alone too. In four or more chosen colours Plastic is the stylised classic-Roblox look, a
    // decision, so the metric is absent (unchecked) there rather than a false fail (F-059).
    const total = result.views.reduce((n, v) => n + v.meta.materials.reduce((s, m) => s + m.parts, 0), 0);
    const plastic = result.views.reduce(
      (n, v) => n + v.meta.materials.filter((m) => m.material === 'Plastic').reduce((s, m) => s + m.parts, 0),
      0,
    );
    if (total > 0 && metrics.distinctColours <= 3) metrics.factoryDefaultShare = plastic / total;
  }

  if (result.boundsSize) metrics.heightStuds = result.boundsSize[1];

  if (result.lighting) {
    // The count of Lighting properties that differ from the Roblox default.
    // `lightingConfigCriticisms` cites this, and it is not a MetricRule — which is why a lens can be
    // partial and still say the single most actionable thing about art direction.
    metrics.lightingTouchedProperties = lightingTouchedProperties(result.lighting);
  }

  return metrics;
}

/** The whole input, ready for `runCriticPanel`. */
export function criticInputFromRender(result: RenderViewResult, intent: string): CriticInput {
  return {
    intent,
    // `boundsSize` describes one object when the render targeted one; the workspace render is a
    // scene. The panel's rules differ between the two, so guessing wrong changes the verdict.
    subject: result.subject === 'Workspace' ? 'scene' : 'prop',
    views: result.views.map((v) => ({ name: v.name, width: v.meta.width, height: v.meta.height })),
    metrics: metricsFromRender(result),
    terrainInvisible: !renderShowsTerrain(result),
    lighting: result.lighting
      ? {
          brightness: result.lighting.brightness,
          clockTime: result.lighting.clockTime,
          ambient: result.lighting.ambient,
          lightInstances: result.lighting.lightInstances,
          effects: result.lighting.effects,
          isDefault: lightingIsDefault(result.lighting),
        }
      : undefined,
  };
}
