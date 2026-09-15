// Where you left the interface.
//
// The rail's collapsed state already survives a reload (`shell.tsx`). Nothing else did: the drawer
// you had open, the scope tab you were reading, the filters you set. Every one of them reset on
// every navigation, so the shape of the app was whatever the last route mount decided rather than
// what the user chose.
//
// THE RULE THAT MAKES RESTORING SAFE IS VALIDATION ON THE WAY IN. A stored value is written by a
// previous version of this app, or by hand, and restoring it blindly is how a build that no longer
// has a "credits" drawer opens one: the state says open, nothing renders, and the user is looking
// at an interface that is lying about itself. Every read is checked against what THIS build can
// actually show, and anything else falls back to the default.
//
// Storage is optional everywhere. It throws in a private window, and a preference is never worth
// taking a route down for.

const PREFIX = 'apple.view.';

/** Remember one choice out of a known set. */
export function readViewChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Write one choice, or forget it entirely when it is null. */
export function writeViewChoice(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* storage unavailable — the choice simply does not persist */
  }
}

/**
 * Remember a structured choice.
 *
 * `normalise` is not optional and not a cast: it is the only thing standing between a stored shape
 * from an older build and a component rendering something that no longer exists.
 */
export function readViewState<T>(key: string, normalise: (raw: unknown) => T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return normalise(raw === null ? null : JSON.parse(raw));
  } catch {
    return normalise(null);
  }
}

export function writeViewState(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable, or the value is not serialisable — it simply does not persist */
  }
}

/** Every stored view preference on this device. Cleared at sign-out with the rest of the local state. */
export function clearAllViewState(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(PREFIX)) doomed.push(key);
    }
    for (const key of doomed) window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable — there is nothing persisted to clear */
  }
}
