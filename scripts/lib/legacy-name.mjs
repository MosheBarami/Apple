// The product's former names, for tests that assert they are ABSENT from something a stranger reads.
//
// An absence check has to name the thing it forbids. Writing the names in every test would put them
// back in the tree many times and the guard (scripts/check-old-names.mjs) would rightly object, so
// the patterns live here, once, openly allowlisted, and the tests import them. A test that merely
// polices SOURCE text does not belong here: the guard already does that for the whole repository.
// Use this only where the thing being checked is rendered or printed output (a page, a CLI help
// screen, a quoted run).
//
// "apple" is also a fruit, a company and a CSS keyword (`-apple-system`, `apple-touch-icon`). The
// patterns skip those, so a page that sets the system font stack is not reported as naming the product.
//
// REMOVAL: delete this file, and the assertions that import it, when the guard is retired.

/** Matches a former name in any case, outside the third-party spellings. */
export const LEGACY_NAME = /golem|(?<![-\w])apple(?![-\w]*(?:touch-icon|system|mobile-web-app))(?! Inc| Silicon| M\d| Color Emoji)/i;

/** A former name as an identifier or a mode alias: `GolemMode`, `AppleGlyph` and the like. */
export const LEGACY_IDENTIFIER = /(?:Golem|Apple)[A-Z][A-Za-z]*/;
