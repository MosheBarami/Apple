/**
 * READ A RULE OUT OF THE SHIPPED STYLESHEET, WITHOUT LYING ABOUT IT.
 *
 * NOT A TEST FILE — a helper, named so node --test does not collect it.
 *
 * Seven times in one session a check reported a shipped rule as missing because the check could not
 * see it. Three distinct causes, all of them the reader's fault:
 *
 *   1. the minifier rewrites `::after` to `:after`, so a literal search for the source spelling
 *      finds nothing;
 *   2. a selector LIST puts the interesting element in the middle — `button:focus-visible,
 *      a:focus-visible, input:focus-visible` — so a regex anchored at the start of the selector
 *      misses it;
 *   3. a greedy or first-match regex returns a DIFFERENT rule that happens to mention the same
 *      element, and the caller reads the wrong body without noticing.
 *
 * Each time, the honest-looking next step was to "fix" correct code. So the reader gets written
 * once, here, and every check uses it.
 */

/** Every rule whose selector list contains `selector` as one of its comma-separated parts. */
export function rulesFor(css, selector) {
  const want = normalise(selector);
  const out = [];
  // One pass with a cursor, so a rule nested inside @media is reached at its own depth instead of
  // being swallowed by its wrapper. `head` is whatever has accumulated since the last brace or
  // semicolon — for a style rule that is its selector list, for an at-rule it starts with '@'.
  let head = '';
  let i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '{') {
      const sel = head.trim();
      let depth = 0, end = -1;
      for (let j = i; j < css.length; j++) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
      }
      if (end === -1) break;
      if (sel.startsWith('@')) {
        // An at-rule wrapper: descend into it rather than treating its body as declarations.
        i += 1;
        head = '';
        continue;
      }
      const body = css.slice(i + 1, end);
      if (sel.split(',').some((part) => normalise(part) === want)) out.push({ selector: sel, body: body.trim() });
      i = end + 1;
      head = '';
      continue;
    }
    if (c === '}' || c === ';') { head = ''; i += 1; continue; }
    head += c;
    i += 1;
  }
  return out;
}

/** `::after` and `:after` are the same thing; whitespace is not meaningful between combinators. */
function normalise(sel) {
  return sel.trim().toLowerCase().replace(/::/g, ':').replace(/\s+/g, ' ');
}

/** True when ANY rule for this selector declares the property. */
export function declares(css, selector, property) {
  return rulesFor(css, selector).some((r) => new RegExp('(^|;)\\s*' + property + '\\s*:', 'i').test(r.body));
}

/** The last declared value of a property for a selector, or null. Later rules win, as in CSS. */
export function valueOf(css, selector, property) {
  let value = null;
  for (const r of rulesFor(css, selector)) {
    const m = new RegExp('(?:^|;)\\s*' + property + '\\s*:\\s*([^;]+)', 'i').exec(r.body);
    if (m) value = m[1].trim();
  }
  return value;
}
