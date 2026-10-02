// The old product name, for tests that assert it is ABSENT from something a stranger reads.
//
// An absence check has to name the thing it forbids. Writing that name in every test would put it
// back in the tree forty times and the guard (scripts/check-no-golem.mjs) would rightly object, so
// the pattern lives here, once, openly allowlisted, and the tests import it. A test that merely
// polices SOURCE text does not belong here: the guard already does that for the whole repository.
// Use this only where the thing being checked is rendered or printed output (a page, a CLI help
// screen, a quoted run).
//
// REMOVAL: delete this file, and the assertions that import it, when the guard is retired.

/** Matches the old name in any case. */
export const LEGACY_NAME = /golem/i;

/** The old name as an identifier or a mode alias: `GolemMode`, `GolemGlyph` and the like. */
export const LEGACY_IDENTIFIER = /Golem[A-Z][A-Za-z]*/;
