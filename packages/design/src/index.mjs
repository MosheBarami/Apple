// The package entry point.
//
// Consumers get the whole surface from one specifier rather than deep-importing `src/`,
// which would couple them to this package's internal layout and make any reorganisation
// here a breaking change over there.
export { RULES, COMPONENTS, STYLE_FAMILIES, PROVENANCE_KINDS, assertLicenceSafety } from './rules.mjs';
export { score, retrieve, composeBrief, coverage } from './retrieve.mjs';
export { checkClusterOverlap, checkWaitContracts, checkPriceAgreement, checkMotionGate, checkFocusFeedback, audit } from './checks.mjs';
