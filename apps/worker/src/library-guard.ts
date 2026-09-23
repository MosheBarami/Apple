// "This class comes from a library tool, never by hand" (D-UIONLY-1), as one reusable check.
//
// A rule names a set of Roblox classes and the library tool that builds them. The generic writers
// (create_instances, run_luau, edit_script) ask this module before anything reaches Studio, and a
// refusal names the exact library call to make instead. The UI rule lives in ui-components.ts;
// another library (models, sounds, effects) adds its own rule the same way.
//
// Luau is judged on the text the caller hands in AFTER comments are stripped (and, where the
// caller has it, after literals are folded): tools.ts owns that scanner, so this module takes the
// variants rather than importing tools.ts back.

export interface LibraryRule {
  /** The decision that set the rule, quoted in every refusal. */
  decision: string;
  /** What the classes are, in words, e.g. "game UI". */
  what: string;
  classes: ReadonlySet<string>;
  /** The library call that replaces creating `className` by hand. */
  suggest: (className: string) => string;
}

export interface LibraryRefusal {
  error: string;
  refusedClasses: string[];
}

/** Every className in create_instances items, children included. */
function classesIn(items: unknown, out: string[] = []): string[] {
  if (!Array.isArray(items)) return out;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.className === 'string') out.push(item.className);
    classesIn(item.children, out);
  }
  return out;
}

function message(rule: LibraryRule, found: string[], how: string): string {
  const unique = [...new Set(found)];
  return (
    `Refused (${rule.decision}): ${how} ${unique.join(', ')} by hand. Every piece of ${rule.what} comes from the stored library, never from a hand-made instance. ` +
    `Instead: ${unique.map((c) => `${c} -> ${rule.suggest(c)}`).join('; ')}. Nothing was sent to Studio.`
  );
}

/** A create_instances payload that makes a class of the rule, or null. */
export function refuseLibraryItems(items: unknown, rule: LibraryRule): LibraryRefusal | null {
  const found = classesIn(items).filter((c) => rule.classes.has(c));
  return found.length ? { error: message(rule, found, 'this would create'), refusedClasses: [...new Set(found)] } : null;
}

// `Instance.new("X")`, `Instance.new "X"`, `Instance.new[[X]]`, `Instance["new"]("X")`.
const NEW_CALL = /\bInstance\s*(?:\.\s*new|\[\s*(["'])new\1\s*\])\s*(?:\(\s*)?(?:(["'])([A-Za-z]\w*)\2|\[(=*)\[([A-Za-z]\w*)\]\4\])/g;
// Any reference to the constructor, literal argument or not (`Instance.new(kind)`, `local new = Instance.new`).
const NEW_REF = /\bInstance\s*(?:\.\s*new|\[\s*(["'])new\1\s*\])/g;
// A class name read, not created: `x:IsA("Frame")`, `FindFirstChildOfClass("Frame")`, `.ClassName == "Frame"`.
const CLASS_READ = /(?:\bIsA|\bFindFirst\w*|\bWaitForChild|\bGetPropertyChangedSignal)\s*\(\s*(["'])\w+\1|\bClassName\s*[~=]=\s*(["'])\w+\2/g;

/**
 * How many instances of the rule's classes this Luau makes by hand: each `Instance.new("X")` with
 * X in the rule, plus each constructor call whose class is not a literal when a class name of the
 * rule is spelled somewhere in the code (outside a class check) — `local k = "Frame"; Instance.new(k)`.
 */
export function libraryCreationsInLuau(variants: readonly string[], rule: LibraryRule): { count: number; classes: string[] } {
  let best = { count: 0, classes: [] as string[] };
  for (const v of variants) {
    const classes: string[] = [];
    let literal = 0;
    for (const m of v.matchAll(NEW_CALL)) {
      literal += 1;
      const cls = m[3] ?? m[5] ?? '';
      if (rule.classes.has(cls)) classes.push(cls);
    }
    const computed = [...v.matchAll(NEW_REF)].length - literal;
    if (computed > 0) {
      const spelled = [...v.replace(CLASS_READ, ' ').matchAll(/(["'])([A-Za-z]\w*)\1|\[(=*)\[([A-Za-z]\w*)\]\3\]/g)]
        .map((m) => m[2] ?? m[4] ?? '')
        .filter((c) => rule.classes.has(c));
      if (spelled.length) for (let i = 0; i < computed; i++) classes.push(spelled[Math.min(i, spelled.length - 1)]!);
    }
    if (classes.length > best.count) best = { count: classes.length, classes };
  }
  return best;
}

/**
 * Luau that creates the rule's classes by hand, or null. `before` is the script as it stands, for
 * edits: a script that already made UI can still be edited, it just cannot make MORE of it.
 */
export function refuseLibraryLuau(variants: readonly string[], rule: LibraryRule, before?: readonly string[]): LibraryRefusal | null {
  const after = libraryCreationsInLuau(variants, rule);
  const had = before ? libraryCreationsInLuau(before, rule).count : 0;
  if (after.count <= had) return null;
  return {
    error:
      message(rule, after.classes, 'this Luau would Instance.new') +
      ' A script uses the inserted instance by path instead (e.g. player.PlayerGui:WaitForChild("<name>")), and may :Clone() it; comments are ignored by this check.',
    refusedClasses: [...new Set(after.classes)],
  };
}
