// The name a new project gets when the person has typed nothing. One click creates it, so the app has to choose one.
//
// "Untitled piece 3": the word is the product's own (a person asks for pieces of a game), the number is one more than the
// highest "Untitled piece N" the person already has, so a name is never reused while its project exists and deleting an old
// one never hands the same name to a new one. Anything else the person called a project is left alone: only the exact
// pattern counts, so "Untitled piece 2 final" and "my Untitled piece 9" do not move the number.
//
// No imports: loaded directly by `node --test`.

export const UNTITLED_PREFIX = 'Untitled piece';

/** Every name this app has given, and only those. Digits only, no sign, no leading zero, so one name has one number. */
const GENERATED = /^Untitled piece ([1-9]\d{0,8})$/;

/** The next generated name, given the names the person's projects already carry (archived ones included). */
export function nextProjectName(existing: readonly (string | null | undefined)[]): string {
  let highest = 0;
  for (const name of existing) {
    const match = typeof name === 'string' ? GENERATED.exec(name.trim()) : null;
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `${UNTITLED_PREFIX} ${highest + 1}`;
}
