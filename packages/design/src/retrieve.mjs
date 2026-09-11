// retrieve.mjs — the part that makes §G true.
//
// §G: "Golem must STOP defaulting to inventing every Roblox GUI and every visual
// primitive from a blank canvas." A library nothing reads does not change that, so
// this is the read path: a brief in, a design brief out, ready to be put in front
// of a generator BEFORE it starts writing.
//
// Ranking is deliberately boring and explainable. §AK's warning about visual
// metrics applies here too: a clever relevance score that nobody can audit is a
// score that will quietly start returning the wrong grammar. Every point a rule
// earns is attributable to one clause of the brief.

import { RULES, COMPONENTS, STYLE_FAMILIES, PLATFORMS } from './rules.mjs';

/** A rule scores only for things the brief actually asked about. */
export function score(rule, brief = {}) {
  let points = 0;
  const why = [];

  if (brief.component) {
    if (rule.component === brief.component) {
      points += 10;
      why.push(`component ${rule.component}`);
    } else if (rule.component === 'layout' || rule.component === 'motion') {
      // Layout and motion rules are cross-cutting: they apply to whatever is being
      // built. Worth less than an exact hit, never zero.
      points += 3;
      why.push(`cross-cutting ${rule.component}`);
    }
  }

  if (brief.styleFamily) {
    if (rule.styleFamilies.includes(brief.styleFamily)) {
      points += 6;
      why.push(`style ${brief.styleFamily}`);
    }
  }

  if (brief.platform && rule.platforms?.includes(brief.platform)) {
    points += 3;
    why.push(`platform ${brief.platform}`);
  }

  // A rule that has been SEEN to work outranks one that has only been written
  // down. This is the same standard §A applies to capabilities.
  //
  // It is a TIE-BREAK AMONG RULES THAT ALREADY MATCHED, never an entry ticket.
  // Awarding it unconditionally was a real defect and it only became visible once
  // the library knew more than one genre: every validated rule cleared `minPoints`
  // on its own, so a `horror` brief returned two horror rules followed by ten
  // cartoon-simulator ones, and `composeBrief` handed all twelve to the generator.
  // That is §L's overfitting failure arriving through the retrieval layer instead
  // of through the rule set — the library would have taught the simulator look to
  // every genre that asked it a question.
  if (points > 0 && rule.provenance?.validated && !/not yet/i.test(rule.provenance.validated)) {
    points += 2;
    why.push('validated');
  }

  if (brief.need) {
    const needle = String(brief.need).toLowerCase();
    const hay = `${rule.rule} ${rule.because} ${rule.prevents}`.toLowerCase();
    // Whole-word-ish match on the brief's own terms, so "shop" does not match
    // "workshop" and inflate a rule that is about something else.
    const terms = needle.split(/[^a-z0-9]+/).filter((t) => t.length > 3);
    const hits = terms.filter((t) => hay.includes(t));
    if (hits.length > 0) {
      points += Math.min(6, hits.length * 2);
      why.push(`need: ${hits.join(',')}`);
    }
  }

  return { points, why };
}

/** Ranked rules for a brief. Ties break on id so two identical queries agree. */
export function retrieve(brief = {}, { rules = RULES, limit = 12, minPoints = 1 } = {}) {
  if (brief.component && !COMPONENTS.includes(brief.component)) {
    throw new Error(`retrieve: unknown component "${brief.component}"`);
  }
  if (brief.styleFamily && !STYLE_FAMILIES.includes(brief.styleFamily)) {
    throw new Error(`retrieve: unknown style family "${brief.styleFamily}"`);
  }
  // A typo'd platform silently scores nothing, which looks exactly like "no rule
  // covers this platform" — the one answer this library must never give by accident.
  if (brief.platform && !PLATFORMS.includes(brief.platform)) {
    throw new Error(`retrieve: unknown platform "${brief.platform}"`);
  }
  return rules
    .map((rule) => ({ rule, ...score(rule, brief) }))
    .filter((r) => r.points >= minPoints)
    .sort((a, b) => b.points - a.points || a.rule.id.localeCompare(b.rule.id))
    .slice(0, limit);
}

/**
 * Turn retrieved rules into the text a generator is given BEFORE it writes.
 *
 * Shaped as constraints with their reasons, not as a style description. A
 * generator handed "make it cartoony" invents; a generator handed "a press is an
 * instant depth change, because easing into a press feels soft" has something it
 * can either follow or knowingly depart from.
 *
 * Concrete `tokens` are included ONLY for rules we own. That is not a formatting
 * choice — see assertLicenceSafety in rules.mjs.
 */
export function composeBrief(brief = {}, options = {}) {
  const hits = retrieve(brief, options);
  const lines = [];
  const target = [brief.styleFamily, brief.component].filter(Boolean).join(' / ') || 'this interface';
  lines.push(`DESIGN CONSTRAINTS for ${target}.`);
  lines.push(
    'These are extracted from work that has been built and reviewed. Follow them, or',
    'state why this case is different. Do not start from a blank ScreenGui.',
    '',
  );
  for (const { rule } of hits) {
    lines.push(`- ${rule.rule}`);
    lines.push(`    why: ${rule.because}`);
    lines.push(`    prevents: ${rule.prevents}`);
    if (rule.tokens && rule.provenance.kind !== 'reference-only') {
      const toks = Object.entries(rule.tokens).map(([k, v]) => `${k}=${v}`).join(', ');
      lines.push(`    values: ${toks}`);
    }
    lines.push('');
  }
  if (hits.length === 0) {
    lines.push('- (no rule matched this brief; the library does not yet cover it)');
  }
  return { text: lines.join('\n'), used: hits.map((h) => h.rule.id), count: hits.length };
}

/** Which style families and components the library can actually speak to yet. */
export function coverage({ rules = RULES } = {}) {
  const byComponent = {};
  const byFamily = {};
  for (const r of rules) {
    byComponent[r.component] = (byComponent[r.component] ?? 0) + 1;
    for (const f of r.styleFamilies) byFamily[f] = (byFamily[f] ?? 0) + 1;
  }
  const uncovered = {
    components: COMPONENTS.filter((c) => !byComponent[c]),
    styleFamilies: STYLE_FAMILIES.filter((f) => !byFamily[f]),
  };
  return { byComponent, byFamily, uncovered, total: rules.length };
}
