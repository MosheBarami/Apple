/**
 * WHAT A set_properties CALL ACTUALLY CHANGED, PER PROPERTY.
 *
 * The generative-UI schema has carried `changed` and `previous` on every PropertyRow since it was
 * written, and the renderer draws `<s>{previous}</s> → {value}` for them. Nothing in the product
 * ever set either one: a repo-wide grep found them filled in exactly one place, the design gallery.
 * So the block that exists to show a before→after only ever showed an after.
 *
 * THE RULE THIS MODULE ENFORCES, and the reason it is a module rather than four lines inline: a
 * value that was not read is not a value we can say changed. When the prior read fails, every row
 * comes back as a plain value — no `changed`, no `previous` — because a panel that marks rows
 * changed on the strength of having written to them is asserting something it never observed, and
 * this codebase has shipped that shape before.
 *
 * `display` is handed in rather than imported. The one formatter lives in tools.ts beside the other
 * producer of this block (get_instance), and a second copy here would be free to drift into
 * rendering the same Vector3 two ways in two panels; importing it would make a cycle, since tools.ts
 * imports this file.
 */
export interface PropertyRowOut {
  name: string;
  value: string;
  changed?: boolean;
  previous?: string;
}

export interface PropertyGroupOut {
  name: string;
  rows: PropertyRowOut[];
}

/** What the plugin reported the instance held before the write, or null when it could not be read. */
export interface PriorState {
  props?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
}

export function propertyChangeGroups(
  written: { props?: Record<string, unknown>; attributes?: Record<string, unknown> },
  prior: PriorState | null,
  display: (value: unknown) => string,
): PropertyGroupOut[] {
  const groups: PropertyGroupOut[] = [];
  for (const [name, wrote, had] of [
    ['Properties', written.props, prior?.props] as const,
    ['Attributes', written.attributes, prior?.attributes] as const,
  ]) {
    const rows = Object.entries(wrote ?? {}).map(([key, value]) => row(key, value, prior, had, display));
    // An empty group renders as a heading with nothing under it, which reads as a panel that failed
    // to load. Dropped, exactly as get_instance drops its own empty groups.
    if (rows.length) groups.push({ name, rows });
  }
  return groups;
}

function row(
  key: string,
  value: unknown,
  prior: PriorState | null,
  had: Record<string, unknown> | undefined,
  display: (value: unknown) => string,
): PropertyRowOut {
  const shown = display(value);
  // We did not look. Say only what was written.
  if (prior === null) return { name: key, value: shown };
  // Nothing was there before. A change, but with nothing to strike through — the renderer omits the
  // strike when `previous` is absent, so this reads as a new value rather than as a change FROM a
  // dash, which would be a claim about a value that did not exist.
  if (!had || !(key in had)) return { name: key, value: shown, changed: true };
  const was = display(had[key]);
  // Set to what it already was. Worth showing — it is a true fact about the run — and worth NOT
  // marking: a panel that flags eight rows when one moved teaches the reader to ignore the flags.
  if (was === shown) return { name: key, value: shown };
  return { name: key, value: shown, changed: true, previous: was };
}
