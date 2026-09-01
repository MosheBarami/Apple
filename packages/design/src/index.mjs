// The package entry point.
//
// Consumers get the whole surface from one specifier rather than deep-importing `src/`,
// which would couple them to this package's internal layout and make any reorganisation
// here a breaking change over there.
export { RULES, COMPONENTS, STYLE_FAMILIES, PROVENANCE_KINDS, assertLicenceSafety } from './rules.mjs';
export { score, retrieve, composeBrief, coverage } from './retrieve.mjs';
//[[ THE WHOLE CHECK SURFACE, and it was not whole.
//
//   `checkInertSurfaceFlags`, `checkSafeArea`, `checkGamepadReachability`,
//   `checkPaletteCollisions` and `checkCounterMotionAgreement` all existed in `checks.mjs`,
//   all had tests, and none of them was exported here — so a consumer importing the package
//   could not reach five of the eleven mechanised rules, and the first one that tried
//   (`packages/evals/src/design-checks.mjs`) failed to load. `ENFORCED_RULE_IDS` was likewise
//   unreachable, which meant nothing outside this package could even enumerate what the
//   library claims to enforce. ]]
export {
  ENFORCED_RULE_IDS,
  checkClusterOverlap,
  checkWaitContracts,
  checkPriceAgreement,
  checkMotionGate,
  checkSafeArea,
  checkGamepadReachability,
  checkPaletteCollisions,
  checkInertSurfaceFlags,
  checkCounterMotionAgreement,
  checkFocusFeedback,
  checkTextScaleOrder,
  audit,
} from './checks.mjs';
