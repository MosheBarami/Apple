/*
 * ROLLING DIGITS, for a figure that changes while the reader watches it.
 *
 * Re-implemented from the behaviour of Motion's "Number counter" and "Number formatting" examples.
 * Those ship under the Motion+ licence, so no code is taken from them: each digit is a column of
 * 0-9 that slides to its value, columns are matched from the right so a unit ("$", "Credits")
 * stays put while the magnitude changes, and new columns fade in. The formatting is whatever
 * string the caller hands over (Intl in practice), so "$12" can become "$0.07" and "2,310" can
 * become "12,600" without the component knowing what a currency is.
 *
 * Screen readers get the plain string: the columns are aria-hidden and a visually hidden copy of
 * the text sits beside them. Before the script runs the element holds plain server-rendered text,
 * so a page without JavaScript still reads correctly.
 */

type Col = HTMLSpanElement & { rnDigit?: boolean; rnChar?: string };

const DIGIT = /\d/;

function makeCol(ch: string): Col {
  const col = document.createElement('span') as Col;
  col.className = 'rn-col';
  col.rnChar = ch;
  col.rnDigit = DIGIT.test(ch);
  if (col.rnDigit) {
    const strip = document.createElement('span');
    strip.className = 'rn-strip';
    for (let i = 0; i < 10; i += 1) {
      const d = document.createElement('span');
      d.textContent = String(i);
      strip.appendChild(d);
    }
    col.appendChild(strip);
  } else {
    col.textContent = ch === ' ' ? ' ' : ch;
  }
  return col;
}

/** Show `text` in `host`, rolling each digit from its current value. `instant` skips the motion. */
export function rollTo(host: HTMLElement, text: string, instant = false): void {
  let sr = host.querySelector<HTMLElement>(':scope > .rn-sr');
  let vis = host.querySelector<HTMLElement>(':scope > .rn-vis');
  if (!sr || !vis) {
    host.textContent = '';
    host.classList.add('rn');
    sr = document.createElement('span');
    sr.className = 'rn-sr';
    vis = document.createElement('span');
    vis.className = 'rn-vis';
    vis.setAttribute('aria-hidden', 'true');
    host.append(sr, vis);
    instant = true;
  }
  sr.textContent = text;

  const old: (Col | null)[] = Array.from(vis.children) as Col[];
  const chars = [...text];
  const next: Col[] = [];
  const fresh = new Set<Col>();
  for (let i = chars.length - 1, j = old.length - 1; i >= 0; i -= 1, j -= 1) {
    const ch = chars[i]!;
    const prev = j >= 0 ? old[j] : null;
    const digit = DIGIT.test(ch);
    if (prev && (prev.rnDigit ? digit : !digit && prev.rnChar === ch)) {
      next.unshift(prev);
      old[j] = null;
    } else {
      const col = makeCol(ch);
      fresh.add(col);
      next.unshift(col);
    }
  }

  vis.classList.toggle('rn-still', instant);
  vis.replaceChildren(...next);
  for (const col of fresh) if (col.rnDigit && !instant) col.style.setProperty('--rn-d', '0');
  // One reflow so a new column starts at 0 and slides, rather than appearing at its value.
  void vis.offsetWidth;
  next.forEach((col, i) => {
    col.rnChar = chars[i];
    if (fresh.has(col) && !instant) col.classList.add('rn-enter');
    if (col.rnDigit) col.style.setProperty('--rn-d', chars[i]!);
  });
  if (instant) {
    void vis.offsetWidth;
    vis.classList.remove('rn-still');
  }
}
